import type {
  VideoProvider,
  VideoSubmitRequest,
  VideoSubmitResult,
  VideoPollResult,
  VideoJobContext,
} from "./types"

/**
 * Адаптер fal.ai (queue REST API). НЕ ПРОВЕРЕН ЖИВЫМ ВЫЗОВОМ: на момент написания
 * в системе нет ключа fal — контракт взят из документации
 * (fal.ai/docs/documentation/model-apis/inference/queue и llms.txt моделей).
 *
 *   POST https://queue.fal.run/{model-id}            → { request_id, status_url, response_url }
 *   GET  {status_url}                                → { status: IN_QUEUE|IN_PROGRESS|COMPLETED, error? }
 *   GET  {response_url}                              → результат модели ({ video: { url } } / { audio: { url } })
 *
 * Авторизация: `Authorization: Key <ключ>`. Входные файлы — только публичные
 * HTTPS-URL (наш `/api/media-link/...`). Сгенерированные файлы лежат на
 * публичном `fal.media`, скачиваются без ключа. Задачи, упавшие по ошибке
 * сервера, и время в очереди не тарифицируются.
 *
 * ❗ Адрес статуса строится по «app id» (первые два сегмента model id), а не по
 * полному id: `fal-ai/kling-video/v3/pro/motion-control` → `fal-ai/kling-video`
 * (подтверждено: очередь отвечает 404 NOT_FOUND именно на такой путь). Поэтому
 * берём `status_url`/`response_url` из ответа submit (храним в
 * `params.providerState`), а вычисление по id — лишь запасной вариант.
 */

export const FAL_QUEUE_BASE = "https://queue.fal.run"
const TIMEOUT = 60_000

