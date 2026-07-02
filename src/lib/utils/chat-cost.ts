/**
 * Расчёт стоимости одного ответа чата по числу токенов.
 *
 * Текстовые модели OpenRouter тарифицируются "за миллион токенов входа/выхода".
 * Возвращаем сумму в долларах с шестью знаками — этого достаточно для
 * корректного отображения мелких сообщений в исторической ленте.
 *
 * Вынесено отдельно от route.ts, чтобы можно было покрыть тестом без
 * поднятия HTTP-окружения и базы.
 */
export function calculateChatCost(
  tokensIn: number,
  tokensOut: number,
  pricing: { input: number; output: number }
): number {
  const inputCost = (Math.max(0, tokensIn) / 1_000_000) * pricing.input
  const outputCost = (Math.max(0, tokensOut) / 1_000_000) * pricing.output
  return inputCost + outputCost
}

/**
 * Превышен ли бюджет пользователя. Возвращает true, если потрачено >= лимит.
 * Лимит 0 трактуем как "лимит не задан" → не превышен (не блокируем).
 */
export function isOverBudget(spent: number, limit: number): boolean {
  if (!Number.isFinite(spent) || !Number.isFinite(limit)) return false
  if (limit <= 0) return false
  return spent >= limit
}
