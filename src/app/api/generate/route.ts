import { NextRequest, NextResponse } from "next/server"
import { eq, and, gte, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { generations, images, user } from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { getProvider } from "@/lib/providers/registry"
import { upload, ensureBucket } from "@/lib/storage/s3"
import { headers } from "next/headers"

interface GenerateBody {
  provider: string
  model: string
  prompt: string
  params: Record<string, unknown>
  count: number
}

export async function POST(request: NextRequest) {
  try {
    // 1. Авторизация
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }

    // 2. Парсинг тела
    const body = (await request.json()) as GenerateBody
    const { provider, model, prompt, params, count } = body

    if (!provider || !model || !prompt?.trim()) {
      return NextResponse.json(
        { error: "Провайдер, модель и промпт обязательны" },
        { status: 400 }
      )
    }

    const imageCount = Math.min(Math.max(count || 1, 1), 10)

    // 3. Проверка дневного лимита
    const [userData] = await db
      .select({ dailyLimit: user.dailyLimit })
      .from(user)
      .where(eq(user.id, session.user.id))

    if (userData) {
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
          { error: `Дневной лимит генераций исчерпан (${userData.dailyLimit})` },
          { status: 429 }
        )
      }
    }

    // 4. Получить расшифрованный API ключ
    const apiKey = await getDecryptedApiKey(session.user.id, provider)
    if (!apiKey) {
      return NextResponse.json(
        { error: `API ключ для ${provider} не настроен` },
        { status: 400 }
      )
    }

    // 5. Создать запись generation (pending)
    const [generation] = await db
      .insert(generations)
      .values({
        userId: session.user.id,
        provider,
        model,
        prompt: prompt.trim(),
        params,
        status: "processing",
        imagesCount: imageCount,
      })
      .returning({ id: generations.id })

    try {
      // 6. Вызвать провайдер
      const providerAdapter = getProvider(provider)
      const result = await providerAdapter.generate({
        model,
        prompt: prompt.trim(),
        params: params as Record<string, unknown>,
        count: imageCount,
        apiKey,
      })

      // 7. Загрузить в S3
      await ensureBucket()

      const savedImages: Array<{
        id: string
        url: string
        width: number
        height: number
      }> = []

      for (let i = 0; i < result.images.length; i++) {
        const img = result.images[i]
        const s3Key = `generations/${generation.id}/${i}.${img.format}`
        const contentType = `image/${img.format}`

        await upload(s3Key, img.data, contentType)

        // 8. Записать в images
        const [savedImage] = await db
          .insert(images)
          .values({
            generationId: generation.id,
            s3Key,
            s3Url: s3Key, // будем проксировать через /api/images/[id]
            width: img.width,
            height: img.height,
            format: img.format,
            sizeBytes: img.data.length,
          })
          .returning({ id: images.id })

        savedImages.push({
          id: savedImage.id,
          url: `/api/images/${savedImage.id}`,
          width: img.width,
          height: img.height,
        })
      }

      // 9. Обновить generation → done
      await db
        .update(generations)
        .set({
          status: "done",
          cost: result.cost.toFixed(4),
          completedAt: new Date(),
        })
        .where(eq(generations.id, generation.id))

      return NextResponse.json({
        generationId: generation.id,
        images: savedImages,
        cost: result.cost,
      })
    } catch (genError) {
      // Ошибка генерации — обновить статус
      const errorMessage =
        genError instanceof Error ? genError.message : "Неизвестная ошибка"

      await db
        .update(generations)
        .set({
          status: "error",
          errorMessage,
          completedAt: new Date(),
        })
        .where(eq(generations.id, generation.id))

      return NextResponse.json({ error: errorMessage }, { status: 502 })
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Внутренняя ошибка сервера"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
