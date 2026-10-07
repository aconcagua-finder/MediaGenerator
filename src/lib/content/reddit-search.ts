import type { ContentRubricSettings } from "@/lib/db/schema/content"
import {
  buildDateRange,
  formatSearchTemplate,
  type DateRange,
} from "./utils"

const API_URL = "https://api.openai.com/v1/responses"
const TIMEOUT_MS = 10 * 60 * 1000

export interface RedditSearchInput {
  apiKey: string
  promptTemplate: string
  settings: ContentRubricSettings
  today?: Date
}

export interface RedditSearchResult {
  prompt: string
  reportText: string
  range: DateRange
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
  cost: number
}

/** Цены OpenAI Responses API. gpt-5.4 берём из `lib/providers/text-models.ts`. */
const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.4": { input: 2.5, output: 15.0 },
  "gpt-5.5": { input: 5.0, output: 30.0 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-6.1-sol": { input: 2.0, output: 10.0 },
  "gpt-6-sol": { input: 2.0, output: 10.0 },
  "gpt-6-astra": { input: 10.0, output: 50.0 },
  "gpt-6-luna": { input: 0.1, output: 0.5 },
}

function normalizeOpenAiModel(model: string): string {
  // Допускаем синтаксис «openai/gpt-5.4» — снимаем префикс провайдера.
  return model.includes("/") ? model.split("/", 2)[1] : model
}

function estimateOpenAiCost(model: string, usage?: RedditSearchResult["usage"]): number {
  const normalized = normalizeOpenAiModel(model)
  const pricing = OPENAI_PRICING[normalized] || OPENAI_PRICING["gpt-5.4"]
  const inTokens = usage?.promptTokens || 0
  const outTokens = usage?.completionTokens || 0
  return (inTokens * pricing.input + outTokens * pricing.output) / 1_000_000
}

interface ResponsesApiOutputContent {
  type?: string
  text?: string | { value?: string }
}

interface ResponsesApiOutputItem {
  type?: string
  content?: ResponsesApiOutputContent[]
}

interface ResponsesApiResponse {
  status?: string
  incomplete_details?: { reason?: string }
  error?: { message?: string }
  output_text?: string
  output?: ResponsesApiOutputItem[]
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
}

function collectOutputText(response: ResponsesApiResponse): string {
  if (response.output_text) return response.output_text
  const parts: string[] = []
  for (const item of response.output || []) {
    if (item.type !== "message") continue
    for (const content of item.content || []) {
      if (content.type !== "output_text") continue
      const value = typeof content.text === "string" ? content.text : content.text?.value
      if (value) parts.push(value)
    }
  }
  return parts.join("\n").trim()
}

export async function searchRedditViaOpenAI(
  input: RedditSearchInput,
): Promise<RedditSearchResult> {
  const { apiKey, promptTemplate, settings, today } = input
  const range = buildDateRange(settings.redditDays, today)
  const prompt = formatSearchTemplate(promptTemplate, range)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: normalizeOpenAiModel(settings.redditModel),
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        max_tool_calls: settings.redditMaxToolCalls,
        reasoning: { effort: settings.redditReasoningEffort },
        max_output_tokens: settings.redditMaxOutputTokens,
        include: ["web_search_call.action.sources"],
        input: prompt,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(`OpenAI Responses ${response.status}: ${body.slice(0, 240)}`)
    }

    const data = (await response.json()) as ResponsesApiResponse
    if (data.error?.message) throw new Error(data.error.message)
    if (data.status && data.status !== "completed") {
      throw new Error(
        `OpenAI Responses status=${data.status} reason=${data.incomplete_details?.reason || "n/a"}`,
      )
    }

    const text = collectOutputText(data)
    if (!text) throw new Error("OpenAI вернул пустой ответ на Reddit-поиск")

    const usage = data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined

    return {
      prompt,
      reportText: text,
      range,
      usage,
      cost: estimateOpenAiCost(settings.redditModel, usage),
    }
  } finally {
    clearTimeout(timer)
  }
}
