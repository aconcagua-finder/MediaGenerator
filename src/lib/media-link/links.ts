import { and, eq, isNull, lt, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { publicMediaLinks, videoSources } from "@/lib/db/schema"
import { downloadStream, remove as s3Remove } from "@/lib/storage/s3"
import {
  LINK_TTL_MS,
  buildPublicMediaUrl,
  generateToken,
  hashToken,
  resolvePublicBaseUrl,
} from "./token"
import type { MediaLinkRecord } from "./serve"

/** DB- и S3-обвязка публичных ссылок. Чистая логика — в token.ts / serve.ts. */

export interface CreateLinkInput {
  s3Key: string
  contentType: string
  sizeBytes?: number | null
  purpose: "v2v-source" | "character-image" | "voice-audio" | "voice-sample"
  userId: string
  generationId?: string | null
  /** Имя в хвосте URL (расширение подсказывает тип провайдеру) */
  filename: string
  ttlMs?: number
}

/** Создаёт ссылку и возвращает готовый публичный HTTPS-URL (токен нигде больше не хранится). */
export async function createMediaLink(input: CreateLinkInput): Promise<string> {
  // Сначала проверяем публичный адрес: если он не https — не плодим мёртвые записи
  const base = resolvePublicBaseUrl()
  const token = generateToken()
  await db.insert(publicMediaLinks).values({
    tokenHash: hashToken(token),
    s3Key: input.s3Key,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes ?? null,
    purpose: input.purpose,
    userId: input.userId,
    generationId: input.generationId ?? null,
    expiresAt: new Date(Date.now() + (input.ttlMs ?? LINK_TTL_MS)),
  })
  return buildPublicMediaUrl(base, token, input.filename)
}

export async function findLinkByHash(tokenHash: string): Promise<MediaLinkRecord | null> {
  const [row] = await db
    .select({
      s3Key: publicMediaLinks.s3Key,
      contentType: publicMediaLinks.contentType,
      sizeBytes: publicMediaLinks.sizeBytes,
      expiresAt: publicMediaLinks.expiresAt,
      revokedAt: publicMediaLinks.revokedAt,
    })
    .from(publicMediaLinks)
    .where(eq(publicMediaLinks.tokenHash, tokenHash))
    .limit(1)
  return row ?? null
}

export const mediaLinkDeps = {
  findByHash: findLinkByHash,
  stream: downloadStream,
}

/** Отзывает все ссылки задачи (вызывается при завершении: готово или ошибка) */
export async function revokeLinksForGeneration(generationId: string): Promise<number> {
  const rows = await db
    .update(publicMediaLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(publicMediaLinks.generationId, generationId), isNull(publicMediaLinks.revokedAt)))
    .returning({ id: publicMediaLinks.id })
  return rows.length
}

/**
 * Дочистка: удаляет просроченные ссылки и загруженные источники старше TTL
 * (вместе с объектами в S3). Источники, на которые ещё ссылается живая задача,
 * не страдают: их ссылки отозваны/просрочены только после завершения задачи,
 * а TTL источника (24 ч) заведомо больше времени генерации.
 */
export async function cleanupExpiredMediaSources(now = new Date()): Promise<{ sources: number; links: number }> {
  const cutoff = new Date(now.getTime() - LINK_TTL_MS)

  const staleSources = await db
    .select({ id: videoSources.id, s3Key: videoSources.s3Key })
    .from(videoSources)
    .where(lt(videoSources.createdAt, cutoff))
    .limit(200)
  for (const s of staleSources) {
    await s3Remove(s.s3Key).catch(() => {})
    await db.delete(videoSources).where(eq(videoSources.id, s.id))
  }

  const deletedLinks = await db
    .delete(publicMediaLinks)
    .where(or(lt(publicMediaLinks.expiresAt, cutoff), lt(publicMediaLinks.revokedAt, cutoff)))
    .returning({ id: publicMediaLinks.id })

  return { sources: staleSources.length, links: deletedLinks.length }
}
