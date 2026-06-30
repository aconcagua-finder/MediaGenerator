"use server"

import { eq, and, desc, isNull, isNotNull, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { audios, voiceGenerations, folders } from "../db/schema"
import { auth } from "../auth"
import { headers } from "next/headers"
import { remove as s3Remove } from "../storage/s3"

export interface AudioLibraryItem {
  id: string
  durationSeconds: number | null
  format: string | null
  sizeBytes: number | null
  folderId: string | null
  createdAt: Date
  generation: {
    id: string
    provider: string
    model: string
    voice: string
    text: string
    /** Стоимость озвучки в USD (оценка/факт) */
    cost: number | null
  }
}

/**
 * Готовые аудио текущего пользователя с пагинацией и фильтром по папке.
 * Зеркало getVideos, но источник один (озвучка), без склеек.
 */
export async function getAudios(opts: {
  folderId?: string | null
  limit?: number
  offset?: number
}): Promise<{ items: AudioLibraryItem[]; total: number }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  const { folderId = undefined, limit = 40, offset = 0 } = opts
  const uid = session.user.id

  const conditions = [
    eq(voiceGenerations.userId, uid),
    eq(voiceGenerations.status, "done"),
  ]

  if (folderId === null) {
    conditions.push(isNull(audios.folderId))
  } else if (folderId) {
    conditions.push(eq(audios.folderId, folderId))
  } else {
    // Все аудио — исключаем запароленные папки (управляются во вкладке «Фото»)
    const lockedFolderIds = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.userId, uid), isNotNull(folders.passwordHash)))

    if (lockedFolderIds.length > 0) {
      conditions.push(
        sql`(${audios.folderId} IS NULL OR ${audios.folderId} NOT IN (${sql.join(lockedFolderIds.map((f) => sql`${f.id}`), sql`, `)}))`,
      )
    }
  }

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: audios.id,
        durationSeconds: audios.durationSeconds,
        format: audios.format,
        sizeBytes: audios.sizeBytes,
        folderId: audios.folderId,
        createdAt: audios.createdAt,
        generationId: voiceGenerations.id,
        provider: voiceGenerations.provider,
        model: voiceGenerations.model,
        voice: voiceGenerations.voice,
        text: voiceGenerations.text,
        cost: voiceGenerations.cost,
      })
      .from(audios)
      .innerJoin(voiceGenerations, eq(audios.voiceGenerationId, voiceGenerations.id))
      .where(and(...conditions))
      .orderBy(desc(audios.createdAt))
      .limit(limit)
      .offset(offset),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(audios)
      .innerJoin(voiceGenerations, eq(audios.voiceGenerationId, voiceGenerations.id))
      .where(and(...conditions)),
  ])

  return {
    items: items.map((row) => ({
      id: row.id,
      durationSeconds: row.durationSeconds,
      format: row.format,
      sizeBytes: row.sizeBytes,
      folderId: row.folderId,
      createdAt: row.createdAt,
      generation: {
        id: row.generationId,
        provider: row.provider,
        model: row.model,
        voice: row.voice,
        text: row.text,
        cost: row.cost != null ? parseFloat(row.cost) : null,
      },
    })),
    total: countResult[0]?.count ?? 0,
  }
}

/** Переместить аудио в папку */
export async function moveAudios(audioIds: string[], folderId: string | null) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")
  const uid = session.user.id

  const owned = await db
    .select({ id: audios.id })
    .from(audios)
    .innerJoin(voiceGenerations, eq(audios.voiceGenerationId, voiceGenerations.id))
    .where(and(inArray(audios.id, audioIds), eq(voiceGenerations.userId, uid)))

  const ownedIds = owned.map((a) => a.id)
  if (ownedIds.length > 0) {
    await db.update(audios).set({ folderId }).where(inArray(audios.id, ownedIds))
  }

  return { success: true }
}

/** Удалить аудио (из БД и S3) */
export async function deleteAudios(audioIds: string[]) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")
  const uid = session.user.id

  const toDelete = await db
    .select({ id: audios.id, s3Key: audios.s3Key })
    .from(audios)
    .innerJoin(voiceGenerations, eq(audios.voiceGenerationId, voiceGenerations.id))
    .where(and(inArray(audios.id, audioIds), eq(voiceGenerations.userId, uid)))

  await Promise.all(toDelete.map((a) => s3Remove(a.s3Key)))

  if (toDelete.length > 0) {
    await db.delete(audios).where(inArray(audios.id, toDelete.map((a) => a.id)))
  }

  return { success: true, deleted: toDelete.length }
}
