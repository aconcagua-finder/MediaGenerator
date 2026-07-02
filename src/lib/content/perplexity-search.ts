import type {
  ContentRubricSettings,
  PerplexitySource,
} from "@/lib/db/schema/content"
import {
  buildDateRange,
  formatSearchTemplate,
  stripThinkBlocks,
  type DateRange,
} from "./utils"

const API_URL = "https://api.perplexity.ai/chat/completions"
const TIMEOUT_MS = 15 * 60 * 1000 // sonar-deep-research стримит до 10+ минут

export interface PerplexitySearchInput {
  apiKey: string
  promptTemplate: string
  settings: ContentRubricSettings
  /** Опционально — подменить дату «сегодня» (для тестов или ручного запуска). */
  today?: Date
  /**
   * Пользовательская подсказка темы — фразой на русском. Добавляется в
   * конец perplexity-промпта как «фокус», чтобы поиск шёл не наугад по
   * рубрике, а вокруг конкретного события или вопроса.
   */
  topicHint?: string
}

export interface PerplexitySearchResult {
  prompt: string
  reportText: string
  sources: PerplexitySource[]
  range: DateRange
  /** Пробуем извлечь токены/стоимость из usage, если апи их прислал. */
  usage?: { promptTokens?: number; completionTokens?: number }
  cost: number
}

function normalizeSources(raw: unknown): PerplexitySource[] {
  if (!Array.isArray(raw)) return []
  const result: PerplexitySource[] = []
  for (const item of raw) {
    if (typeof item === "string") {
      result.push({ url: item })
      continue
    }
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = obj[k]
        if (typeof v === "string" && v.trim()) return v.trim()
      }
      return undefined
    }
    const entry: PerplexitySource = {
      url: get("url", "link", "href"),
      title: get("title", "name"),
      date: get("date", "published_at", "published_date", "publication_date"),
      source: get("source", "publisher", "site_name", "domain"),
      snippet: get("snippet", "description", "summary"),
    }
    if (entry.url || entry.title) {
      result.push(entry)
    }
  }
  return result
}

/**
 * Грубые цены под Perplexity sonar-deep-research (за 1М токенов).
 * Реальный биллинг Perplexity сложнее (search context tiers, citations),
 * это только оценка для отображения в UI и учёта в totalSpent.
 */
const PERPLEXITY_PRICING: Record<string, { input: number; output: number; reasoning?: number }> = {
  "sonar-deep-research": { input: 2, output: 8, reasoning: 3 },
  "sonar-pro": { input: 3, output: 15 },
  sonar: { input: 1, output: 1 },
}

function estimatePerplexityCost(model: string, usage?: PerplexitySearchResult["usage"]): number {
  const pricing = PERPLEXITY_PRICING[model] || PERPLEXITY_PRICING.sonar
  const inTokens = usage?.promptTokens || 0
  const outTokens = usage?.completionTokens || 0
  return (inTokens * pricing.input + outTokens * pricing.output) / 1_000_000
}

interface PerplexityStreamChunk {
  choices?: Array<{
    delta?: { content?: string; citations?: unknown }
    finish_reason?: string | null
  }>
  citations?: unknown
  search_results?: unknown
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export async function searchPerplexity(
  input: PerplexitySearchInput,
): Promise<PerplexitySearchResult> {
  const { apiKey, promptTemplate, settings, today, topicHint } = input
  const range = buildDateRange(settings.researchWindowDays, today)
  const basePrompt = formatSearchTemplate(promptTemplate, range)
  // Языковой намёк добавляем в конец промпта — Perplexity лучше понимает явное.
  const languageHint =
    settings.searchLanguage === "ru"
      ? "\n\nPrefer Russian-language sources (российские СМИ, .ru/.рф). Avoid English-only outlets unless they are the primary source."
      : settings.searchLanguage === "en"
        ? "\n\nUse English-language sources (international news, tech blogs)."
        : "\n\nUse both Russian and English sources where relevant."
  const topicHintBlock = topicHint?.trim()
    ? `\n\nUser's specific focus for THIS run (highest priority — override the generic rubric scope when relevant):\n"${topicHint.trim()}"`
    : ""
  const prompt = basePrompt + topicHintBlock + languageHint

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const reportChunks: string[] = []
  let rawSources: unknown = []
  let usage: PerplexitySearchResult["usage"]

  try {
    const requestBody: Record<string, unknown> = {
      model: settings.perplexityModel,
      messages: [{ role: "user", content: prompt }],
      stream: true,
      return_citations: true,
      return_related_questions: false,
      web_search_options: {
        search_type: "pro",
        search_context_size: settings.perplexitySearchContextSize,
      },
    }
    // reasoning_effort поддерживает только sonar-deep-research; для sonar/sonar-pro
    // он игнорируется или возвращает 400 — кладём только для deep-research.
    if (settings.perplexityModel === "sonar-deep-research") {
      requestBody.reasoning_effort = settings.perplexityReasoningEffort
    }
    // Whitelist доменов: чистим от пустых строк, схем (https://) и пути.
    const domains = (settings.searchDomainFilter || [])
      .map((d) => (d || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))
      .filter(Boolean)
    if (domains.length > 0) {
      requestBody.search_domain_filter = domains
    }
    if (settings.searchRecencyFilter) {
      requestBody.search_recency_filter = settings.searchRecencyFilter
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "")
      throw new Error(`Perplexity ${response.status}: ${body.slice(0, 240) || "no body"}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line.startsWith("data:")) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === "[DONE]") continue

        try {
          const chunk = JSON.parse(payload) as PerplexityStreamChunk
          const choice = chunk.choices?.[0]
          const content = choice?.delta?.content
          if (content) reportChunks.push(content)
          const hasItems = (v: unknown): boolean =>
            Array.isArray(v) && v.length > 0
          if (hasItems(chunk.search_results)) rawSources = chunk.search_results
          if (hasItems(chunk.citations) && !hasItems(rawSources)) rawSources = chunk.citations
          if (hasItems(choice?.delta?.citations) && !hasItems(rawSources)) {
            rawSources = choice!.delta!.citations
          }
          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens || usage?.promptTokens,
              completionTokens: chunk.usage.completion_tokens || usage?.completionTokens,
            }
          }
        } catch {
          // Пропускаем повреждённые SSE-фрагменты — Perplexity иногда шлёт keep-alive
        }
      }
    }
  } finally {
    clearTimeout(timer)
  }

  const reportText = stripThinkBlocks(reportChunks.join(""))
  if (!reportText) {
    throw new Error("Perplexity вернул пустой отчёт")
  }

  return {
    prompt,
    reportText,
    sources: normalizeSources(rawSources),
    range,
    usage,
    cost: estimatePerplexityCost(settings.perplexityModel, usage),
  }
}
