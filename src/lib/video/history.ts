import { getVideoModel } from "@/lib/providers/video-models"
import { getVoiceEngineByEndpoint } from "@/lib/providers/voice-change-models"
import { LINK_TTL_MS } from "@/lib/media-link/token"
import { humanizeVideoError } from "./humanize-error"


/**
 * «Мои последние генерации» на /video: чистая сборка карточек истории из строк
 * БД (без сети и БД — покрыто тестами). Запрос — `GET /api/video/history`.
 *
 * Переозвучка v2v живёт отдельной строкой `mode:"voice"` со ссылкой на родителя
 * (`params.parent_generation_id`), а родитель знает её через
 * `params.voice_over.generation_id`. В истории такая строка не показывается
 * отдельно: её результат — главное видео в карточке родителя. Ручная «Заменить
 * голос» (без родителя) остаётся своей карточкой.
 */

export type HistoryMode = "t2v" | "i2v" | "v2v" | "voice"
export type HistoryStatus = "processing" | "done" | "error"

export interface HistoryVideo {
  id: string
  url: string
  durationSeconds: number | null
  width: number | null
  height: number | null
  hasAudio: boolean
}

export interface HistoryVoiceOver {
  voice: string
  voiceName: string
  /** waiting — заказана, но ещё не запущена (родитель только что сохранился) */
  status: "waiting" | "processing" | "done" | "error"
  generationId?: string
  video?: HistoryVideo
  error?: string
  /** Тонкие настройки — для «Повторить» */
  settings?: unknown
}

/** Исходник v2v, если он ещё жив (хранится 24 ч) — для «Повторить» без новой загрузки */
export interface HistorySource {
  id: string
  durationSeconds: number
  width: number | null
  height: number | null
  hasAudio: boolean
  sizeBytes: number
  name: string
}

export interface VideoHistoryItem {
  id: string
  mode: HistoryMode
  modelId: string
  modelName: string
  /** Промпт как ввёл пользователь */
  prompt: string
  status: HistoryStatus
  error?: string
  cost: number | null
  /** ISO-время создания */
  createdAt: string
  /** Параметры для «Повторить» (t2v/i2v) */
  params: {
    duration?: number
    resolution?: string
    aspect_ratio?: string
    generate_audio?: boolean
    character_orientation?: "video" | "image"
  }
  /** Соотношение сторон для заглушки «в работе»: «16:9» или «720:1280» */
  aspect: string
  video: HistoryVideo | null
  voiceOver?: HistoryVoiceOver
  /** Только v2v: исходник (null — уже удалён) */
  source?: HistorySource | null
}

/** Строка `video_generations` (поля, которые нужны истории) */
export interface HistoryGenerationRow {
  id: string
  model: string
  prompt: string
  mode: string
  params: unknown
  status: string
  cost: string | null
  errorMessage: string | null
  createdAt: Date | string
}

export interface HistoryVideoRow {
  id: string
  videoGenerationId: string | null
  durationSeconds: number | null
  width: number | null
  height: number | null
  hasAudio: boolean
}

export interface HistorySourceRow {
  id: string
  durationSeconds: string | number | null
  width: number | null
  height: number | null
  hasAudio: boolean
  sizeBytes: number
  originalName: string | null
  createdAt: Date | string
}

type Params = Record<string, unknown>

function asParams(params: unknown): Params {
  return params && typeof params === "object" ? (params as Params) : {}
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null
}

/** processing / saving / pending → «в работе» */
export function mapHistoryStatus(status: string): HistoryStatus {
  if (status === "done") return "done"
  if (status === "error") return "error"
  return "processing"
}

/** id родительской v2v-генерации у строки переозвучки */
export function parentGenerationId(params: unknown): string | null {
  return str(asParams(params).parent_generation_id)
}

/** Строка — переозвучка, запущенная автоматически после v2v (показывается в карточке родителя) */
export function isVoiceOverChild(row: { mode: string; params: unknown }): boolean {
  return row.mode === "voice" && parentGenerationId(row.params) !== null
}

function voiceOverParams(params: unknown): Params | null {
  const vo = asParams(params).voice_over
  return vo && typeof vo === "object" ? (vo as Params) : null
}

/** id задачи переозвучки, запущенной после v2v */
export function voiceOverChildId(params: unknown): string | null {
  return str(voiceOverParams(params)?.generation_id)
}

/** Человеческое имя модели: реестр видео, для замены голоса — движок */
export function historyModelName(model: string, mode: string): string {
  if (mode === "voice") return getVoiceEngineByEndpoint(model)?.name ?? model
  return getVideoModel(model)?.name ?? model
}

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString()
}

function videoOf(row: HistoryVideoRow | undefined): HistoryVideo | null {
  if (!row) return null
  return {
    id: row.id,
    url: `/api/videos/${row.id}`,
    durationSeconds: row.durationSeconds,
    width: row.width,
    height: row.height,
    hasAudio: row.hasAudio,
  }
}

