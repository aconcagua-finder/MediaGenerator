import {
  ELEVENLABS_STS_MODEL,
  isElevenLabsVoiceId,
  type VoiceSettings,
} from "./voice-change-models"
import type { TtsVoiceSettings } from "./voice-models"
import {
  catalogCacheKey,
  filterPremadeVoices,
  isRuVerifiedFor,
  mapPremadeVoice,
  mapSharedVoice,
  POPULAR_VOICES_PER_GENDER,
  type CatalogVoice,
  type VoiceCatalogPage,
  type VoiceCatalogQuery,
} from "./elevenlabs-voices"

/**
 * Прямой API ElevenLabs (замена голоса, озвучка и каталог голосов). Проверено
 * живыми вызовами 2026-10-25.
 *
 *   POST /v1/voice-changer/{voice_id}?output_format=mp3_44100_128   multipart: audio, model_id,
 *        voice_settings (JSON-строка), remove_background_noise, seed? → тело ответа = mp3 (синхронно)
 *   POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128  JSON: text, model_id,
 *        voice_settings, language_code?, seed? → тело ответа = mp3 (синхронно)
 *   GET  /v1/shared-voices?language=ru&sort=usage_character_count_1y… → { voices, has_more }
 *   GET  /v1/voices                                                  → { voices } (premade + свои)
 *   GET  /v1/user                                                    → 200 для рабочего ключа
 *
 * Авторизация: заголовок `xi-api-key`. Голоса библиотеки работают по voice_id
 * напрямую, добавлять их в аккаунт не нужно (слоты своих голосов не тратятся).
 * Ошибки: JSON `{ detail: { status, message } }` (`invalid_api_key`,
 * `quota_exceeded`, `voice_not_found`, …).
 */

export const ELEVENLABS_API_BASE = "https://api.elevenlabs.io"
/** Синхронные вызовы (замена голоса, озвучка) */
const VOICE_CHANGE_TIMEOUT = 120_000
const CATALOG_TIMEOUT = 20_000

/** Ошибка API ElevenLabs. `message` пригоден для `humanizeVideoError` (начинается с «ElevenLabs») */
export class ElevenLabsError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    readonly detail: string,
  ) {
    super(`ElevenLabs ${httpStatus} ${code}: ${detail}`)
    this.name = "ElevenLabsError"
  }
}

/** Разбор тела ошибки: `{detail:{status,message}}`, `{detail:"..."}` или `{detail:[{msg}]}` */
export function parseElevenLabsError(httpStatus: number, body: unknown): ElevenLabsError {
  const detail = body && typeof body === "object" ? (body as { detail?: unknown }).detail : undefined
  let code = "error"
  let message = ""
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as { status?: unknown; message?: unknown }
    if (typeof d.status === "string") code = d.status
    if (typeof d.message === "string") message = d.message
  } else if (typeof detail === "string") {
    message = detail
  } else if (Array.isArray(detail)) {
    message = detail
      .map((x) => (x && typeof x === "object" ? (x as { msg?: unknown }).msg : undefined))
      .filter((m): m is string => typeof m === "string")
      .join("; ")
  }
  return new ElevenLabsError(httpStatus, code, message || `HTTP ${httpStatus}`)
}

async function readError(res: Response): Promise<ElevenLabsError> {
  const body = await res.json().catch(() => ({}))
  return parseElevenLabsError(res.status, body)
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>, what: string): Promise<T> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  try {
    return await run(controller.signal)
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ElevenLabsError(504, "timeout", `${what}: no response in ${Math.round(ms / 1000)} s`)
    }
    throw err
  } finally {
    clearTimeout(t)
  }
}

export interface VoiceChangerRequestOptions {
  voiceId: string
  audio: Uint8Array
  /** Имя файла и тип исходного звука (по умолчанию mp3) */
  filename?: string
  contentType?: string
  settings: VoiceSettings
  modelId?: string
  seed?: number
}

