import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { videos, videoGenerations } from "@/lib/db/schema"
import { downloadStream } from "@/lib/storage/s3"
import { headers } from "next/headers"

/**
 * Отдача mp4-файла видео. Поддерживает Range (HTTP 206) — браузер шлёт
 * `Range: bytes=...` при перемотке <video>, иначе перемотка не работает.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }

    const [video] = await db
      .select({
        s3Key: videos.s3Key,
        ownerId: videoGenerations.userId,
      })
      .from(videos)
      .innerJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
      .where(eq(videos.id, id))

    if (!video) {
      return NextResponse.json({ error: "Видео не найдено" }, { status: 404 })
    }
    if (
      video.ownerId !== session.user.id &&
      (session.user as { role?: string }).role !== "admin"
    ) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
    }

    const range = request.headers.get("range") || undefined
    const { body, contentType, contentLength, contentRange, statusCode } =
      await downloadStream(video.s3Key, range)

    const respHeaders: Record<string, string> = {
      "Content-Type": contentType || "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=86400",
    }
    if (contentLength != null) respHeaders["Content-Length"] = String(contentLength)
    if (statusCode === 206 && contentRange) respHeaders["Content-Range"] = contentRange

    return new NextResponse(body as unknown as BodyInit, {
      status: statusCode,
      headers: respHeaders,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка загрузки видео"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
