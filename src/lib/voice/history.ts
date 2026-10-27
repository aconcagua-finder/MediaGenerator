import {
  DEFAULT_TTS_SETTINGS,
  getVoiceModel,
  normalizeTtsSettings,
  type TtsVoiceSettings,
} from "@/lib/providers/voice-models"
import { STALE_SYNC_JOB_ERROR, syncJobStatus, type FeedStatus } from "@/lib/history/merge"
import { humanizeVoiceError } from "./humanize-error"

/**
 * «Мои озвучки» на /voice: чистая сборка карточек истории из строк БД (без сети
 * и БД — покрыто тестами). Запрос — `GET /api/voice/history`.
 */

export interface VoiceHistoryAudio {
  id: string
  url: string
  format: string
  durationSeconds: number | null
  sizeBytes: number | null
}

export interface VoiceHistoryItem {
  id: string
  /** id модели в реестре (`elevenlabs/eleven_v4`, `microsoft/mai-voice-2`) */
  modelId: string
  modelName: string
  provider: "elevenlabs" | "openrouter"
  /** «ElevenLabs» / «OpenRouter» */
  providerLabel: string
  /** voice_id ElevenLabs или id голоса OpenRouter */
  voice: string
  voiceName: string
  text: string
  status: FeedStatus
  error?: string
  cost: number | null
  /** ISO-время создания */
  createdAt: string
  /** ElevenLabs: сохранённые тонкие настройки (только заданные поля; для «Повторить») */
  settings?: Partial<TtsVoiceSettings>
  /** OpenRouter: скорость */
  speed?: number
  /** Коротко о настройках, отличных от умолчаний («скорость 1.10×»), или null */
  settingsSummary: string | null
  audio: VoiceHistoryAudio | null
}

export interface VoiceHistoryRow {
  id: string
  provider: string
  model: string
  text: string
  voice: string
  params: unknown
  status: string
  cost: string | null
  errorMessage: string | null
  createdAt: Date | string
}

export interface VoiceHistoryAudioRow {
  id: string
  voiceGenerationId: string
  format: string
  durationSeconds: number | null
  sizeBytes: number | null
}

const PROVIDER_LABEL: Record<string, string> = { elevenlabs: "ElevenLabs", openrouter: "OpenRouter" }

const pct = (v: number) => `${Math.round(v * 100)}%`

/** Настройки, отличные от умолчаний, одной строкой */
export function ttsSettingsSummary(settings: Partial<TtsVoiceSettings> | undefined, speed?: number): string | null {
  const parts: string[] = []
  if (settings) {
    const d = DEFAULT_TTS_SETTINGS
    const differs = (v: number | undefined, def: number): v is number => typeof v === "number" && v !== def
    if (differs(settings.stability, d.stability)) parts.push(`стабильность ${pct(settings.stability)}`)
    if (differs(settings.similarity_boost, d.similarity_boost)) parts.push(`похожесть ${pct(settings.similarity_boost)}`)
    if (differs(settings.style, d.style)) parts.push(`выразительность ${pct(settings.style)}`)
    if (settings.use_speaker_boost === false) parts.push("без усиления")
    if (differs(settings.speed, d.speed)) parts.push(`скорость ${settings.speed.toFixed(2)}×`)
  } else if (typeof speed === "number" && speed !== 1) {
    parts.push(`скорость ${speed.toFixed(2)}×`)
  }
  return parts.length ? parts.join(" · ") : null
}

function asParams(params: unknown): Record<string, unknown> {
  return params && typeof params === "object" ? (params as Record<string, unknown>) : {}
}

export function buildVoiceHistory(input: {
  rows: VoiceHistoryRow[]
  audios: VoiceHistoryAudioRow[]
  now?: number
}): VoiceHistoryItem[] {
  const now = input.now ?? Date.now()
  const audioByGen = new Map<string, VoiceHistoryAudioRow>()
  for (const a of input.audios) if (!audioByGen.has(a.voiceGenerationId)) audioByGen.set(a.voiceGenerationId, a)

  return input.rows.map((row) => {
    const model = getVoiceModel(row.model)
    const p = asParams(row.params)
    const provider = row.provider === "elevenlabs" ? "elevenlabs" : "openrouter"
    const status = syncJobStatus(row.status, row.createdAt, now)
    const voiceName =
      (typeof p.voice_name === "string" && p.voice_name) ||
      model?.voices.find((v) => v.id === row.voice)?.label ||
      row.voice
    // У ElevenLabs настройки хранятся уже санитизированными под модель; берём
    // только заданные поля (бывают и пустые `{}`), числа зажимаем повторно
    const raw = provider === "elevenlabs" && p.settings && typeof p.settings === "object" ? (p.settings as object) : null
    const settings =
      raw && Object.keys(raw).length > 0
        ? (Object.fromEntries(
            Object.entries(normalizeTtsSettings(raw)).filter(([k]) => k in raw),
          ) as Partial<TtsVoiceSettings>)
        : undefined
    const speed = provider === "openrouter" && typeof p.speed === "number" ? p.speed : undefined
    const a = status === "done" ? audioByGen.get(row.id) : undefined
    const item: VoiceHistoryItem = {
      id: row.id,
      modelId: row.model,
      modelName: model?.name ?? row.model,
      provider,
      providerLabel: PROVIDER_LABEL[provider],
      voice: row.voice,
      voiceName,
      text: row.text,
      status,
      cost: row.cost != null ? parseFloat(row.cost) : null,
      createdAt: new Date(row.createdAt).toISOString(),
      settings,
      speed,
      settingsSummary: ttsSettingsSummary(settings, speed),
      audio: a
        ? {
            id: a.id,
            url: `/api/audios/${a.id}`,
            format: a.format,
            durationSeconds: a.durationSeconds,
            sizeBytes: a.sizeBytes,
          }
        : null,
    }
    if (status === "error") {
      item.error = mapFeedError(row)
    }
    return item
  })
}

function mapFeedError(row: VoiceHistoryRow): string {
  // «Зависшая» задача (процесс оборвался) — ошибки в строке нет
  if (row.status !== "error") return STALE_SYNC_JOB_ERROR
  return humanizeVoiceError(row.errorMessage || "") || "Не удалось синтезировать речь"
}
