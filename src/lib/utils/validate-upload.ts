/**
 * Чистая валидация пользовательских image-загрузок —
 * чтобы её можно было покрыть юнит-тестами без HTTP-окружения.
 */

import { readImageMeta, type ImageMeta } from "./image-meta"

/** Максимальный размер одного файла в байтах. 10 МБ — комфортно для скринов и фото. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Разрешённые MIME-типы — только то, что мы умеем читать и что точно поймут провайдеры. */
export const ALLOWED_MIME_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
])

export type ValidationFailure = {
  ok: false
  code: "empty" | "too_large" | "bad_mime" | "bad_image"
  message: string
}

export type ValidationSuccess = {
  ok: true
  meta: ImageMeta
}

export type ValidationResult = ValidationSuccess | ValidationFailure

/**
 * Валидирует, что буфер действительно изображение разрешённого формата
 * и не превышает лимит. MIME из заголовка multipart игнорируем — верим
 * только реальным байтам, потому что клиент может подсунуть фейковый
 * Content-Type для PHP/JS-файла.
 */
export function validateUpload(buffer: Buffer): ValidationResult {
  if (!buffer || buffer.length === 0) {
    return { ok: false, code: "empty", message: "Файл пустой" }
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    const mb = (buffer.length / 1024 / 1024).toFixed(1)
    const limitMb = MAX_UPLOAD_BYTES / 1024 / 1024
    return {
      ok: false,
      code: "too_large",
      message: `Файл слишком большой (${mb} МБ). Лимит — ${limitMb} МБ.`,
    }
  }
  const meta = readImageMeta(buffer)
  if (!meta) {
    return {
      ok: false,
      code: "bad_image",
      message: "Не удалось распознать изображение. Поддерживаются PNG, JPEG, WebP, GIF.",
    }
  }
  if (!ALLOWED_MIME_TYPES.has(meta.mimeType)) {
    return {
      ok: false,
      code: "bad_mime",
      message: `Формат ${meta.mimeType} не поддерживается`,
    }
  }
  // Защищаемся от "пиксельных бомб" — гигантских картинок,
  // которые могут сожрать память при обработке провайдером.
  const MAX_DIMENSION = 8192
  if (meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) {
    return {
      ok: false,
      code: "bad_image",
      message: `Размер ${meta.width}×${meta.height} слишком большой (макс. ${MAX_DIMENSION} по стороне)`,
    }
  }
  return { ok: true, meta }
}
