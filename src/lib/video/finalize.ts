import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { videoGenerations, videos, user } from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { getVideoProvider } from "@/lib/providers/video/registry"
import { getVideoModel, estimateVideoCost } from "@/lib/providers/video-models"
import { upload, ensureBucket } from "@/lib/storage/s3"
import { humanizeVideoError } from "./humanize-error"

/**
 * Финализация одной видео-генерации: опрос провайдера → скачивание mp4 в S3 →
 * списание стоимости, либо пометка ошибки. Единый источник правды, который
 * используют и клиентский поллинг (`GET /api/video/[id]/status`), и серверный
 * реконсилятор (`reconcileStaleVideoJobs`, дёргается из cron).
 *
 * Идемпотентна и безопасна при гонке: переход `processing → saving` защищён
 * условием `status = 'processing'` в UPDATE, поэтому скачивание не выполнится
 * дважды, даже если клиент и cron опрашивают задачу одновременно.
 */

const RES_HEIGHT: Record<string, number> = { "480p": 480, "720p": 720, "1080p": 1080, "4K": 2160 }

/** Примерные пиксельные размеры из разрешения + соотношения сторон (для вёрстки плеера) */
function dims(resolution?: string, aspect?: string): { width: number; height: number } {
  const h = RES_HEIGHT[resolution || "720p"] || 720
  const [aw, ah] = (aspect || "16:9").split(":").map(Number)
  const ratio = aw && ah ? aw / ah : 16 / 9
  const w = Math.round((h * ratio) / 2) * 2
  return { width: w, height: h }
}

export interface VideoDto {
  id: string
  url: string
  durationSeconds: number | null
  width: number | null
  height: number | null
  hasAudio: boolean
}

interface VideoRow {
  id: string
  durationSeconds: number | null
  width: number | null
  height: number | null
  hasAudio: boolean
}

function videoDto(v: VideoRow): VideoDto {
  return {
    id: v.id,
    url: `/api/videos/${v.id}`,
    durationSeconds: v.durationSeconds,
    width: v.width,
    height: v.height,
    hasAudio: v.hasAudio,
  }
}

/** DTO уже сохранённого видео для генерации (или null, если ещё нет) */
export async function findVideoDto(generationId: string): Promise<VideoDto | null> {
  const [v] = await db
    .select({
      id: videos.id,
      durationSeconds: videos.durationSeconds,
      width: videos.width,
      height: videos.height,
      hasAudio: videos.hasAudio,
    })
    .from(videos)
    .where(eq(videos.videoGenerationId, generationId))
    .limit(1)
  return v ? videoDto(v) : null
}

export type FinalizeOutcome =
  | { status: "not_found" }
  | { status: "processing"; state: "pending" | "in_progress"; transientError?: string }
  | { status: "done"; video: VideoDto | null; cost?: number }
  | { status: "error"; error: string }

/**
 * Опрашивает провайдера и доводит генерацию до терминального состояния.
 * Возвращает нормализованный результат (без HTTP-специфики), пригодный и для
 * ответа клиенту, и для cron-реконсиляции.
 */
