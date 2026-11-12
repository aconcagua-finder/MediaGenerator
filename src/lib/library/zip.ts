/**
 * Массовое скачивание из Библиотеки одним ZIP-архивом.
 *
 * Раньше «Скачать» по выделенным кликал ссылки в цикле — браузер отменял
 * каждую загрузку следующей, и доходил только последний файл. Теперь при
 * выборе 2+ файлов клиент идёт на `GET /api/library/zip?kind=…&ids=…`, а
 * сервер собирает архив потоком из S3 (без сжатия, mp4/png и так сжаты).
 *
 * Здесь — чистые функции (разбор запроса, имена файлов в архиве), общие для
 * роута и клиента; покрыты `tests/library-zip.test.ts`.
 */

export const ZIP_KINDS = ["videos", "images", "audios"] as const
export type ZipKind = (typeof ZIP_KINDS)[number]

/** Потолок файлов в одном архиве (длина URL и разумный размер архива) */
export const ZIP_MAX_FILES = 200

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ZipRequest = { ok: true; kind: ZipKind; ids: string[] } | { ok: false; error: string }

/** Разбор `kind` и `ids` (через запятую): только uuid, без повторов, не больше потолка */
export function parseZipRequest(kind: string | null, idsParam: string | null): ZipRequest {
  if (!kind || !(ZIP_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: "Неизвестный тип файлов" }
  }
  const ids = [
    ...new Set(
      (idsParam ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  if (ids.length === 0) return { ok: false, error: "Не выбраны файлы" }
  if (ids.some((id) => !UUID_RE.test(id))) return { ok: false, error: "Некорректный id файла" }
  if (ids.length > ZIP_MAX_FILES) {
    return { ok: false, error: `За раз можно скачать не больше ${ZIP_MAX_FILES} файлов` }
  }
  return { ok: true, kind: kind as ZipKind, ids }
}

const PREFIX: Record<ZipKind, string> = { videos: "video", images: "image", audios: "voice" }
const DEFAULT_EXT: Record<ZipKind, string> = { videos: "mp4", images: "png", audios: "mp3" }

/** Расширение файла: из формата в БД, jpeg → jpg; мусор → дефолт типа */
export function zipExtension(kind: ZipKind, format: string | null | undefined): string {
  const f = (format ?? "").toLowerCase().trim()
  if (f === "jpeg") return "jpg"
  return /^[a-z0-9]{2,5}$/.test(f) ? f : DEFAULT_EXT[kind]
}

/** Дата-время по Москве для имени файла: 2026-11-12_15-10 */
function stamp(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}`
}

/**
 * Имя файла внутри архива: `video-2026-11-12_15-10-a7b25250.mp4`.
 * Сортируется по времени создания, по хвосту id файл находится в Библиотеке.
 */
export function zipEntryName(kind: ZipKind, id: string, createdAt: Date, format: string | null | undefined): string {
  return `${PREFIX[kind]}-${stamp(createdAt)}-${id.slice(0, 8)}.${zipExtension(kind, format)}`
}

/** Имя самого архива: `mediagenerator-videos-2026-11-12_15-10.zip` */
export function zipArchiveName(kind: ZipKind, now: Date = new Date()): string {
  return `mediagenerator-${kind}-${stamp(now)}.zip`
}

/** URL скачивания архива (клиент) */
export function zipDownloadUrl(kind: ZipKind, ids: Iterable<string>): string {
  const params = new URLSearchParams({ kind, ids: [...ids].join(",") })
  return `/api/library/zip?${params.toString()}`
}

/**
 * Скачать выбранные файлы Библиотеки (клиент): один файл — напрямую, 2+ —
 * одним ZIP. Ссылки в цикле не кликать: браузер оставит только последнюю.
 */
export function downloadLibraryFiles(kind: ZipKind, ids: Iterable<string>, single: (id: string) => { href: string; name: string }) {
  const list = [...ids]
  if (list.length === 0) return
  const link = document.createElement("a")
  if (list.length === 1) {
    const { href, name } = single(list[0])
    link.href = href
    link.download = name
  } else {
    link.href = zipDownloadUrl(kind, list)
  }
  link.click()
}
