import type { ChatAttachment } from "./db/schema"

/**
 * Превращает историю сообщений + новое сообщение в формат для OpenRouter,
 * вытаскивая вложения для тех сообщений, у которых они есть.
 *
 * Логика: если у роли user есть вложения и модель vision — собираем
 * content как массив частей [text, image_url, ...]. Иначе — content
 * остаётся строкой, как и было до vision-фичи.
 *
 * Намеренно вынесено из route.ts, чтобы было покрыто юнит-тестами
 * и переиспользуемо без поднятия HTTP-окружения.
 */
export function buildOpenRouterMessages(opts: {
  systemPrompt?: string | null
  history: Array<{
    role: string
    content: string
    attachments?: ChatAttachment[] | null
  }>
  attachmentDataUrls: Map<string, string>
  modelSupportsVision: boolean
}): Array<{ role: string; content: unknown }> {
  const messages: Array<{ role: string; content: unknown }> = []
  if (opts.systemPrompt?.trim()) {
    messages.push({ role: "system", content: opts.systemPrompt.trim() })
  }
  for (const m of opts.history) {
    const hasImages =
      opts.modelSupportsVision &&
      m.role === "user" &&
      Array.isArray(m.attachments) &&
      m.attachments.length > 0

    if (!hasImages) {
      messages.push({ role: m.role, content: m.content })
      continue
    }

    const parts: Array<Record<string, unknown>> = []
    if (m.content?.trim()) {
      parts.push({ type: "text", text: m.content })
    }
    for (const att of m.attachments ?? []) {
      const url = opts.attachmentDataUrls.get(att.uploadId)
      if (url) {
        parts.push({ type: "image_url", image_url: { url } })
      }
    }
    // Если по какой-то причине вложения не подгрузились — отправим текст,
    // чтобы не отвалить запрос целиком.
    if (parts.length === 0) {
      messages.push({ role: m.role, content: m.content || "" })
    } else {
      messages.push({ role: m.role, content: parts })
    }
  }
  return messages
}
