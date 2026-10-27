import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { videoGenerations, videos, videoSources } from "@/lib/db/schema"
import { buildVideoHistory, voiceOverChildId, type VideoHistoryItem } from "./history"

/**
 * Страница истории видео пользователя из БД (для `GET /api/video/history`).
 * Переозвучки после v2v (`params.parent_generation_id`) отдельными строками не
 * берутся — их результат собирает в карточку родителя `buildVideoHistory`.
 * Склейки сюда не входят (они в Библиотеке).
 */
export async function loadVideoHistory(
  uid: string,
  offset: number,
  limit: number,
): Promise<{ items: VideoHistoryItem[]; hasMore: boolean }> {
  const genFields = {
    id: videoGenerations.id,
    model: videoGenerations.model,
    prompt: videoGenerations.prompt,
    mode: videoGenerations.mode,
    params: videoGenerations.params,
    status: videoGenerations.status,
    cost: videoGenerations.cost,
    errorMessage: videoGenerations.errorMessage,
    createdAt: videoGenerations.createdAt,
  }

  // На одну строку больше — чтобы знать, есть ли ещё
  const page = await db
    .select(genFields)
    .from(videoGenerations)
    .where(
      and(
        eq(videoGenerations.userId, uid),
        eq(videoGenerations.hidden, false),
        inArray(videoGenerations.mode, ["t2v", "i2v", "v2v", "voice"]),
        sql`not (${videoGenerations.mode} = 'voice' and coalesce(${videoGenerations.params}, '{}'::jsonb) ? 'parent_generation_id')`,
      ),
    )
    .orderBy(desc(videoGenerations.createdAt))
    .limit(limit + 1)
    .offset(offset)

  const rows = page.slice(0, limit)
  const childIds = rows.map((r) => voiceOverChildId(r.params)).filter((id): id is string => id !== null)
  const sourceIds = rows
    .filter((r) => r.mode === "v2v")
    .map((r) => (r.params as { source_id?: unknown } | null)?.source_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)

  const [children, sources] = await Promise.all([
    childIds.length
      ? db
          .select(genFields)
          .from(videoGenerations)
          .where(and(eq(videoGenerations.userId, uid), inArray(videoGenerations.id, childIds)))
      : Promise.resolve([]),
    sourceIds.length
      ? db
          .select({
            id: videoSources.id,
            durationSeconds: videoSources.durationSeconds,
            width: videoSources.width,
            height: videoSources.height,
            hasAudio: videoSources.hasAudio,
            sizeBytes: videoSources.sizeBytes,
            originalName: videoSources.originalName,
            createdAt: videoSources.createdAt,
          })
          .from(videoSources)
          .where(and(eq(videoSources.userId, uid), eq(videoSources.kind, "video"), inArray(videoSources.id, sourceIds)))
      : Promise.resolve([]),
  ])

  const genIds = [...rows.map((r) => r.id), ...children.map((c) => c.id)]
  const videoRows = genIds.length
    ? await db
        .select({
          id: videos.id,
          videoGenerationId: videos.videoGenerationId,
          durationSeconds: videos.durationSeconds,
          width: videos.width,
          height: videos.height,
          hasAudio: videos.hasAudio,
        })
        .from(videos)
        .where(inArray(videos.videoGenerationId, genIds))
    : []

  return {
    items: buildVideoHistory({ rows, children, videos: videoRows, sources }),
    hasMore: page.length > limit,
  }
}
