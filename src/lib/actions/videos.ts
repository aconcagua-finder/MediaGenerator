"use server"

import { eq, and, desc, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { videos, videoGenerations } from "../db/schema"
import { auth } from "../auth"
import { headers } from "next/headers"
import { remove as s3Remove } from "../storage/s3"

export interface VideoLibraryItem {
  id: string
  durationSeconds: number | null
  width: number | null
  height: number | null
  hasAudio: boolean
  createdAt: Date
  generation: {
    id: string
    model: string
    prompt: string
  }
}

/**
 * Получить готовые видео текущего пользователя с пагинацией.
 * Зеркало getImages, но без папок (видео пока в общий список).
 */
export async function getVideos(opts: {
  limit?: number
  offset?: number
}): Promise<{ items: VideoLibraryItem[]; total: number }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  const { limit = 40, offset = 0 } = opts

  const conditions = [
    eq(videoGenerations.userId, session.user.id),
    eq(videoGenerations.status, "done"),
  ]

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: videos.id,
        durationSeconds: videos.durationSeconds,
        width: videos.width,
        height: videos.height,
        hasAudio: videos.hasAudio,
        createdAt: videos.createdAt,
        generationId: videoGenerations.id,
        model: videoGenerations.model,
        prompt: videoGenerations.prompt,
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
      createdAt: row.createdAt,
      generation: {
        id: row.generationId,
        model: row.model,
        prompt: row.prompt,
      },
    })),
    total: countResult[0]?.count ?? 0,
  }
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
