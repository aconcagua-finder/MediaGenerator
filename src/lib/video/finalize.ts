import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { videoGenerations, videos, user } from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { getVideoProvider } from "@/lib/providers/video/registry"
import { getVideoModel, estimateVideoCost, estimateV2VCost } from "@/lib/providers/video-models"
import { getVoiceEngineByEndpoint, estimateVoiceChangeCost } from "@/lib/providers/voice-change-models"
import { upload, ensureBucket, remove as s3Remove } from "@/lib/storage/s3"
import { revokeLinksForGeneration, cleanupExpiredMediaSources } from "@/lib/media-link/links"
import { humanizeVideoError } from "./humanize-error"
import { buildResultVideo } from "./result-video"
import { startVoiceChange } from "./voice-change"
import { readVoiceOver, voiceOverDto, type VoiceOverFollowUp, type VoiceOverParams } from "./voice-over"

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
  | { status: "done"; video: VideoDto | null; cost?: number; voiceOver?: VoiceOverFollowUp }
  | { status: "error"; error: string }

/**
 * Запуск автопереозвучки готового v2v-видео. Ошибка запуска не валит саму
 * генерацию: видео с исходным звуком уже в библиотеке, ошибку показываем рядом.
 */
async function startAutoVoiceOver(opts: {
  genId: string
  userId: string
  /** null — в результате нет звука */
  videoId: string | null
  voiceOver: VoiceOverParams
}): Promise<VoiceOverFollowUp> {
  let result: { generation_id?: string; error?: string }
  if (!opts.videoId) {
    result = { error: "В результате нет звука — переозвучивать нечего" }
  } else {
    try {
      const started = await startVoiceChange({
        userId: opts.userId,
        isAdmin: false,
        videoId: opts.videoId,
        engine: opts.voiceOver.engine,
        voice: opts.voiceOver.voice,
        skipLimits: true,
        parentGenerationId: opts.genId,
      })
      result = started.ok ? { generation_id: started.generationId } : { error: started.error }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Не удалось запустить переозвучку"
      console.error(`[video/finalize] автопереозвучка ${opts.genId}:`, raw)
      result = { error: humanizeVideoError(raw) }
    }
  }
  const stored: VoiceOverParams = { ...opts.voiceOver, ...result }
  try {
    // Точечно дописываем voice_over, не трогая остальные поля params
    await db
      .update(videoGenerations)
      .set({ params: sql`coalesce(${videoGenerations.params}, '{}'::jsonb) || jsonb_build_object('voice_over', ${JSON.stringify(stored)}::jsonb)` })
      .where(eq(videoGenerations.id, opts.genId))
  } catch (err) {
    // Видео уже сохранено и оплачено — не валим генерацию; зависшую запись подберёт реконсилятор
    console.error(`[video/finalize] запись voice_over ${opts.genId}:`, err instanceof Error ? err.message : err)
  }
  return voiceOverDto(stored)!
}

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
      mode: videoGenerations.mode,
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
    return {
      status: "done",
      video: await findVideoDto(gen.id),
      cost: gen.cost ? parseFloat(gen.cost) : undefined,
      voiceOver: voiceOverDto(readVoiceOver(gen.params)),
    }
  }
  if (gen.status === "error") {
    return { status: "error", error: gen.errorMessage || "Ошибка генерации" }
  }
  if (gen.status === "saving") {
    // Другой опрос уже забрал задачу на скачивание
    const v = await findVideoDto(gen.id)
    return v
      ? {
          status: "done",
          video: v,
          cost: gen.cost ? parseFloat(gen.cost) : undefined,
          voiceOver: voiceOverDto(readVoiceOver(gen.params)),
        }
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

  const jobCtx = { model: gen.model, params: (gen.params || null) as Record<string, unknown> | null }

  let poll
  try {
    poll = await getVideoProvider(gen.provider).poll(gen.providerJobId, apiKey, jobCtx)
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
    await releaseGenerationResources(gen.id)
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
      ? {
          status: "done",
          video: v,
          cost: gen.cost ? parseFloat(gen.cost) : undefined,
          voiceOver: voiceOverDto(readVoiceOver(gen.params)),
        }
      : { status: "processing", state: "in_progress" }
  }

  try {
    // Скачиваем результат авторизованно (unsigned_urls без ключа отдают 401) и кладём в S3
    const { buffer: fetched } = await getVideoProvider(gen.provider).fetchVideo(
      gen.providerJobId,
      apiKey,
      0,
      jobCtx
    )

    const p = (gen.params || {}) as {
      duration?: number
      resolution?: string
      aspect_ratio?: string
      generate_audio?: boolean
      source_has_audio?: boolean
      source_video_id?: string
    }

    // v2v / замена голоса: реальные размеры и длительность берём из ffprobe самого
    // результата (у v2v нет ни duration, ни resolution в параметрах); для голоса
    // сначала подкладываем новый звук под исходное видео
    let buf = fetched
    let width: number | null
    let height: number | null
    let durationSeconds: number | null = p.duration ?? null
    let hasAudio = Boolean(p.generate_audio)
    if (gen.mode === "v2v" || gen.mode === "voice") {
      const built = await buildResultVideo({
        mode: gen.mode,
        fetched,
        sourceVideoId: p.source_video_id,
        fallbackAudio: gen.mode === "v2v" ? Boolean(p.source_has_audio) : true,
        fallbackDuration: p.duration ?? null,
      })
      buf = built.buffer
      width = built.width
      height = built.height
      durationSeconds = built.durationSeconds
      hasAudio = built.hasAudio
    } else {
      ;({ width, height } = dims(p.resolution, p.aspect_ratio))
    }

    await ensureBucket()
    const s3Key = `videos/${gen.id}/0.mp4`
    await upload(s3Key, buf, "video/mp4")

    const [savedVideo] = await db
      .insert(videos)
      .values({
        videoGenerationId: gen.id,
        s3Key,
        s3Url: s3Key,
        durationSeconds,
        width,
        height,
        format: "mp4",
        hasAudio,
        sizeBytes: buf.length,
      })
      .returning({ id: videos.id })

    // Стоимость: факт от провайдера, иначе оценка
    const model = getVideoModel(gen.model)
    let estimated = 0
    if (gen.mode === "voice") {
      const engine = getVoiceEngineByEndpoint(gen.model)
      estimated = engine ? estimateVoiceChangeCost(engine, p.duration ?? 0) : 0
    } else if (gen.mode === "v2v") {
      estimated = model ? estimateV2VCost(model, p.duration ?? 0) : 0
    } else if (model) {
      estimated = estimateVideoCost(model, {
        durationSeconds: p.duration ?? 0,
        resolution: p.resolution,
        audio: Boolean(p.generate_audio),
      })
    }
    const cost = typeof poll.cost === "number" ? poll.cost : estimated

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

    await releaseGenerationResources(gen.id)

    // Заказанная при запуске переозвучка (только v2v и только если в результате есть звук)
    const requestedVoiceOver = gen.mode === "v2v" ? readVoiceOver(gen.params) : null
    let voiceOver: VoiceOverFollowUp | undefined
    if (requestedVoiceOver) {
      voiceOver = await startAutoVoiceOver({
        genId: gen.id,
        userId: gen.userId,
        videoId: hasAudio ? savedVideo.id : null,
        voiceOver: requestedVoiceOver,
      })
    }

    return {
      status: "done",
      video: videoDto({
        id: savedVideo.id,
        durationSeconds,
        width,
        height,
        hasAudio,
      }),
      cost,
      voiceOver,
    }
  } catch (saveErr) {
    const msg = saveErr instanceof Error ? saveErr.message : "Ошибка сохранения видео"
    console.error(`[video/finalize] save ${gen.id}:`, msg)
    // Только если ещё не done: после сохранения видео ошибка не должна перечёркивать результат
    const failed = await db
      .update(videoGenerations)
      .set({ status: "error", errorMessage: msg, completedAt: new Date() })
      .where(and(eq(videoGenerations.id, gen.id), eq(videoGenerations.status, "saving")))
      .returning({ id: videoGenerations.id })
    if (failed.length === 0) {
      return { status: "done", video: await findVideoDto(gen.id), cost: gen.cost ? parseFloat(gen.cost) : undefined }
    }
    await releaseGenerationResources(gen.id)
    return { status: "error", error: msg }
  }
}