function mode(m: string): HistoryMode {
  return m === "i2v" || m === "v2v" || m === "voice" ? m : "t2v"
}

function aspectOf(p: Params): string {
  const w = typeof p.source_width === "number" ? p.source_width : null
  const h = typeof p.source_height === "number" ? p.source_height : null
  if (w && h) return `${w}:${h}`
  return str(p.aspect_ratio) ?? "16:9"
}

function sourceOf(row: HistorySourceRow | undefined, now: number): HistorySource | null {
  if (!row) return null
  const created = new Date(row.createdAt).getTime()
  if (!(now - created < LINK_TTL_MS)) return null
  return {
    id: row.id,
    durationSeconds: Number(row.durationSeconds ?? 0),
    width: row.width,
    height: row.height,
    hasAudio: row.hasAudio,
    sizeBytes: row.sizeBytes,
    name: row.originalName || "исходное видео",
  }
}

function errorText(row: HistoryGenerationRow): string {
  // Ошибки пишутся уже человекочитаемыми; humanize повторно безопасен и
  // подтягивает старые сырые тексты (например, ошибки сохранения)
  const text = humanizeVideoError(row.errorMessage) || "Генерация не удалась"
  // Старые записи хранят сырой JSON валидации провайдера — пользователю он ничего не скажет
  return /^\s*[[{]/.test(text)
    ? "Провайдер отклонил запрос (ошибка формата запроса). Повторите или выберите другую модель."
    : text
}

/**
 * Карточки истории из строк БД.
 * - `rows` — генерации страницы (дети-переозвучки уже отфильтрованы запросом,
 *   но на всякий случай отбрасываются и здесь);
 * - `children` — строки переозвучек, на которые ссылаются родители;
 * - `videos` — готовые видео всех этих генераций;
 * - `sources` — исходники v2v.
 */
export function buildVideoHistory(input: {
  rows: HistoryGenerationRow[]
  children: HistoryGenerationRow[]
  videos: HistoryVideoRow[]
  sources: HistorySourceRow[]
  now?: number
}): VideoHistoryItem[] {
  const now = input.now ?? Date.now()
  const videoByGen = new Map<string, HistoryVideoRow>()
  for (const v of input.videos) {
    if (v.videoGenerationId && !videoByGen.has(v.videoGenerationId)) videoByGen.set(v.videoGenerationId, v)
  }
  const childById = new Map(input.children.map((c) => [c.id, c]))
  const sourceById = new Map(input.sources.map((s) => [s.id, s]))

  return input.rows
    .filter((row) => !isVoiceOverChild(row))
    .map((row) => {
      const p = asParams(row.params)
      const status = mapHistoryStatus(row.status)
      const item: VideoHistoryItem = {
        id: row.id,
        mode: mode(row.mode),
        modelId: row.model,
        modelName: historyModelName(row.model, row.mode),
        prompt: row.prompt,
        status,
        cost: row.cost != null ? parseFloat(row.cost) : null,
        createdAt: toIso(row.createdAt),
        params: {
          duration: typeof p.duration === "number" ? p.duration : undefined,
          resolution: str(p.resolution) ?? undefined,
          aspect_ratio: str(p.aspect_ratio) ?? undefined,
          generate_audio: typeof p.generate_audio === "boolean" ? p.generate_audio : undefined,
          character_orientation: p.character_orientation === "image" ? "image" : p.character_orientation === "video" ? "video" : undefined,
        },
        aspect: aspectOf(p),
        video: status === "done" ? videoOf(videoByGen.get(row.id)) : null,
      }
      if (status === "error") item.error = errorText(row)

      if (item.mode === "v2v") {
        const sourceId = str(p.source_id)
        item.source = sourceId ? sourceOf(sourceById.get(sourceId), now) : null
      }

      // Переозвучка упавшей генерации так и не запускалась — не показываем её
      const vo = status === "error" ? null : voiceOverParams(row.params)
      if (vo && typeof vo.voice === "string") {
        const voiceName = str(vo.voice_name) ?? vo.voice
        const childId = str(vo.generation_id)
        const child = childId ? childById.get(childId) : undefined
        let voStatus: HistoryVoiceOver["status"] = "waiting"
        let voError = str(vo.error) ?? undefined
        if (voError) voStatus = "error"
        else if (child) {
          voStatus = mapHistoryStatus(child.status)
          if (voStatus === "error") voError = errorText(child)
        } else if (childId) {
          // Ссылка есть, а строки нет (удалена) — считаем, что переозвучки нет
          voStatus = "error"
          voError = "Переозвучка не найдена"
        }
        item.voiceOver = {
          voice: vo.voice,
          voiceName,
          status: voStatus,
          generationId: childId ?? undefined,
          video: voStatus === "done" && child ? (videoOf(videoByGen.get(child.id)) ?? undefined) : undefined,
          error: voError,
          settings: vo.settings,
        }
      }
      return item
    })
}
