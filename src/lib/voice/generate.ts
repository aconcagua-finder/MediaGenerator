import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { voiceGenerations, audios, user } from "@/lib/db/schema"
import { getVoiceProvider } from "@/lib/providers/voice/registry"
import { getVoiceModel, estimateVoiceCost } from "@/lib/providers/voice-models"
import { upload, ensureBucket } from "@/lib/storage/s3"
import { humanizeVoiceError } from "./humanize-error"

/**
 * Синтез одной озвучки: вызов провайдера → загрузка аудио в S3 → списание
 * стоимости, либо пометка ошибки. Синхронный аналог video/finalize.ts.
 *
 * Идемпотентна и безопасна при повторном вызове: переход `processing → saving`
 * защищён условием `status = 'processing'` в UPDATE, поэтому файл не сохранится
 * и стоимость не спишется дважды.
 */

export interface AudioDto {
  id: string
  url: string
  format: string
  durationSeconds: number | null
  sizeBytes: number | null
}

interface AudioRow {
  id: string
  durationSeconds: number | null
  format: string
  sizeBytes: number | null
}

function audioDto(a: AudioRow): AudioDto {
  return {
    id: a.id,
    url: `/api/audios/${a.id}`,
    format: a.format,
    durationSeconds: a.durationSeconds,
    sizeBytes: a.sizeBytes,
  }
}

async function findAudioDto(generationId: string): Promise<AudioDto | null> {
  const [a] = await db
    .select({
      id: audios.id,
      durationSeconds: audios.durationSeconds,
      format: audios.format,
      sizeBytes: audios.sizeBytes,
    })
    .from(audios)
    .where(eq(audios.voiceGenerationId, generationId))
    .limit(1)
  return a ? audioDto(a) : null
}

export type VoiceOutcome =
  | { status: "not_found" }
  | { status: "done"; audio: AudioDto | null; cost?: number }
  | { status: "error"; error: string }

export async function runVoiceGeneration(genId: string, apiKey: string): Promise<VoiceOutcome> {
  const [gen] = await db
    .select({
      id: voiceGenerations.id,
      userId: voiceGenerations.userId,
      provider: voiceGenerations.provider,
      model: voiceGenerations.model,
      text: voiceGenerations.text,
      voice: voiceGenerations.voice,
      format: voiceGenerations.format,
      params: voiceGenerations.params,
      status: voiceGenerations.status,
      cost: voiceGenerations.cost,
      errorMessage: voiceGenerations.errorMessage,
    })
    .from(voiceGenerations)
    .where(eq(voiceGenerations.id, genId))

  if (!gen) return { status: "not_found" }

  // Терминальные состояния — без обращения к провайдеру
  if (gen.status === "done") {
    return { status: "done", audio: await findAudioDto(gen.id), cost: gen.cost ? parseFloat(gen.cost) : undefined }
  }
  if (gen.status === "error") {
    return { status: "error", error: gen.errorMessage || "Ошибка озвучки" }
  }

  const model = getVoiceModel(gen.model)
  if (!model) {
    await db
      .update(voiceGenerations)
      .set({ status: "error", errorMessage: "Неизвестная модель озвучки", completedAt: new Date() })
      .where(eq(voiceGenerations.id, gen.id))
    return { status: "error", error: "Неизвестная модель озвучки" }
  }

  // «Забираем» задачу, чтобы не сохранить/не списать дважды
  const claimed = await db
    .update(voiceGenerations)
    .set({ status: "saving" })
    .where(and(eq(voiceGenerations.id, gen.id), eq(voiceGenerations.status, "processing")))
    .returning({ id: voiceGenerations.id })

  if (claimed.length === 0) {
    const a = await findAudioDto(gen.id)
    return a
      ? { status: "done", audio: a, cost: gen.cost ? parseFloat(gen.cost) : undefined }
      : { status: "error", error: gen.errorMessage || "Озвучка уже обрабатывается" }
  }

  try {
    const speed = ((gen.params || {}) as { speed?: number }).speed
    const provider = getVoiceProvider(gen.provider)
    const result = await provider.synth(
      {
        model: gen.model,
        text: gen.text,
        voice: gen.voice,
        requestFormat: model.requestFormat,
        speed,
      },
      apiKey,
    )

    // Длительность считаем только для WAV (знаем параметры PCM); у mp3 — null,
    // плеер всё равно покажет её из метаданных файла.
    let durationSeconds: number | null = null
    if (result.pcm) {
      const bytesPerSample = result.pcm.bitsPerSample / 8
      const pcmBytes = result.buffer.length - 44 // вычитаем WAV-заголовок
      const denom = result.pcm.sampleRate * result.pcm.channels * bytesPerSample
      if (denom > 0 && pcmBytes > 0) durationSeconds = Math.round(pcmBytes / denom)
    }

    await ensureBucket()
    const s3Key = `audios/${gen.id}/0.${result.outputFormat}`
    await upload(s3Key, result.buffer, result.contentType)

    const [savedAudio] = await db
      .insert(audios)
      .values({
        voiceGenerationId: gen.id,
        s3Key,
        s3Url: s3Key,
        durationSeconds,
        format: result.outputFormat,
        sizeBytes: result.buffer.length,
      })
      .returning({ id: audios.id })

    // Стоимость: факт от провайдера (часто недоступен для TTS), иначе оценка по символам
    let cost: number | null = null
    if (result.generationId) {
      cost = await provider.fetchCost(result.generationId, apiKey)
    }
    if (cost == null) cost = estimateVoiceCost(model, gen.text.length)

    await db
      .update(voiceGenerations)
      .set({ status: "done", cost: cost.toFixed(4), completedAt: new Date() })
      .where(eq(voiceGenerations.id, gen.id))

    if (cost > 0) {
      await db
        .update(user)
        .set({ totalSpent: sql`${user.totalSpent}::numeric + ${cost.toFixed(4)}::numeric` })
        .where(eq(user.id, gen.userId))
    }

    return {
      status: "done",
      audio: audioDto({ id: savedAudio.id, durationSeconds, format: result.outputFormat, sizeBytes: result.buffer.length }),
      cost,
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Ошибка синтеза речи"
    const msg = humanizeVoiceError(raw)
    if (msg !== raw) console.error(`[voice/generate] ${gen.id} провайдер:`, raw)
    await db
      .update(voiceGenerations)
      .set({ status: "error", errorMessage: msg, completedAt: new Date() })
      .where(eq(voiceGenerations.id, gen.id))
    return { status: "error", error: msg }
  }
}
