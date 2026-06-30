/**
 * Контракты адаптера озвучки (TTS). В отличие от видео, синтез синхронный:
 * один вызов `synth` возвращает готовые байты аудио.
 */

export interface VoiceSynthRequest {
  /** ID модели в OpenRouter */
  model: string
  /** Текст для озвучки */
  text: string
  /** Идентификатор голоса (валидируется выше, в реестре) */
  voice: string
  /** Формат запроса к провайдеру: mp3 или pcm (pcm заворачиваем в wav) */
  requestFormat: "mp3" | "pcm"
  /** Скорость (если модель поддерживает) */
  speed?: number
}

export interface VoiceSynthResult {
  /** Готовые байты аудио (mp3 или wav) */
  buffer: Buffer
  /** MIME итогового файла: audio/mpeg | audio/wav */
  contentType: string
  /** Расширение/формат итогового файла */
  outputFormat: "mp3" | "wav"
  /** Параметры исходного PCM (для расчёта длительности у wav) */
  pcm?: { sampleRate: number; channels: number; bitsPerSample: number }
  /** ID генерации у провайдера (заголовок X-Generation-Id) — для сверки стоимости */
  generationId: string | null
}

export interface VoiceProvider {
  /** Синтезировать речь. Бросает Error с человекочитаемым сообщением при сбое. */
  synth(req: VoiceSynthRequest, apiKey: string): Promise<VoiceSynthResult>
  /** Узнать фактическую стоимость по generationId (best-effort, может вернуть null). */
  fetchCost(generationId: string, apiKey: string): Promise<number | null>
}
