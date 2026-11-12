import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { and, eq, inArray, or, type SQL } from "drizzle-orm"
import { downloadZip, predictLength } from "client-zip"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  audios,
  generations,
  images,
  videoCompositions,
  videoGenerations,
  videos,
  voiceGenerations,
} from "@/lib/db/schema"
import { objectSize, objectWebStream } from "@/lib/storage/s3"
import { parseZipRequest, zipArchiveName, zipEntryName, type ZipKind } from "@/lib/library/zip"

export const dynamic = "force-dynamic"

interface ZipRow {
  id: string
  s3Key: string
  format: string | null
  createdAt: Date
}

/** Файлы выбранного типа, которые пользователь может скачать (свои; админ — любые) */
async function loadRows(kind: ZipKind, ids: string[], uid: string, isAdmin: boolean): Promise<ZipRow[]> {
  if (kind === "videos") {
    const owner: SQL | undefined = isAdmin
      ? undefined
      : or(eq(videoGenerations.userId, uid), eq(videoCompositions.userId, uid))
    return db
      .select({ id: videos.id, s3Key: videos.s3Key, format: videos.format, createdAt: videos.createdAt })
      .from(videos)
      .leftJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
      .leftJoin(videoCompositions, eq(videos.compositionId, videoCompositions.id))
      .where(and(inArray(videos.id, ids), owner))
  }
  if (kind === "images") {
    return db
      .select({ id: images.id, s3Key: images.s3Key, format: images.format, createdAt: images.createdAt })
      .from(images)
      .innerJoin(generations, eq(images.generationId, generations.id))
      .where(and(inArray(images.id, ids), isAdmin ? undefined : eq(generations.userId, uid)))
  }
  return db
    .select({ id: audios.id, s3Key: audios.s3Key, format: audios.format, createdAt: audios.createdAt })
    .from(audios)
    .innerJoin(voiceGenerations, eq(audios.voiceGenerationId, voiceGenerations.id))
    .where(and(inArray(audios.id, ids), isAdmin ? undefined : eq(voiceGenerations.userId, uid)))
}

/**
 * Массовое скачивание из Библиотеки одним архивом:
 * `GET /api/library/zip?kind=videos|images|audios&ids=<uuid>,<uuid>,…`.
 *
 * Архив пишется потоком: файлы открываются из S3 по одному по мере записи,
 * в память целиком ничего не грузится. Размеры берутся HEAD-запросами, так
 * что у ответа точный `Content-Length` и браузер показывает прогресс.
 * Чужие и несуществующие id молча пропускаются; файлы — в порядке выбора.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const parsed = parseZipRequest(sp.get("kind"), sp.get("ids"))
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { kind, ids } = parsed
  const isAdmin = (session.user as { role?: string }).role === "admin"

  try {
    const rows = await loadRows(kind, ids, session.user.id, isAdmin)
    const order = new Map(ids.map((id, i) => [id, i]))
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

    // Размер каждого объекта; пропавший в S3 файл просто не попадает в архив
    const sized = await Promise.all(
      rows.map(async (row) => {
        try {
          return { row, size: await objectSize(row.s3Key) }
        } catch {
          return null
        }
      }),
    )
    const entries = sized
      .filter((e): e is { row: ZipRow; size: number } => e !== null)
      .map(({ row, size }) => ({
        key: row.s3Key,
        name: zipEntryName(kind, row.id, row.createdAt, row.format),
        lastModified: row.createdAt,
        size,
      }))

    if (entries.length === 0) {
      return NextResponse.json({ error: "Файлы не найдены" }, { status: 404 })
    }

    async function* files() {
      for (const e of entries) {
        yield { name: e.name, lastModified: e.lastModified, size: e.size, input: await objectWebStream(e.key) }
      }
    }

    const length = predictLength(entries.map(({ name, lastModified, size }) => ({ name, lastModified, size })))
    const zip = downloadZip(files(), { length })

    const filename = zipArchiveName(kind)
    return new Response(zip.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(length),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка сборки архива"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
