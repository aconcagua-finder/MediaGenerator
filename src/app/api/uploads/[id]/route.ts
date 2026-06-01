import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { uploads } from "@/lib/db/schema"
import { download } from "@/lib/storage/s3"

export const runtime = "nodejs"

/**
 * Стримит ранее загруженный пользователем файл по id.
 *
 * Доступ: владелец загрузки или админ. Других кросс-доступов не делаем —
 * пользовательские картинки точно приватные.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  const [row] = await db
    .select({
      userId: uploads.userId,
      s3Key: uploads.s3Key,
      mimeType: uploads.mimeType,
    })
    .from(uploads)
    .where(eq(uploads.id, id))

  if (!row) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 })
  }
  const isAdmin = session.user.role === "admin"
  if (row.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
  }

  try {
    const { body, contentType } = await download(row.s3Key)
    return new Response(body as ReadableStream, {
      headers: {
        "Content-Type": contentType || row.mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ошибка"
    return NextResponse.json({ error: `S3: ${msg}` }, { status: 502 })
  }
}
