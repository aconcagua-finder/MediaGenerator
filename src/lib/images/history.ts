import { STALE_SYNC_JOB_ERROR, syncJobStatus, type FeedStatus } from "@/lib/history/merge"

/**
 * «Мои картинки» на /generate: карточки истории из данных `getGenerations`
 * (тот же слой, что у /history). Чистые функции — покрыты тестами.
 */

export interface ImageHistoryImage {
  id: string
  url: string
  width: number | null
  height: number | null
}

export interface ImageHistoryItem {
  id: string
  provider: string
  model: string
  /** Промпт как ушёл провайдеру (со стилем, если он был выбран) */
  prompt: string
  /** Параметры модели (строки, как в форме) — для «Повторить» */
  params: Record<string, string>
  status: FeedStatus
  error?: string
  cost: number | null
  /** ISO-время создания */
  createdAt: string
  imagesCount: number
  images: ImageHistoryImage[]
  /** Правка/картинка-по-картинке: референс нужно прикрепить заново */
  isEdit: boolean
  /** Правка картинки из Библиотеки — id исходной картинки */
  parentImageId: string | null
}

/** Генерация из `getGenerations` (поля, которые нужны ленте) */
export interface ImageGenerationRow {
  id: string
  provider: string
  model: string
  prompt: string
  params: unknown
  status: string
  imagesCount: number
  cost: string | null
  errorMessage: string | null
  createdAt: Date | string
  images: { id: string; width: number | null; height: number | null }[]
}

/**
 * Ошибки провайдеров картинок хранятся сырыми (по-английски) — переводим
 * частые, остальное отдаём как есть.
 */
export function humanizeImageError(raw: string | null | undefined): string {
  const msg = (raw ?? "").trim()
  if (!msg) return "Генерация не удалась на стороне провайдера"
  const s = msg.toLowerCase()
  if (/transparent background/.test(s)) {
    return "Эта модель не умеет прозрачный фон. Выключите прозрачность в параметрах или выберите другую модель."
  }
  if (/safety|moderation|content.?policy|policy violation|flagged|blocked|nsfw|inappropriate|filtered/.test(s)) {
    return "Запрос отклонён фильтром модели. Переформулируйте промпт нейтральнее или выберите другую модель."
  }
  if (/insufficient|credits?|quota|billing|payment required|\b402\b/.test(s)) {
    return "На ключе провайдера закончились средства или лимит. Пополните баланс и повторите."
  }
  if (/rate.?limit|too many requests|\b429\b/.test(s)) {
    return "Слишком много запросов к провайдеру. Подождите минуту и повторите."
  }
  if (/timed?\s?out|timeout|deadline|econnreset|overload|unavailable|\b50[234]\b/.test(s)) {
    return "Провайдер не ответил вовремя или перегружен. Повторите чуть позже."
  }
  return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg
}

function stringParams(params: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!params || typeof params !== "object") return out
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (k.startsWith("_") || k === "parentImageId" || k === "uploadId") continue
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = String(v)
  }
  return out
}

export function buildImageHistory(rows: ImageGenerationRow[], now: number = Date.now()): ImageHistoryItem[] {
  return rows.map((row) => {
    const p = (row.params && typeof row.params === "object" ? row.params : {}) as Record<string, unknown>
    const status = syncJobStatus(row.status, row.createdAt, now)
    const item: ImageHistoryItem = {
      id: row.id,
      provider: row.provider,
      model: row.model,
      prompt: row.prompt,
      params: stringParams(row.params),
      status,
      cost: row.cost != null ? parseFloat(row.cost) : null,
      createdAt: new Date(row.createdAt).toISOString(),
      imagesCount: row.imagesCount,
      images:
        status === "done"
          ? row.images.map((img) => ({ id: img.id, url: `/api/images/${img.id}`, width: img.width, height: img.height }))
          : [],
      isEdit: p._edit === true || typeof p.uploadId === "string" || typeof p.parentImageId === "string",
      parentImageId: typeof p.parentImageId === "string" ? p.parentImageId : null,
    }
    if (status === "error") {
      item.error = row.status === "error" ? humanizeImageError(row.errorMessage) : STALE_SYNC_JOB_ERROR
    }
    return item
  })
}