export function falAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Key ${apiKey}`,
    "Content-Type": "application/json",
  }
}

/** `fal-ai/kling-video/v3/pro/motion-control` → `fal-ai/kling-video` */
export function falAppId(modelId: string): string {
  return modelId.split("/").slice(0, 2).join("/")
}

/** Запасной адрес статуса/результата по id модели и id запроса */
export function falQueueUrls(modelId: string, requestId: string): { statusUrl: string; responseUrl: string } {
  const base = `${FAL_QUEUE_BASE}/${falAppId(modelId)}/requests/${requestId}`
  return { statusUrl: `${base}/status`, responseUrl: base }
}

export type FalCharacterOrientation = "video" | "image"

function assertHttps(url: string, what: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Некорректная ссылка на ${what}`)
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Ссылка на ${what} должна быть публичной HTTPS`)
  }
}

/**
 * Тело запроса Kling Motion Control (v3 standard/pro). Поля по llms.txt модели:
 * `image_url` (персонаж) и `video_url` (движение) обязательны, а также
 * `character_orientation` (`video` — до 30 сек, `image` — до 10 сек).
 */
export function buildKlingMotionControlInput(opts: {
  videoUrl: string
  imageUrl: string
  prompt?: string
  orientation?: FalCharacterOrientation
  keepOriginalSound?: boolean
}): Record<string, unknown> {
  assertHttps(opts.videoUrl, "исходное видео")
  assertHttps(opts.imageUrl, "картинку персонажа")
  const input: Record<string, unknown> = {
    image_url: opts.imageUrl,
    video_url: opts.videoUrl,
    character_orientation: opts.orientation === "image" ? "image" : "video",
    keep_original_sound: opts.keepOriginalSound ?? true,
  }
  const prompt = opts.prompt?.trim()
  if (prompt) input.prompt = prompt
  return input
}

export function buildFalVideoInput(request: VideoSubmitRequest): Record<string, unknown> {
  if (/\/motion-control$/.test(request.model)) {
    if (!request.sourceVideoUrl) throw new Error("Для Motion Control нужно исходное видео с движением")
    if (!request.characterImageUrl) throw new Error("Для Motion Control нужна картинка персонажа")
    const orientation = (request.params as { character_orientation?: string }).character_orientation
    return buildKlingMotionControlInput({
      videoUrl: request.sourceVideoUrl,
      imageUrl: request.characterImageUrl,
      prompt: request.prompt,
      orientation: orientation === "image" ? "image" : "video",
    })
  }
  throw new Error(`Модель fal.ai "${request.model}" не поддерживается`)
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = TIMEOUT,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, data }
  } finally {
    clearTimeout(t)
  }
}

/** Достаёт человекочитаемую причину из ответа fal (`detail` — строка или массив `{msg}`) */
export function falErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const detail = data.detail
  if (typeof detail === "string" && detail) return detail
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === "object" ? (d as { msg?: unknown }).msg : undefined))
      .filter((m): m is string => typeof m === "string")
    if (msgs.length) return msgs.join("; ")
  }
  if (typeof data.error === "string" && data.error) return data.error
  if (typeof data.message === "string" && data.message) return data.message
  return fallback
}

/** URL готового файла из результата модели: `video.url` | `audio.url` | `audio_url` */
export function extractFalOutputUrl(result: Record<string, unknown>): string | null {
  for (const key of ["video", "audio"] as const) {
    const obj = result[key]
    if (obj && typeof obj === "object" && typeof (obj as { url?: unknown }).url === "string") {
      return (obj as { url: string }).url
    }
  }
  if (typeof result.audio_url === "string") return result.audio_url
  if (typeof result.video_url === "string") return result.video_url
  return null
}

export type FalJobState = "pending" | "in_progress" | "completed"

export function mapFalStatus(status: unknown): FalJobState {
  switch (status) {
    case "COMPLETED":
      return "completed"
    case "IN_PROGRESS":
      return "in_progress"
    default:
      return "pending" // IN_QUEUE и всё неизвестное
  }
}

function urlsFromCtx(jobId: string, ctx?: VideoJobContext): { statusUrl: string; responseUrl: string } {
  const state = (ctx?.params as { providerState?: { statusUrl?: string; responseUrl?: string } } | null)
    ?.providerState
  if (state?.statusUrl && state?.responseUrl) {
    return { statusUrl: state.statusUrl, responseUrl: state.responseUrl }
  }
  if (!ctx?.model) throw new Error("fal: не известен адрес задачи")
  return falQueueUrls(ctx.model, jobId)
}

/** Отправка задачи в очередь fal (общая для видео и голоса) */
export async function falSubmit(
  modelId: string,
  input: Record<string, unknown>,
  apiKey: string,
): Promise<{ requestId: string; statusUrl: string; responseUrl: string }> {
  const { ok, status, data } = await fetchJson(`${FAL_QUEUE_BASE}/${modelId}`, {
    method: "POST",
    headers: falAuthHeaders(apiKey),
    body: JSON.stringify(input),
  })
  if (!ok) {
    throw new Error(falErrorMessage(data, `fal.ai ошибка: ${status}`))
  }
  const requestId = typeof data.request_id === "string" ? data.request_id : ""
  if (!requestId) throw new Error("fal.ai не вернул id задачи")
  const fallback = falQueueUrls(modelId, requestId)
  return {
    requestId,
    statusUrl: typeof data.status_url === "string" ? data.status_url : fallback.statusUrl,
    responseUrl: typeof data.response_url === "string" ? data.response_url : fallback.responseUrl,
  }
}

/** Опрос задачи fal: статус → при COMPLETED забираем результат и URL файла */
export async function falPoll(
  jobId: string,
  apiKey: string,
  ctx?: VideoJobContext,
): Promise<VideoPollResult> {
  const { statusUrl, responseUrl } = urlsFromCtx(jobId, ctx)

  const st = await fetchJson(statusUrl, { method: "GET", headers: falAuthHeaders(apiKey) })
  if (!st.ok) {
    // Транспортная/авторизационная ошибка опроса — транзиентная, задачу не валим
    throw new Error(falErrorMessage(st.data, `fal.ai опрос: ${st.status}`))
  }

  const state = mapFalStatus(st.data.status)
  if (state !== "completed") {
    return { state, videoUrls: [], rawResponse: st.data }
  }

  if (typeof st.data.error === "string" && st.data.error) {
    return { state: "failed", videoUrls: [], error: st.data.error, rawResponse: st.data }
  }

  const res = await fetchJson(responseUrl, { method: "GET", headers: falAuthHeaders(apiKey) })
  if (!res.ok) {
    // Ошибка валидации/модерации приходит HTTP-ошибкой на response_url — это ПРИЧИНА фейла
    if (res.status >= 400 && res.status < 500) {
      return {
        state: "failed",
        videoUrls: [],
        error: falErrorMessage(res.data, `fal.ai отклонил задачу (${res.status})`),
        rawResponse: res.data,
      }
    }
    throw new Error(falErrorMessage(res.data, `fal.ai результат: ${res.status}`))
  }

  const outUrl = extractFalOutputUrl(res.data)
  if (!outUrl) {
    return { state: "failed", videoUrls: [], error: "fal.ai не вернул файл результата", rawResponse: res.data }
  }
  // fal не отдаёт стоимость в ответе — биллинг по оценке (см. finalize.ts)
  return { state: "completed", videoUrls: [outUrl], rawResponse: res.data }
}

/** Скачивание готового файла (публичный fal.media, ключ не нужен) */
export async function falFetchOutput(
  jobId: string,
  apiKey: string,
  ctx?: VideoJobContext,
): Promise<{ buffer: Buffer; contentType: string }> {
  const { responseUrl } = urlsFromCtx(jobId, ctx)
  const res = await fetchJson(responseUrl, { method: "GET", headers: falAuthHeaders(apiKey) })
  if (!res.ok) throw new Error(falErrorMessage(res.data, `fal.ai результат: ${res.status}`))
  const outUrl = extractFalOutputUrl(res.data)
  if (!outUrl) throw new Error("fal.ai не вернул файл результата")

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 120_000)
  try {
    const r = await fetch(outUrl, { signal: controller.signal })
    if (!r.ok) throw new Error(`Не удалось скачать результат fal.ai (${r.status})`)
    return {
      buffer: Buffer.from(await r.arrayBuffer()),
      contentType: r.headers.get("content-type") || "application/octet-stream",
    }
  } finally {
    clearTimeout(t)
  }
}

/**
 * Проверка ключа без расхода денег: статус несуществующего запроса. С неверным
 * ключом очередь отвечает 401 (`invalid key credentials`, подтверждено живым
 * запросом с заведомо неверным ключом), с валидным — 404 `NOT_FOUND` (по
 * документации; с реальным ключом не проверялось).
 */
export async function validateFalKey(apiKey: string): Promise<boolean> {
  try {
    const { status } = await fetchJson(
      `${FAL_QUEUE_BASE}/fal-ai/flux/requests/00000000-0000-0000-0000-000000000000/status`,
      { method: "GET", headers: falAuthHeaders(apiKey) },
      15_000,
    )
    return status !== 401 && status !== 403
  } catch {
    return false
  }
}

export const falVideoProvider: VideoProvider = {
  id: "fal",

  async submit(request: VideoSubmitRequest): Promise<VideoSubmitResult> {
    const input = buildFalVideoInput(request)
    const { requestId, statusUrl, responseUrl } = await falSubmit(request.model, input, request.apiKey)
    return {
      providerJobId: requestId,
      status: "pending",
      providerState: { statusUrl, responseUrl },
    }
  },

  poll: falPoll,

  // У fal результат один (индекса нет): `index` из общего интерфейса не используется
  async fetchVideo(providerJobId, apiKey, index, ctx) {
    void index
    return falFetchOutput(providerJobId, apiKey, ctx)
  },
}
