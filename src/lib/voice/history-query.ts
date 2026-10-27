import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { audios, voiceGenerations } from "@/lib/db/schema"
import { buildVoiceHistory, type VoiceHistoryItem } from "./history"

/**
 * Страница истории озвучек пользователя из БД (для `GET /api/voice/history`).
 * `ids` — точечный запрос (досмотреть задачи «в работе» после перезагрузки).
 */
export async function loadVoiceHistory(
  uid: string,
  opts: { offset: number; limit: number; ids?: string[] },
): Promise<{ items: VoiceHistoryItem[]; hasMore: boolean; total: number }> {
  const conditions = [eq(voiceGenerations.userId, uid), eq(voiceGenerations.hidden, false)]
  if (opts.ids) conditions.push(inArray(voiceGenerations.id, opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]))
  const where = and(...conditions)

  const [page, [{ total }]] = await Promise.all([
    db
      .select({
        id: voiceGenerations.id,
        provider: voiceGenerations.provider,
        model: voiceGenerations.model,
        text: voiceGenerations.text,
        voice: voiceGenerations.voice,
        params: voiceGenerations.params,
        status: voiceGenerations.status,
        cost: voiceGenerations.cost,
        errorMessage: voiceGenerations.errorMessage,
        createdAt: voiceGenerations.createdAt,
      })
      .from(voiceGenerations)
      .where(where)
      .orderBy(desc(voiceGenerations.createdAt))
      .limit(opts.limit + 1)
      .offset(opts.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(voiceGenerations).where(where),
  ])

  const rows = page.slice(0, opts.limit)
  const audioRows = rows.length
    ? await db
        .select({
          id: audios.id,
          voiceGenerationId: audios.voiceGenerationId,
          format: audios.format,
          durationSeconds: audios.durationSeconds,
          sizeBytes: audios.sizeBytes,
        })
        .from(audios)
        .where(inArray(audios.voiceGenerationId, rows.map((r) => r.id)))
    : []

  return { items: buildVoiceHistory({ rows, audios: audioRows }), hasMore: page.length > opts.limit, total }
}
