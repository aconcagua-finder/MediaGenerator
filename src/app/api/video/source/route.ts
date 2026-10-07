import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { randomUUID } from "node:crypto"
import { createWriteStream } from "node:fs"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import { and, eq, gte, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { videoSources } from "@/lib/db/schema"
import { ensureBucket, uploadFile } from "@/lib/storage/s3"
import { probeFile } from "@/lib/video/probe"
import {
  MAX_SAMPLE_BYTES,
  MAX_SOURCE_BYTES,
  fileExtension,
  mimeForSource,
  validateSourceMeta,
  type SourceKind,
} from "@/lib/video/source-limits"

export const runtime = "nodejs"
export const maxDuration = 300

/** Не больше стольких загруженных (и ещё не вычищенных) источников на пользователя */
const MAX_ACTIVE_SOURCES = 20

class TooLargeError extends Error {}

/**
 * Загрузка исходного файла для video-to-video / замены голоса.
 *
 * Тело запроса — СЫРОЙ файл (не multipart), чтобы стримить его на диск без
 * буферизации в памяти (контейнер app — 768 МБ, а файл до 100 МБ).
 * `POST /api/video/source?kind=video|audio&name=<имя файла>`
 *
 * Сервер повторно проверяет лимиты по ffprobe (клиентской проверке не верим):
 * ≤ 30 сек и ≤ 100 МБ для видео, ≤ 60 сек и ≤ 10 МБ для образца голоса.
 * Маршрут исключён из proxy.ts (иначе proxy буферизует и режет тело на 10 МБ);
 * сессия проверяется здесь.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  const url = new URL(request.url)
  const kind: SourceKind = url.searchParams.get("kind") === "audio" ? "audio" : "video"
  const name = (url.searchParams.get("name") || "").slice(0, 200)
  const ext = fileExtension(name)
  const mime = mimeForSource(kind, ext)
  if (!mime) {
    return NextResponse.json(
      {
        error:
          kind === "video"
            ? "Неподдерживаемый формат. Загрузите видео mp4, mov или webm."
            : "Неподдерживаемый формат. Загрузите аудио mp3, wav, m4a или ogg.",
      },
      { status: 400 },
    )
  }

  const maxBytes = kind === "video" ? MAX_SOURCE_BYTES : MAX_SAMPLE_BYTES
  const declared = parseInt(request.headers.get("content-length") || "0", 10)
  if (declared > maxBytes * 1.02) {
    return NextResponse.json(
      { error: `Файл слишком большой: максимум ${Math.round(maxBytes / 1024 / 1024)} МБ` },
      { status: 413 },
    )
  }
  if (!request.body) {
    return NextResponse.json({ error: "Пустой запрос: файл не передан" }, { status: 400 })
  }

  // Защита хранилища: ограничиваем число одновременно лежащих источников
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [active] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(videoSources)
    .where(and(eq(videoSources.userId, session.user.id), gte(videoSources.createdAt, since)))
  if (active.count >= MAX_ACTIVE_SOURCES) {
    return NextResponse.json(
      { error: "Слишком много загруженных файлов за сутки. Подождите, пока старые удалятся." },
      { status: 429 },
    )
  }

  const id = randomUUID()
  const workDir = await mkdtemp(join(tmpdir(), "mg-source-"))
  const filePath = join(workDir, `in.${ext}`)

  try {
    let received = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length
        if (received > maxBytes) cb(new TooLargeError())
        else cb(null, chunk)
      },
    })
    await pipeline(
      Readable.fromWeb(request.body as unknown as import("node:stream/web").ReadableStream),
      limiter,
      createWriteStream(filePath),
    )

    const { size } = await stat(filePath)
    const probe = await probeFile(filePath)
    if (!probe) {
      return NextResponse.json(
        { error: "Не удалось прочитать файл — возможно, он повреждён или это не видео/аудио." },
        { status: 400 },
      )
    }
    const check = validateSourceMeta(kind, {
      sizeBytes: size,
      durationSeconds: probe.durationSeconds,
      hasVideo: probe.hasVideo,
      hasAudio: probe.hasAudio,
    })
    if (!check.ok) {
      return NextResponse.json({ error: check.message }, { status: 400 })
    }

    const s3Key = `video-sources/${id}/${kind === "video" ? "source" : "sample"}.${ext}`
    await ensureBucket()
    await uploadFile(s3Key, filePath, mime, size)

    await db.insert(videoSources).values({
      id,
      userId: session.user.id,
      kind,
      s3Key,
      contentType: mime,
      sizeBytes: size,
      durationSeconds: probe.durationSeconds.toFixed(3),
      width: probe.width,
      height: probe.height,
      hasAudio: probe.hasAudio,
      originalName: name || null,
    })

    return NextResponse.json({
      id,
      kind,
      durationSeconds: Number(probe.durationSeconds.toFixed(3)),
      width: probe.width,
      height: probe.height,
      hasAudio: probe.hasAudio,
      sizeBytes: size,
    })
  } catch (err) {
    if (err instanceof TooLargeError || (err as { cause?: unknown })?.cause instanceof TooLargeError) {
      return NextResponse.json(
        { error: `Файл слишком большой: максимум ${Math.round(maxBytes / 1024 / 1024)} МБ` },
        { status: 413 },
      )
    }
    const message = err instanceof Error ? err.message : "Ошибка загрузки файла"
    console.error("[video/source]", message)
    return NextResponse.json({ error: "Не удалось загрузить файл. Попробуйте ещё раз." }, { status: 500 })
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
