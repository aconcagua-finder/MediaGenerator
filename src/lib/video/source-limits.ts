/**
 * Лимиты и чистая валидация исходных файлов (video-to-video, замена голоса).
 * Без node-зависимостей — этот модуль импортируют и клиент (проверка до загрузки),
 * и сервер (повторная проверка по ffprobe), и тесты.
 */

export const MAX_SOURCE_SECONDS = 30
export const MAX_SOURCE_BYTES = 100 * 1024 * 1024

/** Образец голоса — короткий файл, 10 МБ и 60 секунд с запасом */
export const MAX_SAMPLE_SECONDS = 60
export const MAX_SAMPLE_BYTES = 10 * 1024 * 1024

export const VIDEO_EXTENSIONS = ["mp4", "mov", "webm"] as const
export const VIDEO_MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
}

export const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "ogg"] as const
export const AUDIO_MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
}

/** Атрибут accept для <input type="file"> */
export const VIDEO_ACCEPT = ".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
export const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/mp4,audio/ogg"

export type SourceKind = "video" | "audio"

export function fileExtension(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name.trim())
  return m ? m[1].toLowerCase() : ""
}

/** MIME по расширению (тип от клиента не доверенный — у .mov он часто пустой) */
export function mimeForSource(kind: SourceKind, ext: string): string | null {
  const table = kind === "video" ? VIDEO_MIME_BY_EXT : AUDIO_MIME_BY_EXT
  return table[ext.toLowerCase()] ?? null
}

export interface SourceMeta {
  sizeBytes: number
  durationSeconds: number
  hasVideo?: boolean
  hasAudio?: boolean
}

export type SourceCheck = { ok: true } | { ok: false; message: string }

export function validateSourceMeta(kind: SourceKind, meta: SourceMeta): SourceCheck {
  const maxBytes = kind === "video" ? MAX_SOURCE_BYTES : MAX_SAMPLE_BYTES
  const maxSeconds = kind === "video" ? MAX_SOURCE_SECONDS : MAX_SAMPLE_SECONDS
  if (!(meta.sizeBytes > 0)) return { ok: false, message: "Файл пустой" }
  if (meta.sizeBytes > maxBytes) {
    return { ok: false, message: `Файл слишком большой: максимум ${Math.round(maxBytes / 1024 / 1024)} МБ` }
  }
  if (!Number.isFinite(meta.durationSeconds) || meta.durationSeconds <= 0) {
    return { ok: false, message: "Не удалось определить длительность файла. Возможно, он повреждён" }
  }
  if (meta.durationSeconds > maxSeconds + 0.05) {
    return { ok: false, message: `Слишком длинный файл: максимум ${maxSeconds} сек, а у вас ${meta.durationSeconds.toFixed(1)} сек` }
  }
  if (kind === "video" && meta.hasVideo === false) {
    return { ok: false, message: "В файле нет видеодорожки" }
  }
  if (kind === "audio" && meta.hasAudio === false) {
    return { ok: false, message: "В файле нет звуковой дорожки" }
  }
  return { ok: true }
}

/**
 * Ближайшее поддерживаемое моделью соотношение сторон для исходного кадра:
 * по умолчанию подставляем ориентацию исходника, а не 16:9.
 */
export function closestAspectRatio(width: number, height: number, supported: string[]): string {
  if (!(width > 0) || !(height > 0) || supported.length === 0) return supported[0] ?? "16:9"
  const target = width / height
  let best = supported[0]
  let bestDiff = Infinity
  for (const a of supported) {
    const [aw, ah] = a.split(":").map(Number)
    if (!aw || !ah) continue
    // сравниваем в логарифмической шкале, чтобы 2:1 и 1:2 были симметричны
    const diff = Math.abs(Math.log(aw / ah) - Math.log(target))
    if (diff < bestDiff) {
      bestDiff = diff
      best = a
    }
  }
  return best
}