/** Адрес и multipart-тело запроса замены голоса (без сети — покрыто тестами) */
export function buildVoiceChangerRequest(opts: VoiceChangerRequestOptions): { url: string; body: FormData } {
  if (!isElevenLabsVoiceId(opts.voiceId)) {
    throw new Error("Некорректный id голоса ElevenLabs")
  }
  const url = `${ELEVENLABS_API_BASE}/v1/voice-changer/${opts.voiceId}?output_format=mp3_44100_128`
  const body = new FormData()
  const bytes = new Uint8Array(opts.audio)
  body.append("audio", new Blob([bytes], { type: opts.contentType ?? "audio/mpeg" }), opts.filename ?? "audio.mp3")
  body.append("model_id", opts.modelId ?? ELEVENLABS_STS_MODEL)
  const s = opts.settings
  body.append(
    "voice_settings",
    JSON.stringify({
      stability: s.stability,
      similarity_boost: s.similarity_boost,
      style: s.style,
      use_speaker_boost: s.use_speaker_boost,
    }),
  )
  body.append("remove_background_noise", s.remove_background_noise ? "true" : "false")
  if (typeof opts.seed === "number" && Number.isInteger(opts.seed) && opts.seed >= 0) {
    body.append("seed", String(opts.seed))
  }
  return { url, body }
}

/** Замена голоса: синхронный вызов, ответ — готовый mp3 */
export async function elevenLabsVoiceChange(
  apiKey: string,
  opts: VoiceChangerRequestOptions,
  timeoutMs = VOICE_CHANGE_TIMEOUT,
): Promise<{ buffer: Buffer; contentType: string; requestId: string | null }> {
  const { url, body } = buildVoiceChangerRequest(opts)
  return withTimeout(
    timeoutMs,
    async (signal) => {
      const res = await fetch(url, { method: "POST", headers: { "xi-api-key": apiKey }, body, signal })
      if (!res.ok) throw await readError(res)
      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length === 0) throw new ElevenLabsError(502, "empty_response", "empty audio in response")
      return {
        buffer,
        contentType: res.headers.get("content-type") || "audio/mpeg",
        requestId: res.headers.get("request-id") || res.headers.get("x-request-id"),
      }
    },
    "voice changer",
  )
}

export interface TextToSpeechRequestOptions {
  voiceId: string
  text: string
  /** model_id ElevenLabs (eleven_v4, eleven_multilingual_v2, …) */
  modelId: string
  /** Уже санитизированные под модель настройки (см. sanitizeTtsSettings) */
  settings: TtsVoiceSettings
  /** ISO 639-1; без него язык определяется по тексту */
  languageCode?: string
  seed?: number
}

/** Адрес и JSON-тело запроса озвучки (без сети — покрыто тестами) */
export function buildTextToSpeechRequest(opts: TextToSpeechRequestOptions): {
  url: string
  body: Record<string, unknown>
} {
  if (!isElevenLabsVoiceId(opts.voiceId)) {
    throw new Error("Некорректный id голоса ElevenLabs")
  }
  const url = `${ELEVENLABS_API_BASE}/v1/text-to-speech/${opts.voiceId}?output_format=mp3_44100_128`
  const voiceSettings: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(opts.settings)) {
    if (v !== undefined) voiceSettings[k] = v
  }
  const body: Record<string, unknown> = {
    text: opts.text,
    model_id: opts.modelId,
    voice_settings: voiceSettings,
  }
  if (opts.languageCode && /^[a-z]{2}$/.test(opts.languageCode)) body.language_code = opts.languageCode
  if (typeof opts.seed === "number" && Number.isInteger(opts.seed) && opts.seed >= 0) body.seed = opts.seed
  return { url, body }
}

/** Озвучка текста: синхронный вызов, ответ — готовый mp3 */
export async function elevenLabsTextToSpeech(
  apiKey: string,
  opts: TextToSpeechRequestOptions,
  timeoutMs = VOICE_CHANGE_TIMEOUT,
): Promise<{ buffer: Buffer; contentType: string; requestId: string | null }> {
  const { url, body } = buildTextToSpeechRequest(opts)
  return withTimeout(
    timeoutMs,
    async (signal) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify(body),
        signal,
      })
      if (!res.ok) throw await readError(res)
      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length === 0) throw new ElevenLabsError(502, "empty_response", "empty audio in response")
      return {
        buffer,
        contentType: res.headers.get("content-type") || "audio/mpeg",
        requestId: res.headers.get("request-id") || res.headers.get("x-request-id"),
      }
    },
    "text to speech",
  )
}

