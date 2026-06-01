import { NextRequest, NextResponse } from "next/server"
import { eq, and, gte, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { generations, images, uploads, user } from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { getProvider } from "@/lib/providers/registry"
import { upload, ensureBucket, downloadBuffer } from "@/lib/storage/s3"
import { IMAGE_INPUT_MODELS } from "@/lib/capabilities"
import { headers } from "next/headers"

interface EditBody {
  /** Источник: либо ID картинки из библиотеки, либо ID свежезагруженного upload */
  imageId?: string
  uploadId?: string
  prompt: string
  provider?: string
  model?: string
  params?: Record<string, unknown>
  count?: number
}

// Какие модели мы умеем редактировать — единый источник правды в capabilities
const EDIT_CAPABLE_MODELS = IMAGE_INPUT_MODELS

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }

    const body = (await request.json()) as EditBody
    const { imageId, uploadId, prompt } = body
    const editProvider = body.provider || "openai"
    const editModel = body.model || "gpt-image-2"
    const editParams = body.params || {}
    const count = Math.min(Math.max(body.count || 1, 1), 4)

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt обязателен" }, { status: 400 })
    }
    if (!imageId && !uploadId) {
      return NextResponse.json(
        { error: "Нужен imageId (из библиотеки) или uploadId (загруженная картинка)" },
        { status: 400 }
      )
    }
    if (imageId && uploadId) {
      return NextResponse.json(
        { error: "Передавайте только imageId ИЛИ uploadId, не оба" },
        { status: 400 }
      )
    }

    if (!EDIT_CAPABLE_MODELS[editProvider]?.includes(editModel)) {
      return NextResponse.json(
        { error: `Модель ${editProvider}/${editModel} не поддерживает редактирование` },
        { status: 400 }
      )
    }

    const isAdmin = session.user.role === "admin"

    // Источник: либо ранее сгенерированная картинка, либо пользовательский upload.
    // Унифицируем в одной структуре чтобы дальше работать одинаково.
    let src: {
      s3Key: string
      format: string | null
      folderId: string | null
    }
    let parentImageId: string | null = null

    if (imageId) {
      const [row] = await db
        .select({
          id: images.id,
          s3Key: images.s3Key,
          format: images.format,
          folderId: images.folderId,
          generationUserId: generations.userId,
        })
        .from(images)
        .innerJoin(generations, eq(images.generationId, generations.id))
        .where(eq(images.id, imageId))

      if (!row) {
        return NextResponse.json({ error: "Изображение не найдено" }, { status: 404 })
      }
      if (row.generationUserId !== session.user.id && !isAdmin) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
      }
      src = { s3Key: row.s3Key, format: row.format, folderId: row.folderId }
      parentImageId = imageId
    } else {
      const [row] = await db
        .select({
          id: uploads.id,
          s3Key: uploads.s3Key,
          mimeType: uploads.mimeType,
          userId: uploads.userId,
        })
        .from(uploads)
        .where(eq(uploads.id, uploadId!))

      if (!row) {
        return NextResponse.json({ error: "Загруженный файл не найден" }, { status: 404 })
      }
      if (row.userId !== session.user.id && !isAdmin) {
        return NextResponse.json({ error: "Нет доступа к файлу" }, { status: 403 })
      }
      // mimeType → format ("image/png" → "png")
      const format = row.mimeType.split("/")[1] || null
      src = { s3Key: row.s3Key, format, folderId: null }
    }

    // Лимиты
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
      const spent = parseFloat(userData.totalSpent) || 0
      const limit = parseFloat(userData.costLimit) || 0
      if (limit > 0 && spent >= limit) {
        return NextResponse.json(
          { error: `Лимит бюджета исчерпан ($${limit.toFixed(2)})` },
          { status: 429 }
        )
      }

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const [todayCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(generations)
        .where(
          and(
            eq(generations.userId, session.user.id),
            gte(generations.createdAt, todayStart)
          )
        )
      if (todayCount.count >= userData.dailyLimit) {
        return NextResponse.json(
          { error: `Дневной лимит исчерпан (${userData.dailyLimit})` },
          { status: 429 }
        )
      }
    }

    // API ключ
    const apiKey = await getDecryptedApiKey(session.user.id, editProvider)
    if (!apiKey) {
      return NextResponse.json(
        { error: `API ключ для ${editProvider} не настроен` },
        { status: 400 }
      )
    }

    // Достаём исходник из S3
    const { buffer: srcBuffer, contentType: srcContentType } = await downloadBuffer(src.s3Key)
    const mimeType = srcContentType.startsWith("image/")
      ? srcContentType
      : `image/${src.format || "png"}`

    const providerAdapter = getProvider(editProvider)
    if (!providerAdapter.edit) {
      return NextResponse.json(
        { error: `Провайдер ${editProvider} не поддерживает редактирование` },
        { status: 400 }
      )
    }

    // Создаём новую generation-запись с типом edit
    const editPrompt = prompt.trim()
    const [generation] = await db
      .insert(generations)
      .values({
        userId: session.user.id,
        provider: editProvider,
        model: editModel,
        prompt: editPrompt,
        params: {
          ...editParams,
          _edit: true,
          // Для трассировки: либо родитель в библиотеке, либо upload-источник
          ...(parentImageId ? { parentImageId } : { uploadId }),
        },
        status: "processing",
        imagesCount: count,
      })
      .returning({ id: generations.id })

    try {
      const result = await providerAdapter.edit({
        model: editModel,
        prompt: editPrompt,
        params: editParams,
        count,
        apiKey,
        image: srcBuffer,
        imageMimeType: mimeType,
      })

      await ensureBucket()
      const savedImages: Array<{ id: string; url: string; width: number; height: number }> = []
      for (let i = 0; i < result.images.length; i++) {
        const img = result.images[i]
        const s3Key = `generations/${generation.id}/${i}.${img.format}`
        await upload(s3Key, img.data, `image/${img.format}`)

        const [saved] = await db
          .insert(images)
          .values({
            generationId: generation.id,
            s3Key,
            s3Url: s3Key,
            width: img.width,
            height: img.height,
            format: img.format,
            sizeBytes: img.data.length,
            // Наследуем папку оригинала, если он из библиотеки.
            // Для upload-источников folderId == null — попадает в корень.
            folderId: src.folderId,
            parentImageId,
            editPrompt,
          })
          .returning({ id: images.id })

        savedImages.push({
          id: saved.id,
          url: `/api/images/${saved.id}`,
          width: img.width,
          height: img.height,
        })
      }

      const cost = result.cost
      await db
        .update(generations)
        .set({ status: "done", cost: cost.toFixed(4), completedAt: new Date() })
        .where(eq(generations.id, generation.id))

      if (cost > 0) {
        await db
          .update(user)
          .set({
            totalSpent: sql`${user.totalSpent}::numeric + ${cost.toFixed(4)}::numeric`,
          })
          .where(eq(user.id, session.user.id))
      }

      return NextResponse.json({ generationId: generation.id, images: savedImages, cost })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Неизвестная ошибка"
      console.error(`[edit] ${editProvider}/${editModel}:`, message)
      await db
        .update(generations)
        .set({ status: "error", errorMessage: message, completedAt: new Date() })
        .where(eq(generations.id, generation.id))
      return NextResponse.json({ error: message }, { status: 502 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Внутренняя ошибка"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
