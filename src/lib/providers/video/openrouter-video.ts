import type {
  VideoProvider,
  VideoSubmitRequest,
  VideoSubmitResult,
  VideoPollResult,
  VideoJobState,
} from "./types"

/**
 * Адаптер генерации видео через OpenRouter.
 *
 * API (единая нормализованная схема для всех видеомоделей):
 *   POST /api/v1/videos        → { id, polling_url, status }
 *   GET  /api/v1/videos/{id}   → { status, unsigned_urls[], usage: { cost } }
 *
 * Использует тот же ключ и заголовки, что и image-провайдер OpenRouter.
 */

const SUBMIT_URL = "https://openrouter.ai/api/v1/videos"
const STATUS_URL = (jobId: string) => `https://openrouter.ai/api/v1/videos/${jobId}`
const TIMEOUT = 60_000 // submit/poll — короткие запросы

function authHeaders(apiKey: string, title: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    "X-Title": title,
  }
}

export const openrouterVideoProvider: VideoProvider = {
  id: "openrouter",

  async submit(request: VideoSubmitRequest): Promise<VideoSubmitResult> {
    const { model, prompt, params, apiKey, frameImageDataUrl } = request

    const body: Record<string, unknown> = { model, prompt }
    if (params.duration != null) body.duration = params.duration
    if (params.resolution) body.resolution = params.resolution
    if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio
    if (params.generate_audio != null) body.generate_audio = params.generate_audio
    if (params.seed != null) body.seed = params.seed

    // image-to-video: первый кадр. OpenRouter ждёт `frame_images` —
    // массив ОБЪЕКТОВ в OpenAI-совместимом формате (`type: "image_url"` +
    // `image_url.url` с data:-URI или URL), каждый с обязательным
    // `frame_type` (`first_frame` | `last_frame`). Передаём стартовый кадр.
    // ❗ Раньше слали массив строк → OpenRouter отвечал 400
    // "expected object, received string", и i2v молча падал (t2v работал).
    if (frameImageDataUrl) {
      body.frame_images = [
        {
          type: "image_url",
          image_url: { url: frameImageDataUrl },
          frame_type: "first_frame",
        },
      ]
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT)

    try {
      const response = await fetch(SUBMIT_URL, {
        method: "POST",
        headers: authHeaders(apiKey, "MediaGenerator Video"),
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      const data = (await response.json().catch(() => ({}))) as {
        id?: string
        status?: string
        error?: { message?: string; code?: number }
      }

      if (!response.ok || data.error) {
        const msg =
          data.error?.message || `OpenRouter video ошибка: ${response.status}`
        throw new Error(msg)
      }

      if (!data.id) {
        throw new Error("OpenRouter не вернул id задачи видео")
      }

      return {
        providerJobId: data.id,
        status: data.status || "pending",
        rawResponse: data,
      }
    } finally {
      clearTimeout(timeoutId)
    }
  },

  async poll(providerJobId: string, apiKey: string): Promise<VideoPollResult> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT)

    try {
      const response = await fetch(STATUS_URL(providerJobId), {
        method: "GET",
        headers: authHeaders(apiKey, "MediaGenerator Video"),
        signal: controller.signal,
      })

      const data = (await response.json().catch(() => ({}))) as {
        status?: string
        unsigned_urls?: string[]
        usage?: { cost?: number; is_byok?: boolean }
        error?: { message?: string; code?: number }
      }

      if (!response.ok || data.error) {
        const msg =
          data.error?.message || `OpenRouter video poll ошибка: ${response.status}`
        throw new Error(msg)
      }

      const state = (data.status || "pending") as VideoJobState

      return {
        state,
        videoUrls: Array.isArray(data.unsigned_urls) ? data.unsigned_urls : [],
        cost: typeof data.usage?.cost === "number" ? data.usage.cost : undefined,
        error: state === "failed" ? "Генерация не удалась на стороне провайдера" : undefined,
        rawResponse: data,
      }
    } finally {
      clearTimeout(timeoutId)
    }
  },

  async fetchVideo(
    providerJobId: string,
    apiKey: string,
    index = 0
  ): Promise<{ buffer: Buffer; contentType: string }> {
    // ВАЖНО: `unsigned_urls` из ответа требуют авторизацию (голый fetch → 401),
    // поэтому забираем байты через авторизованный эндпоинт /content с ключом.
    const url = `${SUBMIT_URL}/${providerJobId}/content?index=${index}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120_000)
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Не удалось скачать видео (${response.status})`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      const contentType = response.headers.get("content-type") || "video/mp4"
      return { buffer, contentType }
    } finally {
      clearTimeout(timeoutId)
    }
  },
}
