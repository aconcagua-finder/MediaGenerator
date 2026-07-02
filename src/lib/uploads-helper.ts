import { inArray } from "drizzle-orm"
import { db } from "./db"
import { uploads } from "./db/schema"
import { downloadBuffer } from "./storage/s3"

export interface ResolvedUpload {
  id: string
  s3Key: string
  mimeType: string
  width: number | null
  height: number | null
  sizeBytes: number
}

/**
 * Подгружает строки uploads, проверяя что все принадлежат пользователю.
 * Если найдены не все — возвращает ошибку, чтобы вызывающий API мог
 * вернуть 400 с понятным сообщением.
 *
 * Изначально хотелось делать это в каждом маршруте отдельно, но
 * фильтр "только мои id" повторяется три раза — выношу в один helper.
 */
export async function resolveUserUploads(
  ids: string[],
  userId: string
): Promise<{ ok: true; rows: ResolvedUpload[] } | { ok: false; message: string }> {
  if (ids.length === 0) return { ok: true, rows: [] }
  // Защита от мусора — id должны быть UUID-подобными
  const safe = ids.filter((x) => typeof x === "string" && /^[0-9a-f-]{32,36}$/i.test(x))
  if (safe.length !== ids.length) {
    return { ok: false, message: "Невалидный ID вложения" }
  }

  const rows = await db
    .select({
      id: uploads.id,
      s3Key: uploads.s3Key,
      mimeType: uploads.mimeType,
      width: uploads.width,
      height: uploads.height,
      sizeBytes: uploads.sizeBytes,
      userId: uploads.userId,
    })
    .from(uploads)
    .where(inArray(uploads.id, safe))

  if (rows.length !== safe.length) {
    return { ok: false, message: "Часть вложений не найдена" }
  }
  for (const r of rows) {
    if (r.userId !== userId) {
      return { ok: false, message: "Нет доступа к вложению" }
    }
  }
  // Возвращаем в исходном порядке — клиент может полагаться на него
  const byId = new Map(rows.map((r) => [r.id, r]))
  const ordered: ResolvedUpload[] = safe.map((id) => {
    const r = byId.get(id)!
    return {
      id: r.id,
      s3Key: r.s3Key,
      mimeType: r.mimeType,
      width: r.width,
      height: r.height,
      sizeBytes: r.sizeBytes,
    }
  })
  return { ok: true, rows: ordered }
}

/**
 * Скачивает все вложения из S3 и упаковывает в data URL — формат,
 * который понимают и OpenRouter (image_url), и наш собственный
 * provider.edit (image: Buffer, imageMimeType: string).
 */
export async function fetchUploadBuffers(
  resolved: ResolvedUpload[]
): Promise<Array<{ buffer: Buffer; mimeType: string; dataUrl: string }>> {
  const out: Array<{ buffer: Buffer; mimeType: string; dataUrl: string }> = []
  for (const r of resolved) {
    const { buffer, contentType } = await downloadBuffer(r.s3Key)
    const mime = contentType?.startsWith("image/") ? contentType : r.mimeType
    out.push({
      buffer,
      mimeType: mime,
      dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
    })
  }
  return out
}
