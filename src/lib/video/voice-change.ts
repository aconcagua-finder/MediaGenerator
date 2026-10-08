import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { videos, videoGenerations, videoCompositions, videoSources } from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { falSubmit } from "@/lib/providers/video/fal-video"
import {
  buildVoiceChangeInput,
  estimateVoiceChangeCost,
  getVoiceEngine,
  resolveVoicePreset,
  voicePresetTitle,
} from "@/lib/providers/voice-change-models"
import { downloadToFile, ensureBucket, upload } from "@/lib/storage/s3"
import { createMediaLink } from "@/lib/media-link/links"
import { LINK_TTL_MS } from "@/lib/media-link/token"
import { extractAudio } from "./ffmpeg-audio"
import { probeFile } from "./probe"
import { checkVideoLimits } from "./limits"
import { fileExtension } from "./source-limits"
import { humanizeVideoError } from "./humanize-error"
import { releaseGenerationResources } from "./finalize"

export interface StartVoiceChangeOptions {
  userId: string
  isAdmin: boolean
  /** id видео из библиотеки (`videos.id`) */
  videoId: string
  engine: string
  /** Имя пресета голоса (см. voice-change-models.ts) */
  voice?: string
  /** Chatterbox: id загруженного образца голоса */
  sampleSourceId?: string
  /**
   * Автопереозвучка после v2v: лимиты уже проверены при запуске генерации
   * (оценка включала переозвучку), повторно не проверяем.
   */
  skipLimits?: boolean
  /** v2v-генерация, после которой запущена автопереозвучка */
  parentGenerationId?: string
}

export type StartVoiceChangeResult =
  | { ok: true; generationId: string; estimate: number }
  | { ok: false; error: string; status: number }

/**
 * Запуск замены голоса на готовом видео библиотеки (через fal.ai).
 * Звук вынимается ffmpeg'ом → уходит в fal (по временной публичной ссылке) →
 * по готовности `finalize.ts` подкладывает новый звук под исходное видео
 * (`-c:v copy`) и сохраняет как НОВОЕ видео. Задача — обычная строка
 * `video_generations` (mode `voice`), поэтому статус/cron/биллинг общие.
 *
 * Используется ручной кнопкой (`POST /api/video/voice-change`) и
 * автопереозвучкой после видео → видео (`finalize.ts`).
 */
