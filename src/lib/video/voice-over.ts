import type { VoiceSettings } from "@/lib/providers/voice-change-models"

/**
 * Состояние автопереозвучки v2v-генерации в `params.voice_over` (jsonb):
 * `{ engine, voice, voice_name, settings }` при запуске генерации, затем
 * дописываются `generation_id` (задача замены голоса) или `error`.
 * У задач до перехода на прямой ElevenLabs `voice_name`/`settings` нет.
 */

/**
 * Автопереозвучка после v2v (если была заказана): id запущенной задачи замены
 * голоса или текст ошибки запуска. Исходное видео при этом уже готово.
 */
export interface VoiceOverFollowUp {
  voice: string
  /** Подпись голоса для UI (у старых задач — сам voice) */
  voiceName: string
  generationId?: string
  error?: string
}

export interface VoiceOverParams {
  engine: string
  voice: string
  voice_name?: string
  settings?: VoiceSettings
  generation_id?: string
  error?: string
}

export function readVoiceOver(params: unknown): VoiceOverParams | null {
  const vo = (params as { voice_over?: VoiceOverParams } | null)?.voice_over
  return vo && typeof vo.voice === "string" ? vo : null
}

export function voiceOverDto(vo: VoiceOverParams | null): VoiceOverFollowUp | undefined {
  if (!vo) return undefined
  const voiceName = vo.voice_name || vo.voice
  if (!vo.generation_id && !vo.error) {
    // Запуск ещё не записан (идёт прямо сейчас в другом опросе)
    return { voice: vo.voice, voiceName }
  }
  return { voice: vo.voice, voiceName, generationId: vo.generation_id, error: vo.error }
}

/** Подпись голоса задачи замены голоса: `voice_name` (ElevenLabs), иначе `voice` (пресет fal) */
export function voiceNameFromParams(params: unknown): string | null {
  const p = (params && typeof params === "object" ? params : {}) as { voice_name?: unknown; voice?: unknown }
  if (typeof p.voice_name === "string" && p.voice_name) return p.voice_name
  return typeof p.voice === "string" && p.voice ? p.voice : null
}

/**
 * Подпись переозвученного v2v: «Переозвучка: Marina · <исходный промпт>». У самой
 * строки переозвучки промпт служебный («Замена голоса: …»), поэтому исходный
 * берётся у родителя (история на /video, Библиотека). Без сети — годится и для UI.
 */
export function voiceOverLabel(voiceName: string | null, parentPrompt: string): string {
  const prompt = parentPrompt.trim()
  return `Переозвучка: ${voiceName || "другой голос"}${prompt ? ` · ${prompt}` : ""}`
}