/**
 * Проверка ключа без расхода кредитов: `GET /v1/user`. Ключ с ограниченными
 * правами без «User: read» отвечает `missing_permissions` — он настоящий,
 * поэтому тоже принимаем (для работы нужны Voice Changer и Voices: read).
 */
export async function validateElevenLabsKey(apiKey: string): Promise<boolean> {
  try {
    return await withTimeout(
      15_000,
      async (signal) => {
        const res = await fetch(`${ELEVENLABS_API_BASE}/v1/user`, { headers: { "xi-api-key": apiKey }, signal })
        if (res.ok) return true
        const err = await readError(res)
        return err.code === "missing_permissions"
      },
      "key check",
    )
  } catch {
    return false
  }
}

async function getJson(apiKey: string, path: string): Promise<Record<string, unknown>> {
  return withTimeout(
    CATALOG_TIMEOUT,
    async (signal) => {
      const res = await fetch(`${ELEVENLABS_API_BASE}${path}`, { headers: { "xi-api-key": apiKey }, signal })
      if (!res.ok) throw await readError(res)
      return (await res.json()) as Record<string, unknown>
    },
    "voices",
  )
}

/** Адрес библиотеки голосов по запросу каталога, отсортированной по популярности за год */
export function buildSharedVoicesPath(q: VoiceCatalogQuery): string {
  const sp = new URLSearchParams({
    page_size: String(q.pageSize),
    page: String(q.page),
    sort: "usage_character_count_1y",
  })
  if (q.scope === "ru") sp.set("language", "ru")
  if (q.gender) sp.set("gender", q.gender)
  if (q.age) sp.set("age", q.age)
  if (q.search) sp.set("search", q.search)
  return `/v1/shared-voices?${sp.toString()}`
}

// Кэш каталога в памяти процесса: голоса библиотеки меняются медленно, а
// диалог каталога дёргает одни и те же страницы. Ключ API в ключ кэша не входит.
const CACHE_TTL_MS = 60 * 60 * 1000
const CACHE_MAX = 300
const cache = new Map<string, { at: number; value: unknown }>()

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T
  const value = await load()
  cache.delete(key)
  cache.set(key, { at: Date.now(), value })
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  return value
}

async function loadPremade(apiKey: string): Promise<CatalogVoice[]> {
  return cached("premade", async () => {
    const data = await getJson(apiKey, "/v1/voices")
    const list = Array.isArray(data.voices) ? data.voices : []
    return list
      .filter((v) => v && typeof v === "object" && (v as { category?: unknown }).category === "premade")
      .map(mapPremadeVoice)
      .filter((v): v is CatalogVoice => v !== null)
  })
}

/** Страница каталога (кэш ~1 ч на запрос) */
export async function fetchVoiceCatalog(apiKey: string, q: VoiceCatalogQuery): Promise<VoiceCatalogPage> {
  if (q.scope === "standard") {
    return filterPremadeVoices(await loadPremade(apiKey), q)
  }
  return cached(`shared|${catalogCacheKey(q)}`, async () => {
    const data = await getJson(apiKey, buildSharedVoicesPath(q))
    const list = Array.isArray(data.voices) ? data.voices : []
    return {
      voices: list.map(mapSharedVoice).filter((v): v is CatalogVoice => v !== null),
      hasMore: data.has_more === true,
      page: q.page,
    }
  })
}

/**
 * «Популярные»: самые используемые русские голоса, проверенные на русском для
 * модели (по умолчанию STS — замена голоса; для озвучки — её TTS-модель), по полу
 */
export async function fetchPopularVoices(
  apiKey: string,
  modelId: string = ELEVENLABS_STS_MODEL,
): Promise<{ female: CatalogVoice[]; male: CatalogVoice[] }> {
  const top = async (gender: "female" | "male") => {
    const page = await fetchVoiceCatalog(apiKey, { scope: "ru", gender, page: 0, pageSize: 30 })
    // Одноимённые голоса (у автора бывает несколько «Prince Nur») в полосе путают — берём самый популярный
    const seen = new Set<string>()
    return page.voices
      .filter(
        (v) => isRuVerifiedFor(v, modelId) && !seen.has(v.title.toLowerCase()) && seen.add(v.title.toLowerCase()),
      )
      .slice(0, POPULAR_VOICES_PER_GENDER)
  }
  const [female, male] = await Promise.all([top("female"), top("male")])
  return { female, male }
}
