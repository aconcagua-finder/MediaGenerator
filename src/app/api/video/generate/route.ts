import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { videoGenerations, videoSources, uploads } from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { getVideoProvider } from "@/lib/providers/video/registry"
import {
  getVideoModel,
  estimateVideoCost,
  estimateV2VCost,
  isV2VModel,
  videoModelProvider,
} from "@/lib/providers/video-models"
import { downloadBuffer } from "@/lib/storage/s3"
import { humanizeVideoError } from "@/lib/video/humanize-error"
import { createMediaLink, revokeLinksForGeneration } from "@/lib/media-link/links"
import { LINK_TTL_MS } from "@/lib/media-link/token"
import { MAX_SOURCE_SECONDS, fileExtension } from "@/lib/video/source-limits"
import { checkVideoLimits } from "@/lib/video/limits"
import { headers } from "next/headers"

interface GenerateVideoBody {
  model: string
  prompt: string
  params?: {
    duration?: number | string
    resolution?: string
    aspect_ratio?: string
    generate_audio?: boolean | string
    /** Только Motion Control: `video` (до 30 сек) | `image` (до 10 сек) */
    character_orientation?: string
  }
  /** Опциональный референс-кадр (image-to-video) — id из таблицы uploads */
  uploadId?: string
  /** video-to-video: id загруженного исходника (`POST /api/video/source`) */
  sourceId?: string
  /** Motion Control: id картинки-персонажа из таблицы uploads */
  characterUploadId?: string
}

/** Kling Motion Control с ориентацией «как на картинке» принимает видео не длиннее 10 сек */
const ORIENTATION_IMAGE_MAX_SECONDS = 10

