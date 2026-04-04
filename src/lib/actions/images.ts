"use server"

import { eq, and, desc, isNull, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { images, generations } from "../db/schema"
import { auth } from "../auth"
import { headers } from "next/headers"
import { remove as s3Remove } from "../storage/s3"

export interface ImageWithGeneration {
  id: string
  s3Key: string
  s3Url: string
  width: number | null
  height: number | null
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
  }
}

/**
 * Получить изображения текущего пользователя с пагинацией
 */
export async function getImages(opts: {
  folderId?: string | null
  limit?: number
  offset?: number
}): Promise<{ items: ImageWithGeneration[]; total: number }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  const { folderId = undefined, limit = 40, offset = 0 } = opts

  // Условие по папке
  const folderCondition =
    folderId === null
      ? isNull(images.folderId) // корень — без папки
      : folderId
        ? eq(images.folderId, folderId)
        : undefined // все изображения

  const conditions = [
    eq(generations.userId, session.user.id),
    eq(generations.status, "done"),
    ...(folderCondition ? [folderCondition] : []),
  ]

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: images.id,
        s3Key: images.s3Key,
        s3Url: images.s3Url,
        width: images.width,
        height: images.height,
        format: images.format,
        sizeBytes: images.sizeBytes,
        folderId: images.folderId,
        createdAt: images.createdAt,
        generationId: generations.id,
        provider: generations.provider,
        model: generations.model,
        prompt: generations.prompt,
        params: generations.params,
      })
      .from(images)
      .innerJoin(generations, eq(images.generationId, generations.id))
      .where(and(...conditions))
      .orderBy(desc(images.createdAt))
      .limit(limit)
      .offset(offset),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(images)
      .innerJoin(generations, eq(images.generationId, generations.id))
      .where(and(...conditions)),
  ])

  return {
    items: items.map((row) => ({
      id: row.id,
      s3Key: row.s3Key,
      s3Url: row.s3Url,
      width: row.width,
      height: row.height,
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
      },
    })),
    total: countResult[0]?.count ?? 0,
  }
}

/**
 * Переместить изображения в папку
 */
export async function moveImages(imageIds: string[], folderId: string | null) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  // Проверяем принадлежность изображений пользователю
  await db
    .update(images)
    .set({ folderId })
    .where(
      and(
        inArray(images.id, imageIds),
        inArray(
          images.generationId,
          db
            .select({ id: generations.id })
            .from(generations)
            .where(eq(generations.userId, session.user.id))
        )
      )
    )

  return { success: true }
}

/**
 * Удалить изображения (из БД и S3)
 */
export async function deleteImages(imageIds: string[]) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  // Находим ключи S3 для удаления
  const toDelete = await db
    .select({ id: images.id, s3Key: images.s3Key })
    .from(images)
    .innerJoin(generations, eq(images.generationId, generations.id))
    .where(
      and(
        inArray(images.id, imageIds),
        eq(generations.userId, session.user.id)
      )
    )

  // Удаляем из S3
  await Promise.all(toDelete.map((img) => s3Remove(img.s3Key)))

  // Удаляем из БД
  if (toDelete.length > 0) {
    await db
      .delete(images)
      .where(inArray(images.id, toDelete.map((img) => img.id)))
  }

  return { success: true, deleted: toDelete.length }
}
