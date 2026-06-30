import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { audios, voiceGenerations } from "@/lib/db/schema"
import { downloadStream } from "@/lib/storage/s3"

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
}

/**
 * Отдача аудиофайла озвучки. Поддерживает Range (HTTP 206) — на случай перемотки
 * в <audio>. Владелец — через единственный источник (voice_generations).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }

    const [audio] = await db
      .select({
        s3Key: audios.s3Key,
        format: audios.format,
        ownerId: voiceGenerations.userId,
      })
      .from(audios)
      .leftJoin(voiceGenerations, eq(audios.voiceGenerationId, voiceGenerations.id))
      .where(eq(audios.id, id))

    if (!audio) {
      return NextResponse.json({ error: "Аудио не найдено" }, { status: 404 })
    }
    if (
      audio.ownerId !== session.user.id &&
      (session.user as { role?: string }).role !== "admin"
    ) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
    }

    const range = request.headers.get("range") || undefined
    const { body, contentType, contentLength, contentRange, statusCode } =
      await downloadStream(audio.s3Key, range)

    const respHeaders: Record<string, string> = {
      "Content-Type": contentType || MIME[audio.format] || "audio/mpeg",
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
    const message = error instanceof Error ? error.message : "Ошибка загрузки аудио"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