export async function POST(request: NextRequest) {
  try {
    // 1. Авторизация
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }

    // 2. Парсинг и валидация
    const body = (await request.json()) as GenerateVideoBody
    const { model, prompt, uploadId, sourceId, characterUploadId } = body
    const rawParams = body.params || {}

    const videoModel = model ? getVideoModel(model) : null
    if (!model) {
      return NextResponse.json({ error: "Модель и промпт обязательны" }, { status: 400 })
    }
    if (!videoModel) {
      return NextResponse.json(
        { error: `Неизвестная видеомодель: ${model}` },
        { status: 400 }
      )
    }
    const isV2V = isV2VModel(videoModel)
    if (!prompt?.trim() && !(isV2V && videoModel.promptOptional)) {
      return NextResponse.json(
        { error: "Модель и промпт обязательны" },
        { status: 400 }
      )
    }
    const promptText = (prompt ?? "").trim()

    const apiProvider = videoModelProvider(videoModel)
    const isAdmin = session.user.role === "admin"

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

    // 3. Режим
    let mode: "t2v" | "i2v" | "v2v"
    // v2v: исходник и вычисленная по нему оценка
    let source: {
      id: string
      s3Key: string
      contentType: string
      sizeBytes: number
      durationSeconds: number
      width: number | null
      height: number | null
      hasAudio: boolean
    } | null = null
    let characterUpload: { s3Key: string; mimeType: string; sizeBytes: number } | null = null
    let characterOrientation: "video" | "image" = "video"
    let estimate: number

    if (isV2V) {
      mode = "v2v"

      if (!sourceId) {
        return NextResponse.json(
          { error: "Загрузите исходное видео (mp4, mov или webm до 30 секунд)" },
          { status: 400 }
        )
      }
      const [row] = await db
        .select()
        .from(videoSources)
        .where(eq(videoSources.id, sourceId))
      if (!row || row.kind !== "video") {
        return NextResponse.json(
          { error: "Исходное видео не найдено — возможно, оно устарело. Загрузите его заново." },
          { status: 404 }
        )
      }
      if (row.userId !== session.user.id) {
        return NextResponse.json({ error: "Нет доступа к файлу" }, { status: 403 })
      }
      if (Date.now() - row.createdAt.getTime() > LINK_TTL_MS) {
        return NextResponse.json(
          { error: "Исходное видео загружено более суток назад и удалено. Загрузите его заново." },
          { status: 410 }
        )
      }
      const sourceSeconds = Number(row.durationSeconds)
      const maxSeconds = videoModel.maxSourceSeconds ?? MAX_SOURCE_SECONDS
      if (!(sourceSeconds > 0) || sourceSeconds > maxSeconds + 0.05) {
        return NextResponse.json(
          { error: `Исходное видео должно быть не длиннее ${maxSeconds} секунд` },
          { status: 400 }
        )
      }
      source = {
        id: row.id,
        s3Key: row.s3Key,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        durationSeconds: sourceSeconds,
        width: row.width,
        height: row.height,
        hasAudio: row.hasAudio,
      }

      if (videoModel.requiresCharacterImage) {
        if (!characterUploadId) {
          return NextResponse.json(
            { error: "Загрузите картинку персонажа — на него перенесутся движения из видео" },
            { status: 400 }
          )
        }
        const [img] = await db
          .select({
            s3Key: uploads.s3Key,
            mimeType: uploads.mimeType,
            sizeBytes: uploads.sizeBytes,
            userId: uploads.userId,
          })
          .from(uploads)
          .where(eq(uploads.id, characterUploadId))
        if (!img) {
          return NextResponse.json({ error: "Картинка персонажа не найдена" }, { status: 404 })
        }
        if (img.userId !== session.user.id && !isAdmin) {
          return NextResponse.json({ error: "Нет доступа к файлу" }, { status: 403 })
        }
        characterUpload = { s3Key: img.s3Key, mimeType: img.mimeType, sizeBytes: img.sizeBytes }

        characterOrientation = rawParams.character_orientation === "image" ? "image" : "video"
        if (characterOrientation === "image" && sourceSeconds > ORIENTATION_IMAGE_MAX_SECONDS + 0.05) {
          return NextResponse.json(
            { error: `При ориентации «как на картинке» видео должно быть не длиннее ${ORIENTATION_IMAGE_MAX_SECONDS} секунд` },
            { status: 400 }
          )
        }
      }

      estimate = estimateV2VCost(videoModel, sourceSeconds)
    } else {
      // image-to-video только для поддерживающих моделей
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
      mode = wantsImage && supportsI2V ? "i2v" : "t2v"
      estimate = estimateVideoCost(videoModel, {
        durationSeconds: duration,
        resolution,
        audio: generateAudio,
      })
    }

    // 4. Лимиты пользователя (бюджет, дневной и общий лимит, бан)
    const limitFailure = await checkVideoLimits({ userId: session.user.id, isAdmin, estimate })
    if (limitFailure) {
      return NextResponse.json({ error: limitFailure.error }, { status: limitFailure.status })
    }

    // 5. Ключ провайдера модели (OpenRouter — тот же, что у картинок; fal — отдельный)
    const apiKey = await getDecryptedApiKey(session.user.id, apiProvider)
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            apiProvider === "fal"
              ? "Нужен ключ fal.ai. Администратор добавляет его в Настройках."
              : "API ключ OpenRouter не настроен. Добавьте его в Настройках.",
        },
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
    const params: Record<string, unknown> = isV2V
      ? {
          // длительность результата = длительности исходника (для оценки и записи в библиотеку)
          duration: source!.durationSeconds,
          aspect_ratio: aspectRatio ?? "",
          source_id: source!.id,
          source_width: source!.width,
          source_height: source!.height,
          source_has_audio: source!.hasAudio,
          ...(videoModel.requiresCharacterImage
            ? { character_orientation: characterOrientation, character_upload_id: characterUploadId }
            : {}),
        }
      : {
          duration,
          resolution,
          aspect_ratio: aspectRatio,
          generate_audio: generateAudio,
        }
    const [generation] = await db
      .insert(videoGenerations)
      .values({
        userId: session.user.id,
        provider: apiProvider,
        model,
        prompt: promptText,
        mode,
        params,
        status: "processing",
      })
      .returning({ id: videoGenerations.id })

    // 8. Отправляем задачу провайдеру
    try {
      // v2v: провайдер принимает вход только по публичному HTTPS-URL — выдаём
      // временные ссылки (24 ч), отзываются при завершении задачи (finalize.ts)
      let sourceVideoUrl: string | undefined
      let characterImageUrl: string | undefined
      if (source) {
        sourceVideoUrl = await createMediaLink({
          s3Key: source.s3Key,
          contentType: source.contentType,
          sizeBytes: source.sizeBytes,
          purpose: "v2v-source",
          userId: session.user.id,
          generationId: generation.id,
          filename: `source.${fileExtension(source.s3Key) || "mp4"}`,
        })
      }
      if (characterUpload) {
        characterImageUrl = await createMediaLink({
          s3Key: characterUpload.s3Key,
          contentType: characterUpload.mimeType,
          sizeBytes: characterUpload.sizeBytes,
          purpose: "character-image",
          userId: session.user.id,
          generationId: generation.id,
          filename: `character.${fileExtension(characterUpload.s3Key) || "png"}`,
        })
      }

      const providerAdapter = getVideoProvider(apiProvider)
      const submitResult = await providerAdapter.submit({
        model,
        prompt: promptText,
        params: params as { duration?: number; resolution?: string; aspect_ratio?: string; generate_audio?: boolean },
        apiKey,
        frameImageDataUrl,
        sourceVideoUrl,
        characterImageUrl,
      })

      await db
        .update(videoGenerations)
        .set({
          providerJobId: submitResult.providerJobId,
          ...(submitResult.providerState
            ? { params: { ...params, providerState: submitResult.providerState } }
            : {}),
        })
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
      await revokeLinksForGeneration(generation.id).catch(() => {})
      return NextResponse.json({ error: message }, { status: 502 })
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Внутренняя ошибка сервера"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
