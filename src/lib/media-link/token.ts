import { createHash, randomBytes } from "node:crypto"

/**
 * Токены публичных ссылок на медиафайлы (см. `public_media_links`).
 * Чистые функции без БД — покрыты tests/media-link.test.ts.
 */

/** 32 случайных байта = 256 бит (требование — не меньше 128) */
export const TOKEN_BYTES = 32

/** Время жизни ссылки по умолчанию */
export const LINK_TTL_MS = 24 * 60 * 60 * 1000

/** base64url без паддинга от 32 байт = ровно 43 символа */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url")
}

/** В БД храним только хеш: утечка БД не раскрывает рабочих ссылок */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function isValidTokenFormat(token: string): boolean {
  return TOKEN_RE.test(token)
}

export type LinkState = "ok" | "expired" | "revoked"

export function linkState(
  link: { expiresAt: Date; revokedAt: Date | null },
  now: Date = new Date(),
): LinkState {
  if (link.revokedAt) return "revoked"
  if (link.expiresAt.getTime() <= now.getTime()) return "expired"
  return "ok"
}

/**
 * Базовый публичный URL приложения. Приоритет — `BETTER_AUTH_URL` (читается в
 * рантайме из env_file контейнера), затем `NEXT_PUBLIC_APP_URL` (вшивается при
 * сборке). Провайдеры принимают только HTTPS, поэтому http/localhost — ошибка.
 */
export function resolvePublicBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = (env.BETTER_AUTH_URL || env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "")
  if (!raw) {
    throw new Error("Не задан публичный адрес приложения (BETTER_AUTH_URL / NEXT_PUBLIC_APP_URL)")
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`Некорректный публичный адрес приложения: ${raw}`)
  }
  if (url.protocol !== "https:") {
    throw new Error(
      "Публичный адрес приложения должен быть HTTPS: провайдеры не принимают http-ссылки на файлы. Проверьте BETTER_AUTH_URL / NEXT_PUBLIC_APP_URL.",
    )
  }
  return url.origin
}

/**
 * Публичная ссылка. Хвостовое имя файла косметическое (некоторые провайдеры
 * определяют тип по расширению в URL), маршрут его игнорирует.
 */
export function buildPublicMediaUrl(baseUrl: string, token: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_") || "file"
  return `${baseUrl.replace(/\/+$/, "")}/api/media-link/${token}/${safe}`
}
