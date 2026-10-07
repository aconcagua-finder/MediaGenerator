/**
 * Типы для адаптеров провайдеров генерации видео.
 * В отличие от картинок, видео генерится асинхронно: submit → polling.
 */

export interface VideoSubmitParams {
  duration?: number
  resolution?: string
  aspect_ratio?: string
  generate_audio?: boolean
  seed?: number
}

export interface VideoSubmitRequest {
  model: string
  prompt: string
  params: VideoSubmitParams
  apiKey: string
  /**
   * image-to-video: первый кадр как data:-URI (`data:image/...;base64,...`).
   * Используется только для моделей, поддерживающих i2v.
   */
  frameImageDataUrl?: string
  /**
   * video-to-video: публичный HTTPS-URL исходного видео (data:-URI и http не
   * принимаются провайдерами). Строится через `createMediaLink`.
   */
  sourceVideoUrl?: string
  /** Motion Control: публичный HTTPS-URL картинки персонажа */
  characterImageUrl?: string
}

/**
 * Контекст задачи для опроса/скачивания: нужен провайдерам, у которых адрес
 * статуса зависит от модели (fal.ai) и хранится в `video_generations.params`.
 */
export interface VideoJobContext {
  model: string
  params: Record<string, unknown> | null
}

export interface VideoSubmitResult {
  /** ID задачи на стороне провайдера (для последующего опроса) */
  providerJobId: string
  /**
   * Служебное состояние провайдера, которое надо сохранить в `params.providerState`
   * (fal.ai: status_url/response_url). OpenRouter не использует.
   */
  providerState?: Record<string, string>
  /** Начальный статус (обычно "pending") */
  status: string
  rawResponse?: unknown
}

export type VideoJobState = "pending" | "in_progress" | "completed" | "failed"

export interface VideoPollResult {
  state: VideoJobState
  /** URL-ы готовых видео (mp4) — заполнены при state === "completed" */
  videoUrls: string[]
  /** Фактическая стоимость от провайдера в USD, если известна */
  cost?: number
  /** Текст ошибки при state === "failed" */
  error?: string
  rawResponse?: unknown
}

export interface VideoProvider {
  /** Идентификатор провайдера */
  id: string
  /** Отправить задачу на генерацию, получить job id */
  submit(request: VideoSubmitRequest): Promise<VideoSubmitResult>
  /** Опросить статус задачи */
  poll(providerJobId: string, apiKey: string, ctx?: VideoJobContext): Promise<VideoPollResult>
  /** Скачать готовые байты видео (авторизованно) */
  fetchVideo(
    providerJobId: string,
    apiKey: string,
    index?: number,
    ctx?: VideoJobContext
  ): Promise<{ buffer: Buffer; contentType: string }>
}
