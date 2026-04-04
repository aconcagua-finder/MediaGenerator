import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { images, generations } from "@/lib/db/schema"
import { download } from "@/lib/storage/s3"
import { headers } from "next/headers"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Авторизация
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }

    // Найти изображение
    const [image] = await db
      .select({
        s3Key: images.s3Key,
        format: images.format,
        generationUserId: generations.userId,
      })
      .from(images)
      .innerJoin(generations, eq(images.generationId, generations.id))
      .where(eq(images.id, id))

    if (!image) {
      return NextResponse.json(
        { error: "Изображение не найдено" },
        { status: 404 }
      )
    }

    // Проверка, что изображение принадлежит пользователю
    // (админы тоже могут просматривать)
    if (
      image.generationUserId !== session.user.id &&
      (session.user as { role?: string }).role !== "admin"
    ) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
    }

    // Скачать из S3
    const { body, contentType } = await download(image.s3Key)

    return new NextResponse(body as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType || `image/${image.format || "png"}`,
        "Cache-Control": "private, max-age=86400",
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ошибка загрузки изображения"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
