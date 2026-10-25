import { ELEVENLABS_STS_MODEL } from "./voice-change-models"

/**
 * Каталог голосов ElevenLabs для замены голоса: компактный DTO и разбор ответов
 * `GET /v1/shared-voices` (библиотека) и `GET /v1/voices` (стандартные голоса).
 * Чистые функции без сети — используются и сервером (маршрут каталога), и UI.
 */

/**
 * Область каталога: `ru` — русские голоса библиотеки, `library` — вся
 * библиотека (все языки), `standard` — стандартные голоса ElevenLabs (premade).
 */
export type VoiceCatalogScope = "ru" | "library" | "standard"
export type VoiceCatalogGender = "female" | "male"
export type VoiceCatalogAge = "young" | "middle_aged" | "old"

export const VOICE_CATALOG_SCOPES: VoiceCatalogScope[] = ["ru", "library", "standard"]
export const VOICE_CATALOG_PAGE_SIZE = 30
export const VOICE_CATALOG_MAX_PAGE_SIZE = 50
/** Сколько голосов каждого пола в полосе «Популярные» */
export const POPULAR_VOICES_PER_GENDER = 8

export interface CatalogVoice {
  id: string
  /** Полное имя из ElevenLabs: «Marina - Soft, Clear and Warm» */
  name: string
  /** Часть до « - »: «Marina» */
  title: string
  /** Часть после « - »: «Soft, Clear and Warm» (может быть пустой) */
  description: string
  gender: string | null
  age: string | null
  useCase: string | null
  /** Язык голоса (код ISO, у библиотеки) */
  language: string | null
  previewUrl: string | null
  /** Голос проверен на русском именно для speech-to-speech модели */
  ruVerified: boolean
}

export interface VoiceCatalogQuery {
  scope: VoiceCatalogScope
  gender?: VoiceCatalogGender
  age?: VoiceCatalogAge
  search?: string
  /** С нуля */
  page: number
  pageSize: number
}

export interface VoiceCatalogPage {
  voices: CatalogVoice[]
  hasMore: boolean
  page: number
}

const SEARCH_MAX = 60

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

/** Параметры каталога из query string маршрута (всё некорректное отбрасывается) */
export function parseCatalogQuery(sp: URLSearchParams): VoiceCatalogQuery {
  const page = Number.parseInt(sp.get("page") ?? "", 10)
  const size = Number.parseInt(sp.get("pageSize") ?? "", 10)
  const search = (sp.get("search") ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX)
  return {
    scope: pick(sp.get("scope"), VOICE_CATALOG_SCOPES) ?? "ru",
    gender: pick(sp.get("gender"), ["female", "male"] as const),
    age: pick(sp.get("age"), ["young", "middle_aged", "old"] as const),
    search: search || undefined,
    page: Number.isFinite(page) && page >= 0 && page <= 500 ? page : 0,
    pageSize: Number.isFinite(size) && size > 0 ? Math.min(size, VOICE_CATALOG_MAX_PAGE_SIZE) : VOICE_CATALOG_PAGE_SIZE,
  }
}

/** Ключ кэша каталога: одинаковые запросы разных пользователей отдают одно и то же */
export function catalogCacheKey(q: VoiceCatalogQuery): string {
  return [q.scope, q.gender ?? "", q.age ?? "", (q.search ?? "").toLowerCase(), q.page, q.pageSize].join("|")
}

/** «Marina - Soft, Clear and Warm» → { title: «Marina», description: «Soft, Clear and Warm» } (дефис или тире) */
export function splitVoiceName(name: string): { title: string; description: string } {
  const m = name.match(/^(.*?)\s+[-–—]\s+(.*)$/)
  if (!m) return { title: name.trim(), description: "" }
  return { title: m[1].trim(), description: m[2].trim() }
}

interface RawVerifiedLanguage {
  language?: unknown
  model_id?: unknown
  preview_url?: unknown
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/**
 * Превью: русская запись для STS-модели, иначе любая русская, иначе общее
 * превью голоса. Плюс признак «проверен на русском для STS».
 */
export function pickPreview(raw: { preview_url?: unknown; verified_languages?: unknown }): {
  previewUrl: string | null
  ruVerified: boolean
} {
  const langs = Array.isArray(raw.verified_languages) ? (raw.verified_languages as RawVerifiedLanguage[]) : []
  const ru = langs.filter((l) => l && l.language === "ru")
  const sts = ru.find((l) => l.model_id === ELEVENLABS_STS_MODEL)
  const previewUrl = str(sts?.preview_url) ?? ru.map((l) => str(l.preview_url)).find(Boolean) ?? str(raw.preview_url)
  return { previewUrl, ruVerified: Boolean(sts) }
}

/** Голос библиотеки (`/v1/shared-voices`) → DTO; null для мусора без id/имени */
export function mapSharedVoice(raw: unknown): CatalogVoice | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = str(r.voice_id)
  const name = str(r.name)
  if (!id || !name) return null
  return {
    id,
    name,
    ...splitVoiceName(name),
    gender: str(r.gender),
    age: str(r.age),
    useCase: str(r.use_case),
    language: str(r.language),
    ...pickPreview(r),
  }
}

/** Стандартный голос (`/v1/voices`, category `premade`) → DTO; свойства лежат в `labels` */
export function mapPremadeVoice(raw: unknown): CatalogVoice | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = str(r.voice_id)
  const name = str(r.name)
  if (!id || !name) return null
  const labels = (r.labels && typeof r.labels === "object" ? r.labels : {}) as Record<string, unknown>
  return {
    id,
    name,
    ...splitVoiceName(name),
    gender: str(labels.gender),
    age: str(labels.age),
    useCase: str(labels.use_case),
    language: str(labels.language),
    ...pickPreview(r),
  }
}

/** Фильтр и страница для стандартных голосов (их мало, API не фильтрует — делаем сами) */
export function filterPremadeVoices(voices: CatalogVoice[], q: VoiceCatalogQuery): VoiceCatalogPage {
  const needle = q.search?.toLowerCase()
  const filtered = voices.filter(
    (v) =>
      (!q.gender || v.gender === q.gender) &&
      (!q.age || v.age === q.age) &&
      (!needle || v.name.toLowerCase().includes(needle) || (v.useCase ?? "").includes(needle)),
  )
  const start = q.page * q.pageSize
  return {
    voices: filtered.slice(start, start + q.pageSize),
    hasMore: filtered.length > start + q.pageSize,
    page: q.page,
  }
}

const GENDER_LABEL: Record<string, string> = { female: "женский", male: "мужской", neutral: "нейтральный" }
const AGE_LABEL: Record<string, string> = { young: "молодой", middle_aged: "средний возраст", old: "пожилой" }
const USE_CASE_LABEL: Record<string, string> = {
  narrative_story: "рассказ",
  conversational: "разговорный",
  characters_animation: "персонажи",
  social_media: "соцсети",
  entertainment_tv: "ТВ и шоу",
  advertisement: "реклама",
  informative_educational: "обучение",
}

/** Чипы голоса для UI: пол, возраст, назначение */
export function voiceChips(v: Pick<CatalogVoice, "gender" | "age" | "useCase">): string[] {
  return [
    v.gender ? GENDER_LABEL[v.gender] : null,
    v.age ? AGE_LABEL[v.age] : null,
    v.useCase ? (USE_CASE_LABEL[v.useCase] ?? v.useCase.replace(/_/g, " ")) : null,
  ].filter((x): x is string => Boolean(x))
}
