import { NextRequest, NextResponse } from "next/server"
import { eq, and, gte, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { videoGenerations, uploads, user } from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { getVideoProvider } from "@/lib/providers/video/registry"
import { getVideoModel, estimateVideoCost } from "@/lib/providers/video-models"
import { downloadBuffer } from "@/lib/storage/s3"
import { humanizeVideoError } from "@/lib/video/humanize-error"
import { headers } from "next/headers"

// Все видеомодели идут через OpenRouter (тот же ключ, что у картинок/чата)
const VIDEO_PROVIDER = "openrouter"

interface GenerateVideoBody {
  model: string
  prompt: string
  params?: {
    duration?: number | string
    resolution?: string
    aspect_ratio?: string
    generate_audio?: boolean | string
  }
  /** Опциональный референс-кадр (image-to-video) — id из таблицы uploads */
  uploadId?: string
}

export async function POST(request: NextRequest) {
  try {
    // 1. Авторизация
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }

    // 2. Парсинг и валидация
    const body = (await request.json()) as GenerateVideoBody
    const { model, prompt, uploadId } = body
    const rawParams = body.params || {}

    if (!model || !prompt?.trim()) {
      return NextResponse.json(
        { error: "Модель и промпт обязательны" },
        { status: 400 }
      )
    }

    const videoModel = getVideoModel(model)
    if (!videoModel) {
      return NextResponse.json(
        { error: `Неизвестная видеомодель: ${model}` },
        { status: 400 }
      )
    }

    // Санитизация параметров по возможностям модели (защита от кривых значений)
    const duration = videoModel.durations.includes(Number(rawParams.duration))
      ? Number(rawParams.duration)
      : videoModel.durations[0]
    const resolution = videoModel.resolutions.includes(String(rawParams.resolution))
      ? String(rawParams.resolution)
      : (videoModel.resolutions.includes("720p") ? "720p" : videoModel.resolutions[0])
    const aspectRatio = videoModel.aspectRatios.includes(String(rawParams.aspect_ratio))
      ? String(rawParams.aspect_ratio)
      : (videoModel.aspectRatios.includes("16:9") ? "16:9" : videoModel.aspectRatios[0])
    const generateAudio = videoModel.supportsAudio
      ? rawParams.generate_audio === true || rawParams.generate_audio === "true"
      : false

    // 3. Режим: image-to-video только для поддерживающих моделей
    const wantsImage = Boolean(uploadId)
    const supportsI2V = videoModel.modes.includes("i2v")
    if (wantsImage && !supportsI2V) {
      return NextResponse.json(
        { error: `Модель ${videoModel.name} не поддерживает image-to-video. Уберите картинку или выберите другую модель.` },
        { status: 400 }
      )
    }
    // Зеркальный случай: модель умеет ТОЛЬКО i2v (напр. x-ai/grok-imagine-video-1.5).
    // Без этой проверки запрос молча уходил бы как t2v и падал уже у провайдера.
    if (!wantsImage && !videoModel.modes.includes("t2v")) {
      return NextResponse.json(
        { error: `Модель ${videoModel.name} работает только из картинки (image-to-video). Загрузите стартовый кадр или выберите другую модель.` },
        { status: 400 }
      )
    }
    const mode = wantsImage && supportsI2V ? "i2v" : "t2v"

    const isAdmin = session.user.role === "admin"
    const estimate = estimateVideoCost(videoModel, {
      durationSeconds: duration,
      resolution,
      audio: generateAudio,
    })

    // 4. Лимиты пользователя
    const [userData] = await db
      .select({
        dailyLimit: user.dailyLimit,
        costLimit: user.costLimit,
        totalSpent: user.totalSpent,
        maxGenerations: user.maxGenerations,
        banned: user.banned,
        banReason: user.banReason,
      })
      .from(user)
      .where(eq(user.id, session.user.id))

    if (userData?.banned) {
      return NextResponse.json(
        {
          error: userData.banReason
            ? `Аккаунт заблокирован: ${userData.banReason}`
            : "Аккаунт заблокирован",
        },
        { status: 403 }
      )
    }

    if (!isAdmin && userData) {
      // 4a. Бюджет — видео платное, учитываем оценку стоимости
      const spent = parseFloat(userData.totalSpent) || 0
      const limit = parseFloat(userData.costLimit) || 0
      if (limit > 0 && spent + estimate > limit) {
        return NextResponse.json(
          { error: `Лимит бюджета исчерпан или клип слишком дорогой ($${limit.toFixed(2)}). Сократите длительность.` },
          { status: 429 }
        )
      }

      // 4b. Дневной лимит — по таблице video_generations
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const [todayCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(videoGenerations)
        .where(
          and(
            eq(videoGenerations.userId, session.user.id),
            gte(videoGenerations.createdAt, todayStart)
          )
        )
      if (todayCount.count >= userData.dailyLimit) {
        return NextResponse.json(
          { error: `Дневной лимит видео исчерпан (${userData.dailyLimit})` },
          { status: 429 }
        )
      }

      // 4c. Общий лимит генераций
      if (userData.maxGenerations !== null) {
        const [totalCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(videoGenerations)
          .where(eq(videoGenerations.userId, session.user.id))
        if (totalCount.count >= userData.maxGenerations) {
          return NextResponse.json(
            { error: `Общий лимит генераций исчерпан (${userData.maxGenerations})` },
            { status: 429 }
          )
        }
      }
    }

    // 5. Ключ OpenRouter (тот же, что у картинок)
    const apiKey = await getDecryptedApiKey(session.user.id, VIDEO_PROVIDER)
    if (!apiKey) {
      return NextResponse.json(
        { error: "API ключ OpenRouter не настроен. Добавьте его в Настройках." },
        { status: 400 }
      )
    }

    // 6. Для i2v — достаём референс-кадр и кодируем в data:-URI
    let frameImageDataUrl: string | undefined
    if (mode === "i2v") {
      const [row] = await db
        .select({
          s3Key: uploads.s3Key,
          mimeType: uploads.mimeType,
          userId: uploads.userId,
        })
        .from(uploads)
        .where(eq(uploads.id, uploadId!))

      if (!row) {
        return NextResponse.json({ error: "Загруженный кадр не найден" }, { status: 404 })
      }
      if (row.userId !== session.user.id && !isAdmin) {
        return NextResponse.json({ error: "Нет доступа к файлу" }, { status: 403 })
      }
      const { buffer, contentType } = await downloadBuffer(row.s3Key)
      const mime = contentType.startsWith("image/") ? contentType : row.mimeType
      frameImageDataUrl = `data:${mime};base64,${buffer.toString("base64")}`
    }

    // 7. Создаём запись (processing)
    const params = {
      duration,
      resolution,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
    }
    const [generation] = await db
      .insert(videoGenerations)
      .values({
        userId: session.user.id,
        provider: VIDEO_PROVIDER,
        model,
        prompt: prompt.trim(),
        mode,
        params,
        status: "processing",
      })
      .returning({ id: videoGenerations.id })

    // 8. Отправляем задачу провайдеру
    try {
      const providerAdapter = getVideoProvider(VIDEO_PROVIDER)
      const submitResult = await providerAdapter.submit({
        model,
        prompt: prompt.trim(),
        params,
        apiKey,
        frameImageDataUrl,
      })

      await db
        .update(videoGenerations)
        .set({ providerJobId: submitResult.providerJobId })
        .where(eq(videoGenerations.id, generation.id))

      return NextResponse.json({
        videoGenerationId: generation.id,
        status: "processing",
        estimatedCost: estimate,
      })
    } catch (submitError) {
      const raw =
        submitError instanceof Error ? submitError.message : "Не удалось отправить задачу"
      console.error(`[video/generate] ${model}:`, raw)
      const message = humanizeVideoError(raw)
      await db
        .update(videoGenerations)
        .set({ status: "error", errorMessage: message, completedAt: new Date() })
        .where(eq(videoGenerations.id, generation.id))
      return NextResponse.json({ error: message }, { status: 502 })
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Внутренняя ошибка сервера"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