/**
 * Завершение задачи (успех или ошибка): отзываем публичные ссылки на входные
 * файлы и удаляем временный звук замены голоса. Исходное видео v2v остаётся
 * до TTL (24 ч), чтобы можно было повторить задачу с другим промптом (например,
 * после отказа модерации) без повторной загрузки.
 */
export async function releaseGenerationResources(genId: string): Promise<void> {
  try {
    await revokeLinksForGeneration(genId)
    await s3Remove(`video-sources/${genId}/audio.mp3`).catch(() => {})
  } catch (err) {
    console.error(`[video/finalize] release ${genId}:`, err instanceof Error ? err.message : err)
  }
}

const VOICE_OVER_STUCK_ERROR = "Переозвучка не запустилась. Запустите её вручную кнопкой «Заменить голос»."

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
  for (const o of orphaned) await releaseGenerationResources(o.id)

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

  // 3. Автопереозвучка, которая так и не запустилась (процесс упал между сохранением
  // видео и запуском замены голоса) — помечаем ошибкой, чтобы клиент не ждал вечно
  const voiceOverCutoff = new Date(Date.now() - 10 * 60 * 1000)
  try {
    await db
      .update(videoGenerations)
      .set({
        params: sql`jsonb_set(${videoGenerations.params}, '{voice_over,error}', to_jsonb(${VOICE_OVER_STUCK_ERROR}::text))`,
      })
      .where(
        and(
          eq(videoGenerations.status, "done"),
          eq(videoGenerations.mode, "v2v"),
          sql`${videoGenerations.params} ? 'voice_over'`,
          sql`not (${videoGenerations.params}->'voice_over' ? 'generation_id')`,
          sql`not (${videoGenerations.params}->'voice_over' ? 'error')`,
          lt(videoGenerations.completedAt, voiceOverCutoff),
        ),
      )
  } catch (err) {
    console.error("[video/reconcile] voice_over sweep:", err instanceof Error ? err.message : err)
  }

  // 4. Дочистка загруженных исходников v2v / образцов голоса старше 24 ч и мёртвых ссылок
  try {
    const cleaned = await cleanupExpiredMediaSources()
    if (cleaned.sources > 0 || cleaned.links > 0) {
      console.log("[video/reconcile] media cleanup", JSON.stringify(cleaned))
    }
  } catch (err) {
    console.error("[video/reconcile] media cleanup:", err instanceof Error ? err.message : err)
  }

  return {
    swept: stale.length,
    done,
    errored,
    stillProcessing,
    orphanedMarked: orphaned.length,
  }
}
