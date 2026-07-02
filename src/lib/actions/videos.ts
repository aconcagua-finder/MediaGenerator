"use server"

import { eq, and, or, desc, isNull, isNotNull, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { videos, videoGenerations, videoCompositions, folders } from "../db/schema"
import { auth } from "../auth"
import { headers } from "next/headers"
import { remove as s3Remove } from "../storage/s3"

export interface VideoLibraryItem {
  id: string
  durationSeconds: number | null
  width: number | null
  height: number | null
  hasAudio: boolean
  format: string | null
  sizeBytes: number | null
  folderId: string | null
  createdAt: Date
  /** Откуда видео: сгенерировано нейросетью или склеено в редакторе */
  kind: "generation" | "composition"
  /** Число исходных клипов (только для склеек), для бейджа «склеено из N» */
  segmentCount: number
  generation: {
    id: string
    provider: string
    model: string
    prompt: string
    params: unknown
    /** Стоимость генерации видео в USD (у склеек — null, рендер локальный) */
    cost: number | null
  }
}

/**
 * Получить готовые видео текущего пользователя с пагинацией и фильтром по папке.
 * Зеркало getImages: folderId === null → корень, undefined → все (кроме запароленных папок).
 */
export async function getVideos(opts: {
  folderId?: string | null
  limit?: number
  offset?: number
}): Promise<{ items: VideoLibraryItem[]; total: number }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  const { folderId = undefined, limit = 40, offset = 0 } = opts
  const uid = session.user.id

  // Видео принадлежит либо генерации, либо склейке — фильтруем по обоим источникам.
  const conditions = [
    or(eq(videoGenerations.userId, uid), eq(videoCompositions.userId, uid)),
    or(eq(videoGenerations.status, "done"), eq(videoCompositions.status, "done")),
  ]

  if (folderId === null) {
    conditions.push(isNull(videos.folderId))
  } else if (folderId) {
    conditions.push(eq(videos.folderId, folderId))
  } else {
    // Все видео — исключаем те, что в запароленных папках (управляются во вкладке «Фото»)
    const lockedFolderIds = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.userId, session.user.id), isNotNull(folders.passwordHash)))

    if (lockedFolderIds.length > 0) {
      conditions.push(
        sql`(${videos.folderId} IS NULL OR ${videos.folderId} NOT IN (${sql.join(lockedFolderIds.map((f) => sql`${f.id}`), sql`, `)}))`
      )
    }
  }

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: videos.id,
        durationSeconds: videos.durationSeconds,
        width: videos.width,
        height: videos.height,
        hasAudio: videos.hasAudio,
        format: videos.format,
        sizeBytes: videos.sizeBytes,
        folderId: videos.folderId,
        createdAt: videos.createdAt,
        generationId: videoGenerations.id,
        provider: videoGenerations.provider,
        model: videoGenerations.model,
        prompt: videoGenerations.prompt,
        params: videoGenerations.params,
        cost: videoGenerations.cost,
        compositionId: videoCompositions.id,
        compTitle: videoCompositions.title,
        compParams: videoCompositions.params,
        segmentCount: sql<number>`(select count(*)::int from video_composition_segments where composition_id = ${videos.compositionId})`,
      })
      .from(videos)
      .leftJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
      .leftJoin(videoCompositions, eq(videos.compositionId, videoCompositions.id))
      .where(and(...conditions))
      .orderBy(desc(videos.createdAt))
      .limit(limit)
      .offset(offset),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(videos)
      .leftJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
      .leftJoin(videoCompositions, eq(videos.compositionId, videoCompositions.id))
      .where(and(...conditions)),
  ])

  return {
    items: items.map((row) => {
      const isComp = row.generationId == null
      return {
        id: row.id,
        durationSeconds: row.durationSeconds,
        width: row.width,
        height: row.height,
        hasAudio: row.hasAudio,
        format: row.format,
        sizeBytes: row.sizeBytes,
        folderId: row.folderId,
        createdAt: row.createdAt,
        kind: isComp ? ("composition" as const) : ("generation" as const),
        segmentCount: row.segmentCount ?? 0,
        generation: {
          id: (isComp ? row.compositionId : row.generationId) as string,
          provider: isComp ? "compose" : (row.provider as string),
          model: isComp ? "Склейка" : (row.model as string),
          prompt: isComp ? row.compTitle || "Склейка" : (row.prompt as string),
          params: isComp ? row.compParams : row.params,
          cost: !isComp && row.cost != null ? parseFloat(row.cost) : null,
        },
      }
    }),
    total: countResult[0]?.count ?? 0,
  }
}

