import type { HistoryMode, HistorySource, HistoryVideo, VideoHistoryItem } from "@/lib/video/history"

/**
 * Задача на /video: свежая (запущена в этой вкладке) или из истории в БД. Одна
 * модель для карточек, поллинга статуса и «Повторить с этим промптом».
 */

export type VideoResult = HistoryVideo

export interface VoiceOverJob {
  /** Голос ElevenLabs (voice_id) */
  voice: string
  /** Подпись голоса */
  voiceName: string
  status: "waiting" | "processing" | "done" | "error"
  generationId?: string
  video?: VideoResult
  error?: string
  /** Тонкие настройки — для «Повторить» */
  settings?: unknown
}

export interface VideoJob {
  id: string
  status: "processing" | "done" | "error"
  prompt: string
  modelName: string
  aspect: string
  /** Время запуска (мс): для счётчика «в работе» и сортировки истории */
  startedAt: number
  video?: VideoResult
  error?: string
  /** Автопереозвучка через ElevenLabs после видео → видео */
  voiceOver?: VoiceOverJob
  /** Для «Повторить с этим промптом» и подписи режима */
  modelId: string
  mode: HistoryMode
  params?: VideoHistoryItem["params"]
  /** v2v: исходник (null — уже удалён, хранится 24 ч) */
  source?: HistorySource | null
  cost?: number | null
  /** Загружено из истории (а не запущено в этой вкладке) */
  fromHistory?: boolean
}

export const MODE_LABELS: Record<HistoryMode, string> = {
  t2v: "Текст → видео",
  i2v: "Картинка → видео",
  v2v: "Видео → видео",
  voice: "Замена голоса",
}

/** Карточка истории (из БД) → задача формы: тот же вид и тот же поллинг, что у свежих */
export function jobFromHistory(item: VideoHistoryItem): VideoJob {
  return {
    id: item.id,
    status: item.status,
    prompt: item.prompt,
    modelName: item.modelName,
    aspect: item.aspect,
    startedAt: new Date(item.createdAt).getTime(),
    video: item.video ?? undefined,
    error: item.error,
    voiceOver: item.voiceOver
      ? {
          voice: item.voiceOver.voice,
          voiceName: item.voiceOver.voiceName,
          status: item.voiceOver.status,
          generationId: item.voiceOver.generationId,
          video: item.voiceOver.video,
          error: item.voiceOver.error,
          settings: item.voiceOver.settings,
        }
      : undefined,
    modelId: item.modelId,
    mode: item.mode,
    params: item.params,
    source: item.source,
    cost: item.cost,
    fromHistory: true,
  }
}
