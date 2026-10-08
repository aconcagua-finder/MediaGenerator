/**
 * Состояние автопереозвучки v2v-генерации в `params.voice_over` (jsonb):
 * `{ engine, voice }` при запуске генерации, затем дописываются
 * `generation_id` (задача замены голоса) или `error`.
 */

/**
 * Автопереозвучка после v2v (если была заказана): id запущенной задачи замены
 * голоса или текст ошибки запуска. Исходное видео при этом уже готово.
 */
export interface VoiceOverFollowUp {
  voice: string
  generationId?: string
  error?: string
}

export interface VoiceOverParams {
  engine: string
  voice: string
  generation_id?: string
  error?: string
}

export function readVoiceOver(params: unknown): VoiceOverParams | null {
  const vo = (params as { voice_over?: VoiceOverParams } | null)?.voice_over
  return vo && typeof vo.voice === "string" ? vo : null
}

export function voiceOverDto(vo: VoiceOverParams | null): VoiceOverFollowUp | undefined {
  if (!vo) return undefined
  if (!vo.generation_id && !vo.error) {
    // Запуск ещё не записан (идёт прямо сейчас в другом опросе)
    return { voice: vo.voice }
  }
  return { voice: vo.voice, generationId: vo.generation_id, error: vo.error }
}

