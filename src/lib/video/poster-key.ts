/** Ключ постера видео из `videos.metadata` (см. poster.ts) или null. Без серверных зависимостей. */
export function posterKeyOf(metadata: unknown): string | null {
  const key = (metadata as { posterKey?: unknown } | null)?.posterKey
  return typeof key === "string" && key ? key : null
}
