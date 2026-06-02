"use server"

import { eq, and, desc, isNull, isNotNull, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { videos, videoGenerations, folders } from "../db/schema"
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
  generation: {
    id: string
    provider: string
    model: string
    prompt: string
    params: unknown
    /** Стоимость генерации видео в USD */
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

  const conditions = [
    eq(videoGenerations.userId, session.user.id),
    eq(videoGenerations.status, "done"),
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
      })
      .from(videos)
      .innerJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
      .where(and(...conditions))
      .orderBy(desc(videos.createdAt))
      .limit(limit)
      .offset(offset),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(videos)
      .innerJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
      .where(and(...conditions)),
  ])

  return {
    items: items.map((row) => ({
      id: row.id,
      durationSeconds: row.durationSeconds,
      width: row.width,
      height: row.height,
      hasAudio: row.hasAudio,
      format: row.format,
      sizeBytes: row.sizeBytes,
      folderId: row.folderId,
      createdAt: row.createdAt,
      generation: {
        id: row.generationId,
        provider: row.provider,
        model: row.model,
        prompt: row.prompt,
        params: row.params,
        cost: row.cost != null ? parseFloat(row.cost) : null,
      },
    })),
    total: countResult[0]?.count ?? 0,
  }
}

/**
 * Переместить видео в папку
 */
export async function moveVideos(videoIds: string[], folderId: string | null) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  await db
    .update(videos)
    .set({ folderId })
    .where(
      and(
        inArray(videos.id, videoIds),
        inArray(
          videos.videoGenerationId,
          db
            .select({ id: videoGenerations.id })
            .from(videoGenerations)
            .where(eq(videoGenerations.userId, session.user.id))
        )
      )
    )

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
    .innerJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
    .where(
      and(
        inArray(videos.id, videoIds),
        eq(videoGenerations.userId, session.user.id)
      )
    )

  await Promise.all(toDelete.map((v) => s3Remove(v.s3Key)))

  if (toDelete.length > 0) {
    await db.delete(videos).where(inArray(videos.id, toDelete.map((v) => v.id)))
  }

  return { success: true, deleted: toDelete.length }
}
