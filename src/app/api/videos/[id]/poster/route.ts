import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { videos, videoGenerations, videoCompositions } from "@/lib/db/schema"
import { downloadStream } from "@/lib/storage/s3"
import { posterKeyOf } from "@/lib/video/poster-key"

/**
 * Постер видео (JPG, см. `lib/video/poster.ts`). Права — как у самого видео
 * (`/api/videos/[id]`): владелец генерации или склейки, либо админ.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }
    const [video] = await db
      .select({
        metadata: videos.metadata,
        genOwnerId: videoGenerations.userId,
        compOwnerId: videoCompositions.userId,
      })
      .from(videos)
      .leftJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
      .leftJoin(videoCompositions, eq(videos.compositionId, videoCompositions.id))
      .where(eq(videos.id, id))
    const key = video ? posterKeyOf(video.metadata) : null
    if (!video || !key) {
      return NextResponse.json({ error: "Постер не найден" }, { status: 404 })
    }
    const ownerId = video.genOwnerId ?? video.compOwnerId
    if (ownerId !== session.user.id && (session.user as { role?: string }).role !== "admin") {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
    }
    const { body, contentType, contentLength } = await downloadStream(key)
    const respHeaders: Record<string, string> = {
      "Content-Type": contentType || "image/jpeg",
      // Постер не меняется: генерация пишет его один раз
      "Cache-Control": "private, max-age=604800, immutable",
    }
    if (contentLength != null) respHeaders["Content-Length"] = String(contentLength)
    return new NextResponse(body as unknown as BodyInit, { status: 200, headers: respHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка загрузки постера"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