/**
 * Переместить видео в папку
 */
export async function moveVideos(videoIds: string[], folderId: string | null) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")
  const uid = session.user.id

  // Владение клипом — через генерацию ИЛИ склейку
  const owned = await db
    .select({ id: videos.id })
    .from(videos)
    .leftJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
    .leftJoin(videoCompositions, eq(videos.compositionId, videoCompositions.id))
    .where(
      and(
        inArray(videos.id, videoIds),
        or(eq(videoGenerations.userId, uid), eq(videoCompositions.userId, uid)),
      ),
    )
  const ownedIds = owned.map((v) => v.id)
  if (ownedIds.length > 0) {
    await db.update(videos).set({ folderId }).where(inArray(videos.id, ownedIds))
  }

  return { success: true }
}

/**
 * Удалить видео (из БД и S3)
 */
export async function deleteVideos(videoIds: string[]) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  const toDelete = await db
    .select({ id: videos.id, s3Key: videos.s3Key })
    .from(videos)
    .leftJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
    .leftJoin(videoCompositions, eq(videos.compositionId, videoCompositions.id))
    .where(
      and(
        inArray(videos.id, videoIds),
        or(
          eq(videoGenerations.userId, session.user.id),
          eq(videoCompositions.userId, session.user.id)
        )
      )
    )

  await Promise.all(toDelete.map((v) => s3Remove(v.s3Key)))

  if (toDelete.length > 0) {
    await db.delete(videos).where(inArray(videos.id, toDelete.map((v) => v.id)))
  }

  return { success: true, deleted: toDelete.length }
}

export interface PickerVideo {
  id: string
  label: string
  durationSeconds: number | null
  width: number | null
  height: number | null
  hasAudio: boolean
  kind: "generation" | "composition"
}

/**
 * Лёгкий список готовых видео пользователя для диалога выбора клипов в редакторе
 * склейки. Без фильтра по папке — показываем все доступные клипы (оба источника).
 */
export async function listVideosForPicker(limit = 100): Promise<PickerVideo[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")
  const uid = session.user.id

  const rows = await db
    .select({
      id: videos.id,
      durationSeconds: videos.durationSeconds,
      width: videos.width,
      height: videos.height,
      hasAudio: videos.hasAudio,
      generationId: videoGenerations.id,
      prompt: videoGenerations.prompt,
      compTitle: videoCompositions.title,
    })
    .from(videos)
    .leftJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
    .leftJoin(videoCompositions, eq(videos.compositionId, videoCompositions.id))
    .where(
      and(
        or(eq(videoGenerations.userId, uid), eq(videoCompositions.userId, uid)),
        or(eq(videoGenerations.status, "done"), eq(videoCompositions.status, "done"))
      )
    )
    .orderBy(desc(videos.createdAt))
    .limit(limit)

  return rows.map((r) => {
    const isComp = r.generationId == null
    return {
      id: r.id,
      label: (isComp ? r.compTitle || "Склейка" : r.prompt) ?? "Видео",
      durationSeconds: r.durationSeconds,
      width: r.width,
      height: r.height,
      hasAudio: r.hasAudio,
      kind: isComp ? ("composition" as const) : ("generation" as const),
    }
  })
}

/**
 * Метаданные клипов по списку id (для предзаполнения редактора из библиотеки).
 * Возвращает только доступные пользователю; порядок не гарантирован — вызывающий
 * упорядочивает по исходному списку id.
 */
export async function getPickerVideosByIds(ids: string[]): Promise<PickerVideo[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")
  const uid = session.user.id
  if (ids.length === 0) return []

  const rows = await db
    .select({
      id: videos.id,
      durationSeconds: videos.durationSeconds,
      width: videos.width,
      height: videos.height,
      hasAudio: videos.hasAudio,
      generationId: videoGenerations.id,
      prompt: videoGenerations.prompt,
      compTitle: videoCompositions.title,
    })
    .from(videos)
    .leftJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
    .leftJoin(videoCompositions, eq(videos.compositionId, videoCompositions.id))
    .where(
      and(
        inArray(videos.id, ids),
        or(eq(videoGenerations.userId, uid), eq(videoCompositions.userId, uid))
      )
    )

  return rows.map((r) => {
    const isComp = r.generationId == null
    return {
      id: r.id,
      label: (isComp ? r.compTitle || "Склейка" : r.prompt) ?? "Видео",
      durationSeconds: r.durationSeconds,
      width: r.width,
      height: r.height,
      hasAudio: r.hasAudio,
      kind: isComp ? ("composition" as const) : ("generation" as const),
    }
  })
}