export async function startVoiceChange(opts: StartVoiceChangeOptions): Promise<StartVoiceChangeResult> {
  const engine = getVoiceEngine(opts.engine)
  if (!opts.videoId || !engine) {
    return { ok: false, error: "Укажите видео и движок замены голоса", status: 400 }
  }

  // Видео принадлежит либо генерации, либо склейке (см. videos_owner_xor)
  const [video] = await db
    .select({
      s3Key: videos.s3Key,
      hasAudio: videos.hasAudio,
      genOwnerId: videoGenerations.userId,
      compOwnerId: videoCompositions.userId,
    })
    .from(videos)
    .leftJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
    .leftJoin(videoCompositions, eq(videos.compositionId, videoCompositions.id))
    .where(eq(videos.id, opts.videoId))
  if (!video) {
    return { ok: false, error: "Видео не найдено", status: 404 }
  }
  const ownerId = video.genOwnerId ?? video.compOwnerId
  if (ownerId !== opts.userId && !opts.isAdmin) {
    return { ok: false, error: "Нет доступа", status: 403 }
  }
  if (!video.hasAudio) {
    return { ok: false, error: "В этом видео нет звука — менять голос не у чего", status: 400 }
  }

  // Образец голоса (только движки, которые его умеют)
  let sample: { id: string; s3Key: string; contentType: string; sizeBytes: number } | null = null
  if (opts.sampleSourceId) {
    if (!engine.supportsSample) {
      return {
        ok: false,
        error: `${engine.name} не умеет брать голос из образца. Выберите готовый голос или Chatterbox HD.`,
        status: 400,
      }
    }
    const [row] = await db.select().from(videoSources).where(eq(videoSources.id, opts.sampleSourceId))
    if (!row || row.kind !== "audio") {
      return { ok: false, error: "Образец голоса не найден — загрузите его заново", status: 404 }
    }
    if (row.userId !== opts.userId) {
      return { ok: false, error: "Нет доступа к файлу", status: 403 }
    }
    if (Date.now() - row.createdAt.getTime() > LINK_TTL_MS) {
      return { ok: false, error: "Образец голоса устарел — загрузите его заново", status: 410 }
    }
    sample = { id: row.id, s3Key: row.s3Key, contentType: row.contentType, sizeBytes: row.sizeBytes }
  }

  const apiKey = await getDecryptedApiKey(opts.userId, "fal")
  if (!apiKey) {
    return { ok: false, error: "Нужен ключ fal.ai. Администратор добавляет его в Настройках.", status: 400 }
  }

  const genId = randomUUID()
  const workDir = await mkdtemp(join(tmpdir(), "mg-voice-"))
  try {
    // Достаём звук из видео
    const videoPath = join(workDir, "video.mp4")
    const audioPath = join(workDir, "audio.mp3")
    await downloadToFile(video.s3Key, videoPath)
    const probe = await probeFile(videoPath)
    if (!probe || !probe.hasAudio) {
      return { ok: false, error: "Не удалось найти звук в видео", status: 400 }
    }
    const audioSeconds = probe.durationSeconds
    const estimate = estimateVoiceChangeCost(engine, audioSeconds)

    if (!opts.skipLimits) {
      const limitFailure = await checkVideoLimits({ userId: opts.userId, isAdmin: opts.isAdmin, estimate })
      if (limitFailure) {
        return { ok: false, error: limitFailure.error, status: limitFailure.status }
      }
    }

    await extractAudio(videoPath, audioPath)
    const audioBuffer = await readFile(audioPath)
    const audioKey = `video-sources/${genId}/audio.mp3`
    await ensureBucket()
    await upload(audioKey, audioBuffer, "audio/mpeg")

    const preset = resolveVoicePreset(engine, opts.voice)
    const baseParams = {
      duration: audioSeconds,
      source_video_id: opts.videoId,
      engine: engine.id,
      voice: sample ? null : preset.id,
      sample_source_id: sample?.id ?? null,
      ...(opts.parentGenerationId ? { parent_generation_id: opts.parentGenerationId } : {}),
    }
    await db.insert(videoGenerations).values({
      id: genId,
      userId: opts.userId,
      provider: "fal",
      model: engine.endpoint,
      prompt: sample
        ? `Замена голоса: свой образец (${engine.name})`
        : `Замена голоса: ${voicePresetTitle(preset)} (${engine.name})`,
      mode: "voice",
      params: baseParams,
      status: "processing",
    })

    try {
      const audioUrl = await createMediaLink({
        s3Key: audioKey,
        contentType: "audio/mpeg",
        sizeBytes: audioBuffer.length,
        purpose: "voice-audio",
        userId: opts.userId,
        generationId: genId,
        filename: "audio.mp3",
      })
      const sampleUrl = sample
        ? await createMediaLink({
            s3Key: sample.s3Key,
            contentType: sample.contentType,
            sizeBytes: sample.sizeBytes,
            purpose: "voice-sample",
            userId: opts.userId,
            generationId: genId,
            filename: `sample.${fileExtension(sample.s3Key) || "mp3"}`,
          })
        : undefined

      const input = buildVoiceChangeInput({
        engine,
        audioUrl,
        presetId: preset.id,
        sampleUrl,
      })
      const submitted = await falSubmit(engine.endpoint, input, apiKey)

      await db
        .update(videoGenerations)
        .set({
          providerJobId: submitted.requestId,
          params: {
            ...baseParams,
            providerState: { statusUrl: submitted.statusUrl, responseUrl: submitted.responseUrl },
          },
        })
        .where(eq(videoGenerations.id, genId))

      return { ok: true, generationId: genId, estimate }
    } catch (submitError) {
      const raw = submitError instanceof Error ? submitError.message : "Не удалось отправить задачу"
      console.error(`[video/voice-change] ${engine.endpoint}:`, raw)
      const message = humanizeVideoError(raw)
      await db
        .update(videoGenerations)
        .set({ status: "error", errorMessage: message, completedAt: new Date() })
        .where(eq(videoGenerations.id, genId))
      await releaseGenerationResources(genId)
      return { ok: false, error: message, status: 502 }
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
