import type { TtsVoiceSettings } from "@/lib/providers/voice-models"
import type { FeedStatus } from "@/lib/history/merge"
import type { VoiceHistoryAudio, VoiceHistoryItem } from "@/lib/voice/history"

/**
 * Озвучка на /voice: свежая (запущена в этой вкладке) или из истории в БД.
 * Одна модель для карточек, досмотра «в работе» и «Повторить».
 */
export interface VoiceJob {
  id: string
  status: FeedStatus
  text: string
  modelId: string
  modelName: string
  providerLabel: string
  voice: string
  voiceName: string
  settings?: Partial<TtsVoiceSettings>
  speed?: number
  settingsSummary?: string | null
  audio?: VoiceHistoryAudio
  error?: string
  cost?: number | null
  /** Время запуска (мс) — сортировка и слияние с историей */
  startedAt: number
  /** Загружено из истории (а не запущено в этой вкладке) */
  fromHistory?: boolean
}

export function voiceJobFromHistory(item: VoiceHistoryItem): VoiceJob {
  return {
    id: item.id,
    status: item.status,
    text: item.text,
    modelId: item.modelId,
    modelName: item.modelName,
    providerLabel: item.providerLabel,
    voice: item.voice,
    voiceName: item.voiceName,
    settings: item.settings,
    speed: item.speed,
    settingsSummary: item.settingsSummary,
    audio: item.audio ?? undefined,
    error: item.error,
    cost: item.cost,
    startedAt: new Date(item.createdAt).getTime(),
    fromHistory: true,
  }
}
