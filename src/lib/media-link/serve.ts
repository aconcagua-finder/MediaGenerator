import { isValidTokenFormat, hashToken, linkState } from "./token"

/**
 * Логика отдачи файла по публичной ссылке. Зависимости (БД и S3) инъектируются,
 * поэтому покрыта юнит-тестами без инфраструктуры (tests/media-link.test.ts).
 * Route-handler `/api/media-link/[...slug]` — тонкая обёртка над ней.
 */

export interface MediaLinkRecord {
  s3Key: string
  contentType: string
  sizeBytes: number | null
  expiresAt: Date
  revokedAt: Date | null
}

export interface MediaStreamResult {
  body: ReadableStream | null
  contentType: string | undefined
  contentLength: number | undefined
  contentRange: string | undefined
  statusCode: number
}

export interface ServeDeps {
  findByHash(tokenHash: string): Promise<MediaLinkRecord | null>
  stream(key: string, range?: string): Promise<MediaStreamResult>
  now?: () => Date
}

export interface ServeResult {
  status: number
  headers: Record<string, string>
  body: ReadableStream | null
}

const NOT_FOUND: ServeResult = {
  status: 404,
  headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  body: null,
}

/** Любая причина отказа (формат, неизвестный токен, истёк, отозван) — один и тот же 404 */
function notFound(): ServeResult {
  return { ...NOT_FOUND, headers: { ...NOT_FOUND.headers } }
}

export async function serveMediaLink(
  req: { token: string; range?: string | null; method?: string },
  deps: ServeDeps,
): Promise<ServeResult> {
  if (!isValidTokenFormat(req.token)) return notFound()

  const link = await deps.findByHash(hashToken(req.token))
  if (!link) return notFound()
  if (linkState(link, deps.now?.() ?? new Date()) !== "ok") return notFound()

  const isHead = req.method === "HEAD"
  let range = req.range || undefined
  // Не пытаемся разбирать экзотические Range (мульти-диапазоны) — отдаём файл целиком
  if (range && !/^bytes=\d*-\d*$/.test(range)) range = undefined

  let result: MediaStreamResult
  try {
    result = await deps.stream(link.s3Key, range)
  } catch {
    return notFound()
  }

  const headers: Record<string, string> = {
    "Content-Type": link.contentType || result.contentType || "application/octet-stream",
    "Accept-Ranges": "bytes",
    // Ссылка секретная и временная — не даём кэшировать ни браузеру, ни прокси
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Disposition": "inline",
  }
  const length = result.contentLength ?? (result.statusCode === 200 ? link.sizeBytes ?? undefined : undefined)
  if (length != null) headers["Content-Length"] = String(length)
  if (result.statusCode === 206 && result.contentRange) headers["Content-Range"] = result.contentRange

  if (isHead) {
    // Тело не нужно: закрываем поток S3, чтобы не держать соединение
    try {
      await result.body?.cancel?.()
    } catch {
      // игнорируем
    }
    return { status: result.statusCode, headers, body: null }
  }
  return { status: result.statusCode, headers, body: result.body }
}