export async function finalizeVideoGeneration(genId: string): Promise<FinalizeOutcome> {
  const [gen] = await db
    .select({
      id: videoGenerations.id,
      userId: videoGenerations.userId,
      provider: videoGenerations.provider,
      model: videoGenerations.model,
      status: videoGenerations.status,
      providerJobId: videoGenerations.providerJobId,
      params: videoGenerations.params,
      cost: videoGenerations.cost,
      errorMessage: videoGenerations.errorMessage,
    })
    .from(videoGenerations)
    .where(eq(videoGenerations.id, genId))

  if (!gen) return { status: "not_found" }

  // Терминальные / промежуточные состояния — без обращения к провайдеру
  if (gen.status === "done") {
    return { status: "done", video: await findVideoDto(gen.id), cost: gen.cost ? parseFloat(gen.cost) : undefined }
  }
  if (gen.status === "error") {
    return { status: "error", error: gen.errorMessage || "Ошибка генерации" }
  }
  if (gen.status === "saving") {
    // Другой опрос уже забрал задачу на скачивание
    const v = await findVideoDto(gen.id)
    return v
      ? { status: "done", video: v, cost: gen.cost ? parseFloat(gen.cost) : undefined }
      : { status: "processing", state: "in_progress" }
  }

  // status === "processing": опрашиваем провайдера
  if (!gen.providerJobId) {
    return { status: "processing", state: "pending" }
  }

  const apiKey = await getDecryptedApiKey(gen.userId, gen.provider)
  if (!apiKey) {
    return { status: "processing", state: "pending" }
  }

  let poll
  try {
    poll = await getVideoProvider(gen.provider).poll(gen.providerJobId, apiKey)
  } catch (pollErr) {
    // Транзиентная ошибка опроса — не валим задачу, повторим позже
    const msg = pollErr instanceof Error ? pollErr.message : "Ошибка опроса"
    return { status: "processing", state: "in_progress", transientError: msg }
  }

  if (poll.state === "pending" || poll.state === "in_progress") {
    return { status: "processing", state: poll.state }
  }

  if (poll.state === "failed" || poll.videoUrls.length === 0) {
    const rawErr = poll.error || "Провайдер вернул пустой результат"
    const errMsg = humanizeVideoError(rawErr)
    // Сырой текст провайдера — в лог; в БД/UI идёт человекочитаемая версия
    if (errMsg !== rawErr) console.error(`[video/finalize] ${gen.id} провайдер:`, rawErr)
    await db
      .update(videoGenerations)
      .set({ status: "error", errorMessage: errMsg, completedAt: new Date() })
      .where(and(eq(videoGenerations.id, gen.id), eq(videoGenerations.status, "processing")))
    return { status: "error", error: errMsg }
  }

  // poll.state === "completed": «забираем» задачу, чтобы не сохранить дважды
  const claimed = await db
    .update(videoGenerations)
    .set({ status: "saving" })
    .where(and(eq(videoGenerations.id, gen.id), eq(videoGenerations.status, "processing")))
    .returning({ id: videoGenerations.id })

  if (claimed.length === 0) {
    const v = await findVideoDto(gen.id)
    return v
      ? { status: "done", video: v, cost: gen.cost ? parseFloat(gen.cost) : undefined }
      : { status: "processing", state: "in_progress" }
  }

  try {
    // Скачиваем mp4 авторизованно (unsigned_urls без ключа отдают 401) и кладём в S3
    const { buffer: buf } = await getVideoProvider(gen.provider).fetchVideo(gen.providerJobId, apiKey, 0)

    await ensureBucket()
    const s3Key = `videos/${gen.id}/0.mp4`
    await upload(s3Key, buf, "video/mp4")

    const p = (gen.params || {}) as {
      duration?: number
      resolution?: string
      aspect_ratio?: string
      generate_audio?: boolean
    }
    const { width, height } = dims(p.resolution, p.aspect_ratio)

    const [savedVideo] = await db
      .insert(videos)
      .values({
        videoGenerationId: gen.id,
        s3Key,
        s3Url: s3Key,
        durationSeconds: p.duration ?? null,
        width,
        height,
        format: "mp4",
        hasAudio: Boolean(p.generate_audio),
        sizeBytes: buf.length,
      })
      .returning({ id: videos.id })

    // Стоимость: факт от провайдера, иначе оценка
    const model = getVideoModel(gen.model)
    const cost =
      typeof poll.cost === "number"
        ? poll.cost
        : model
          ? estimateVideoCost(model, {
              durationSeconds: p.duration ?? 0,
              resolution: p.resolution,
              audio: Boolean(p.generate_audio),
            })
          : 0

    await db
      .update(videoGenerations)
      .set({ status: "done", cost: cost.toFixed(4), completedAt: new Date() })
      .where(eq(videoGenerations.id, gen.id))

    if (cost > 0) {
      await db
        .update(user)
        .set({ totalSpent: sql`${user.totalSpent}::numeric + ${cost.toFixed(4)}::numeric` })
        .where(eq(user.id, gen.userId))
    }

    return {
      status: "done",
      video: videoDto({
        id: savedVideo.id,
        durationSeconds: p.duration ?? null,
        width,
        height,
        hasAudio: Boolean(p.generate_audio),
      }),
      cost,
    }
  } catch (saveErr) {
    const msg = saveErr instanceof Error ? saveErr.message : "Ошибка сохранения видео"
    console.error(`[video/finalize] save ${gen.id}:`, msg)
    await db
      .update(videoGenerations)
      .set({ status: "error", errorMessage: msg, completedAt: new Date() })
      .where(eq(videoGenerations.id, gen.id))
    return { status: "error", error: msg }
  }
}

export interface ReconcileSummary {
  swept: number
  done: number
  errored: number
  stillProcessing: number
  orphanedMarked: number
}

/**
 * Серверная дореконсиляция «зависших» видео-задач.
 *
 * Зачем: поллинг статуса целиком клиентский (браузер дёргает `/status`). Если
 * вкладку закрыли/свернули до завершения, задача навсегда осталась бы в
 * `processing` — провайдер мог уже завершить (тогда mp4 не скачался бы в S3) или
 * упасть (тогда ошибка не зафиксировалась бы). Cron раз в 15 минут вызывает эту
 * функцию, и она доводит такие задачи до терминального состояния независимо от
 * браузера.
 *
 * - `processing` + есть `providerJobId`, старше `minAgeMs` → опрос и финализация.
 * - `processing` без `providerJobId` старше 15 мин → помечаем ошибкой (submit не
 *   записал id — задача провайдеру так и не ушла).
 */
export async function reconcileStaleVideoJobs(minAgeMs = 2 * 60 * 1000): Promise<ReconcileSummary> {
  const cutoff = new Date(Date.now() - minAgeMs)

  // 1. Висящие без providerJobId (старше 15 мин) — провайдер их не принял
  const orphanCutoff = new Date(Date.now() - 15 * 60 * 1000)
  const orphaned = await db
    .update(videoGenerations)
    .set({
      status: "error",
      errorMessage: "Задача не была принята провайдером (нет id задачи)",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(videoGenerations.status, "processing"),
        isNull(videoGenerations.providerJobId),
        lt(videoGenerations.createdAt, orphanCutoff),
      ),
    )
    .returning({ id: videoGenerations.id })

  // 2. Активные задачи с id — опрашиваем и финализируем
  const stale = await db
    .select({ id: videoGenerations.id })
    .from(videoGenerations)
    .where(
      and(
        eq(videoGenerations.status, "processing"),
        isNotNull(videoGenerations.providerJobId),
        lt(videoGenerations.createdAt, cutoff),
      ),
    )
    .limit(50)

  let done = 0
  let errored = 0
  let stillProcessing = 0

  for (const row of stale) {
    try {
      const out = await finalizeVideoGeneration(row.id)
      if (out.status === "done") done++
      else if (out.status === "error") errored++
      else stillProcessing++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[video/reconcile] ${row.id}:`, msg)
      stillProcessing++
    }
  }

  return {
    swept: stale.length,
    done,
    errored,
    stillProcessing,
    orphanedMarked: orphaned.length,
  }
}
