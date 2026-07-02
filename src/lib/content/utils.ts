/**
 * Утилиты для контент-пайплайна. Перенесены из проекта-первоисточника:
 * - нормализация тем для нечёткого сравнения (topic guard);
 * - подсчёт схожести строк (SequenceMatcher-аналог из Python);
 * - разбор JSON из ответа LLM, который иногда обёрнут в ```json fence;
 * - подстановка {start_date}/{end_date} в шаблоны промптов.
 */

export interface DateRange {
  startDate: string
  endDate: string
}

export function buildDateRange(daysBack: number, today: Date = new Date()): DateRange {
  const end = new Date(today)
  end.setUTCHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - Math.max(1, Math.floor(daysBack)))
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

export function formatSearchTemplate(template: string, range: DateRange): string {
  return template
    .replaceAll("{start_date}", range.startDate)
    .replaceAll("{end_date}", range.endDate)
}

/** Нормализация темы для поиска повторов: lowercase, ё→е, пунктуация→пробел, схлоп пробелов. */
export function normalizeTopic(input: string): string {
  const raw = (input || "").trim().toLowerCase().replaceAll("ё", "е")
  if (!raw) return ""
  const punctuationStripped = raw.replace(/[^\p{L}\p{N}\s]/gu, " ").replaceAll("_", " ")
  return punctuationStripped.replace(/\s+/g, " ").trim()
}

/**
 * Коэффициент сходства тем, 0..1. Используется topic_guard'ом
 * для предупреждения о близких к ранее опубликованным темам.
 *
 * Реализация — взвешенный Jaccard по словам после нормализации.
 * Этого достаточно для коротких заголовков на русском: «Использование
 * Claude для проверки договоров» и «… для анализа договоров» дают ratio
 * ~0.67, что выше дефолтного порога 0.78 только если очень близки.
 * Не SequenceMatcher один-в-один, но семантически точнее для тем.
 */
export function similarityRatio(left: string, right: string): number {
  const a = normalizeTopic(left)
  const b = normalizeTopic(right)
  if (!a || !b) return 0
  const aTokens = new Set(a.split(" ").filter(Boolean))
  const bTokens = new Set(b.split(" ").filter(Boolean))
  if (aTokens.size === 0 || bTokens.size === 0) return 0
  let intersect = 0
  for (const tok of aTokens) {
    if (bTokens.has(tok)) intersect++
  }
  const union = aTokens.size + bTokens.size - intersect
  return union === 0 ? 0 : intersect / union
}

/**
 * Извлечь JSON-объект из текста, который мог быть обёрнут в markdown-fence
 * или содержать пояснение. Совпадает по поведению с _parse_json_from_message
 * из проекта-первоисточника.
 */
export function parseJsonFromMessage<T = Record<string, unknown>>(raw: string): T {
  const text = (raw || "").trim()
  if (!text) {
    throw new SyntaxError("Empty response from LLM")
  }

  try {
    return JSON.parse(text) as T
  } catch {
    // pass
  }

  const fenced = /```(?:json)?\s*([\s\S]+?)\s*```/i.exec(text)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]) as T
    } catch {
      // pass
    }
  }

  // Последняя попытка — найти первую скобку и попробовать декодировать
  // последовательно расширяющиеся подстроки.
  const start = text.indexOf("{")
  if (start >= 0) {
    for (let end = text.length; end > start + 1; end--) {
      const slice = text.slice(start, end)
      try {
        return JSON.parse(slice) as T
      } catch {
        continue
      }
    }
  }

  throw new SyntaxError("No JSON object found in LLM response")
}

/** Снять служебные блоки <think>…</think>, которые иногда возвращает reasoning-модель. */
export function stripThinkBlocks(text: string): string {
  if (!text) return ""
  return text.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim()
}
