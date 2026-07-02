import type {
  ContentRubric,
  ContentRubricSettings,
  ContentRunTopicData,
} from "@/lib/db/schema/content"
import { calculateChatCost } from "@/lib/utils/chat-cost"
import { getTextModel } from "@/lib/providers/text-models"
import {
  parseJsonFromMessage,
  similarityRatio,
} from "./utils"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
const APP_TITLE = "MediaGenerator Content"
/** Тайм-аут вызова writer-модели. Если OpenRouter залип — фейлим, а не висим вечно. */
const OPENROUTER_TIMEOUT_MS = 4 * 60 * 1000

const MAX_COMPRESSED_WEB_CONTEXT_CHARS = 24000
const MAX_REDDIT_CONTEXT_CHARS = 10000
const MIN_COMPRESSED_WEB_CONTEXT_CHARS = 2200
const MIN_COMPRESSED_WEB_CONTEXT_RATIO = 0.06
const DEFAULT_TOPIC_SIMILARITY_WARNING = 0.78
const TOPIC_SELECTION_TEMPERATURE = 0.4
const POST_GENERATION_TEMPERATURE = 0.35

export interface OpenRouterUsage {
  promptTokens: number
  completionTokens: number
  cost: number
}

function ensurePricing(modelId: string): { input: number; output: number } {
  const m = getTextModel(modelId)
  return m?.pricing || { input: 0, output: 0 }
}

interface OpenRouterChoice {
  message?: { content?: string | null }
}

interface OpenRouterResponse {
  id?: string
  choices?: OpenRouterChoice[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string; code?: number }
}

async function callOpenRouterJson<T = Record<string, unknown>>(args: {
  apiKey: string
  model: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
  reasoning?: { effort: "low" | "medium" | "high" }
}): Promise<{ data: T; usage: OpenRouterUsage }> {
  const { apiKey, model, systemPrompt, userPrompt, temperature, reasoning } = args
  const instructions = systemPrompt.toLowerCase().includes("json")
    ? systemPrompt
    : `${systemPrompt}\n\nYou must return valid json.`
  const input = userPrompt.toLowerCase().includes("json")
    ? userPrompt
    : `${userPrompt}\n\nRespond with valid json only.`

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const extraTail = attempt === 0
      ? ""
      : "\n\nReturn only one raw JSON object. Do not add markdown fences, comments, or explanations."

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": APP_URL,
          "X-Title": APP_TITLE,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: instructions + extraTail },
            { role: "user", content: input + extraTail },
          ],
          temperature: typeof temperature === "number" ? temperature : 0,
          ...(reasoning ? { reasoning } : {}),
        }),
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(
          `Модель ${model} не ответила за ${OPENROUTER_TIMEOUT_MS / 60000} минут. Попробуй другую модель или повтори запрос.`,
        )
      }
      throw err
    }
    clearTimeout(timer)

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 240)}`)
    }

    const data = (await response.json()) as OpenRouterResponse
    if (data.error?.message) {
      throw new Error(data.error.message)
    }
    const content = data.choices?.[0]?.message?.content || ""
    const usage: OpenRouterUsage = {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      cost: calculateChatCost(
        data.usage?.prompt_tokens || 0,
        data.usage?.completion_tokens || 0,
        ensurePricing(model),
      ),
    }
    try {
      return { data: parseJsonFromMessage<T>(content), usage }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError || new Error("Не удалось распарсить JSON-ответ модели")
}

// ── Topic selection ──────────────────────────────────────────────────────

function cleanTopicCandidate(topic: Record<string, unknown>): ContentRunTopicData {
  const keyFactsRaw = topic.key_facts
  const keyFacts: string[] = []
  if (Array.isArray(keyFactsRaw)) {
    for (const item of keyFactsRaw) {
      const text = String(item || "").trim()
      if (text) keyFacts.push(text)
    }
  } else if (typeof keyFactsRaw === "string" && keyFactsRaw.trim()) {
    keyFacts.push(keyFactsRaw.trim())
  }
  return {
    topic: String(topic.topic || "").trim(),
    angle: String(topic.angle || "").trim(),
    keyFacts: keyFacts.slice(0, 8),
  }
}

function extractTopic(data: Record<string, unknown>): ContentRunTopicData | null {
  let topics: unknown = data.topics ?? data.candidate_topics ?? []
  if (topics && !Array.isArray(topics) && typeof topics === "object") {
    topics = [topics]
  }
  if (Array.isArray(topics) && topics.length > 0) {
    const first = topics[0]
    if (first && typeof first === "object") {
      return cleanTopicCandidate(first as Record<string, unknown>)
    }
  }
  for (const key of ["topic", "selected_topic"]) {
    const val = data[key]
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return cleanTopicCandidate(val as Record<string, unknown>)
    }
  }
  return null
}

export interface BuildPromptInput {
  webContext: string
  redditContext: string
  rubric: ContentRubric
  forbiddenTopics: string[]
}

export function buildTopicPrompt(input: BuildPromptInput): string {
  const reddit = input.redditContext
    ? `\n## Reddit Context\n<reddit_context>\n${input.redditContext}\n</reddit_context>\n`
    : "\n## Reddit Context\n<reddit_context>\n\n</reddit_context>\n"
  const forbidden = input.forbiddenTopics.length
    ? `## Forbidden Topics (published in last 30 days)\nDo not select these topics or close paraphrases:\n${input.forbiddenTopics
        .map((t) => `- ${t}`)
        .join("\n")}\n\n`
    : ""
  return [
    "## Task",
    "Выбери одну лучшую тему для текущей рубрики.\n",
    `## Rubric\n- rubric_id: ${input.rubric.slug}\n- title: ${input.rubric.title}\n- focus: ${input.rubric.description}\n`,
    forbidden,
    "## Constraints",
    "- Ровно одна тема.",
    "- Тема должна быть практичной и применимой в реальной работе.",
    "- Не обзорная подборка, а один четкий рабочий сценарий.",
    "- Do not choose topics that repeat or closely paraphrase Forbidden Topics.\n",
    "## Web Context",
    `<web_context>\n${input.webContext}\n</web_context>`,
    reddit,
  ].join("\n")
}

export interface SelectTopicOutput {
  topic: ContentRunTopicData | null
  topicPrompt: string
  usage: OpenRouterUsage
}

export async function selectTopic(args: {
  apiKey: string
  systemPrompt: string
  rubric: ContentRubric
  settings: ContentRubricSettings
  webContext: string
  redditContext: string
  forbiddenTopics: string[]
}): Promise<SelectTopicOutput> {
  const topicPrompt = buildTopicPrompt({
    webContext: args.webContext,
    redditContext: args.redditContext,
    rubric: args.rubric,
    forbiddenTopics: args.forbiddenTopics,
  })
  const { data, usage } = await callOpenRouterJson<Record<string, unknown>>({
    apiKey: args.apiKey,
    model: args.settings.topicSelectionModel,
    systemPrompt: args.systemPrompt,
    userPrompt: topicPrompt,
    temperature: TOPIC_SELECTION_TEMPERATURE,
    reasoning: { effort: "medium" },
  })
  return { topic: extractTopic(data), topicPrompt, usage }
}

export function buildTopicSimilarityWarning(args: {
  selected: string
  forbidden: string[]
  threshold?: number
}) {
  const threshold = args.threshold ?? DEFAULT_TOPIC_SIMILARITY_WARNING
  const selected = (args.selected || "").trim()
  if (!selected || !args.forbidden.length) {
    return { threshold, triggered: false, maxRatio: 0, matchedTopic: "" }
  }
  let bestRatio = 0
  let bestTopic = ""
  for (const candidate of args.forbidden) {
    const ratio = similarityRatio(selected, candidate)
    if (ratio > bestRatio) {
      bestRatio = ratio
      bestTopic = candidate
    }
  }
  return {
    threshold,
    triggered: bestRatio >= threshold,
    maxRatio: Number(bestRatio.toFixed(4)),
    matchedTopic: bestTopic,
  }
}

// ── Web context compression ──────────────────────────────────────────────

function calcMinCompressedChars(sourceChars: number): number {
  return Math.min(
    MAX_COMPRESSED_WEB_CONTEXT_CHARS,
    Math.max(
      MIN_COMPRESSED_WEB_CONTEXT_CHARS,
      Math.floor(sourceChars * MIN_COMPRESSED_WEB_CONTEXT_RATIO),
    ),
  )
}

export function buildTopicInstruction(topic: ContentRunTopicData | null): string {
  if (!topic) return ""
  const parts = [
    `Тема поста: ${topic.topic}`,
    `Угол подачи: ${topic.angle}`,
  ]
  if (topic.keyFacts.length) {
    const facts = topic.keyFacts.map((f) => `- ${f}`).join("\n")
    parts.push(`Ключевые факты для использования в посте:\n${facts}`)
  }
  return parts.join("\n")
}

export function buildCompressionPrompt(args: {
  rubric: ContentRubric
  topicInstruction: string
  webContext: string
  minChars: number
}): string {
  return [
    "## Task",
    "Compress and translate web context to Russian for post generation.",
    "",
    "## Rubric",
    `- rubric_id: ${args.rubric.slug}`,
    `- title: ${args.rubric.title}`,
    `- focus: ${args.rubric.description}`,
    "",
    "## Selected Topic",
    args.topicInstruction,
    "",
    "## Constraint",
    "- Keep enough concrete detail for final writing.",
    `- Minimum useful length: ${args.minChars} characters.`,
    `- Maximum length: ${MAX_COMPRESSED_WEB_CONTEXT_CHARS} characters.`,
    "- Keep tools, metrics, dates, risks, and verification boundaries when relevant.",
    "",
    "## Web Context",
    `<web_context>\n${args.webContext}\n</web_context>`,
  ].join("\n")
}

function extractCompressedContext(data: Record<string, unknown>): string {
  for (const key of [
    "compressed_web_context_ru",
    "compressed_web_context",
    "web_context",
    "text",
  ]) {
    const value = data[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

export interface CompressContextOutput {
  compressed: string
  compressionPrompt: string
  usage: OpenRouterUsage
}

export async function compressWebContext(args: {
  apiKey: string
  systemPrompt: string
  rubric: ContentRubric
  settings: ContentRubricSettings
  topicInstruction: string
  webContext: string
}): Promise<CompressContextOutput> {
  const minChars = calcMinCompressedChars(args.webContext.length)
  const compressionPrompt = buildCompressionPrompt({
    rubric: args.rubric,
    topicInstruction: args.topicInstruction,
    webContext: args.webContext,
    minChars,
  })
  const fallback = args.webContext.slice(0, MAX_COMPRESSED_WEB_CONTEXT_CHARS)
  try {
    const { data, usage } = await callOpenRouterJson<Record<string, unknown>>({
      apiKey: args.apiKey,
      model: args.settings.compressionModel,
      systemPrompt: args.systemPrompt,
      userPrompt: compressionPrompt,
      reasoning: { effort: "medium" },
    })
    let compressed = extractCompressedContext(data)
    if (!compressed) compressed = fallback
    if (compressed.length > MAX_COMPRESSED_WEB_CONTEXT_CHARS) {
      compressed = compressed.slice(0, MAX_COMPRESSED_WEB_CONTEXT_CHARS)
    }
    return { compressed, compressionPrompt, usage }
  } catch {
    // Если компрессия упала — отдаём срезанный исходник, чтобы не валить весь pipeline
    return {
      compressed: fallback,
      compressionPrompt,
      usage: { promptTokens: 0, completionTokens: 0, cost: 0 },
    }
  }
}

// ── Post generation ──────────────────────────────────────────────────────

export function buildPostPrompt(args: {
  rubric: ContentRubric
  topicInstruction: string
  compressedWebContext: string
  redditContext: string
  targetLength: number
}): string {
  const reddit = args.redditContext
    ? `\n## Reddit Context\n<reddit_context>\n${args.redditContext.slice(0, MAX_REDDIT_CONTEXT_CHARS)}\n</reddit_context>\n`
    : "\n## Reddit Context\n<reddit_context>\n\n</reddit_context>\n"
  return [
    "## Task",
    "Напиши один готовый Telegram-пост.\n",
    `## Rubric\n- rubric_id: ${args.rubric.slug}\n- title: ${args.rubric.title}\n- focus: ${args.rubric.description}\n`,
    "## Topic",
    args.topicInstruction || "Тему нужно вывести из контекста.",
    "\n## Constraints",
    `- Целевая длина: около ${args.targetLength} символов.`,
    "- Один главный кейс или один главный практический вопрос.",
    "- Нужен естественный редакторский русский, без шаблонного AI-стиля.",
    "- Сохраняй вариативность подачи: цельный текст, а не отчет по шаблону.\n",
    "## Web Context",
    `<web_context>\n${args.compressedWebContext.slice(0, MAX_COMPRESSED_WEB_CONTEXT_CHARS)}\n</web_context>`,
    reddit,
  ].join("\n")
}

export interface GeneratePostOutput {
  post: string
  writerPrompt: string
  usage: OpenRouterUsage
}

export async function generatePost(args: {
  apiKey: string
  systemPrompt: string
  rubric: ContentRubric
  settings: ContentRubricSettings
  topic: ContentRunTopicData
  compressedWebContext: string
  redditContext: string
}): Promise<GeneratePostOutput> {
  const topicInstruction = buildTopicInstruction(args.topic)
  const writerPrompt = buildPostPrompt({
    rubric: args.rubric,
    topicInstruction,
    compressedWebContext: args.compressedWebContext,
    redditContext: args.redditContext,
    targetLength: args.settings.targetLength,
  })
  const { data, usage } = await callOpenRouterJson<{ post?: string }>({
    apiKey: args.apiKey,
    model: args.settings.postGenerationModel,
    systemPrompt: args.systemPrompt,
    userPrompt: writerPrompt,
    temperature: POST_GENERATION_TEMPERATURE,
    reasoning: { effort: "medium" },
  })
  const post = String(data.post || "").trim()
  return { post, writerPrompt, usage }
}

// ── Express mode: один вызов делает всё (выбор темы + сжатие + пост) ─────

// 30K символов — золотая середина: больше, чем компрессионный буфер (24K),
// но не настолько много, чтобы writer-модель тратила минуты на обработку.
const MAX_EXPRESS_WEB_CONTEXT_CHARS = 30000

export interface ExpressGenerateOutput {
  topic: ContentRunTopicData | null
  post: string
  writerPrompt: string
  usage: OpenRouterUsage
  similarityWarning?: ReturnType<typeof buildTopicSimilarityWarning>
}

export function buildExpressPrompt(args: {
  rubric: ContentRubric
  webContext: string
  redditContext: string
  forbiddenTopics: string[]
  targetLength: number
}): string {
  const forbidden = args.forbiddenTopics.length
    ? `\n## Forbidden Topics (опубликованы за последние 90 дней — НЕ ВЫБИРАЙ их или близкие переформулировки)\n${args.forbiddenTopics.map((t) => `- ${t}`).join("\n")}\n`
    : ""
  const reddit = args.redditContext
    ? `\n## Reddit Context\n<reddit_context>\n${args.redditContext.slice(0, MAX_REDDIT_CONTEXT_CHARS)}\n</reddit_context>\n`
    : ""

  return [
    "## Task",
    "Сделай весь pipeline в один присест: выбери одну сильную тему из контекста и напиши готовый пост.",
    "",
    "## Rubric",
    `- rubric_id: ${args.rubric.slug}`,
    `- title: ${args.rubric.title}`,
    `- focus: ${args.rubric.description}`,
    "",
    "## Constraints",
    `- Целевая длина поста: ~${args.targetLength} символов.`,
    "- Один пост — одна тема. Не миксуй несколько событий.",
    "- Все факты — только из контекста ниже. Не выдумывай цифры, даты, имена.",
    "- Если в контексте нет ни одной достойной темы — верни post=\"\" и в topic.topic пустую строку.",
    forbidden,
    "## Web Context",
    `<web_context>\n${args.webContext.slice(0, MAX_EXPRESS_WEB_CONTEXT_CHARS)}\n</web_context>`,
    reddit,
    "## Output (только JSON)",
    `{
  "topic": "Заголовок будущего поста — одной строкой",
  "angle": "1-2 предложения: что разбираем и почему",
  "key_facts": ["3-5 проверяемых фактов из контекста"],
  "post": "Полный готовый пост в Telegram-Markdown (жирный **, цитаты >, маркированные списки -, эмодзи-маркеры по гайду)"
}`,
  ].join("\n")
}

/**
 * Express-режим: одна модель за один вызов выбирает тему и пишет пост.
 * Без отдельных шагов topic-selection и compression — экономит ~$0.05
 * и 15-20 секунд по сравнению с full-режимом.
 */
export async function expressGeneratePost(args: {
  apiKey: string
  systemPrompt: string
  rubric: ContentRubric
  settings: ContentRubricSettings
  webContext: string
  redditContext: string
  forbiddenTopics: string[]
}): Promise<ExpressGenerateOutput> {
  const writerPrompt = buildExpressPrompt({
    rubric: args.rubric,
    webContext: args.webContext,
    redditContext: args.redditContext,
    forbiddenTopics: args.forbiddenTopics,
    targetLength: args.settings.targetLength,
  })
  const { data, usage } = await callOpenRouterJson<{
    topic?: string | { topic?: string; angle?: string; key_facts?: unknown }
    angle?: string
    key_facts?: unknown
    post?: string
  }>({
    apiKey: args.apiKey,
    model: args.settings.postGenerationModel,
    systemPrompt: args.systemPrompt,
    userPrompt: writerPrompt,
    temperature: POST_GENERATION_TEMPERATURE,
    reasoning: { effort: "medium" },
  })

  // Топик может прийти как строка или как объект — нормализуем
  let topicData: ContentRunTopicData | null = null
  if (typeof data.topic === "string" && data.topic.trim()) {
    topicData = {
      topic: data.topic.trim(),
      angle: String(data.angle || "").trim(),
      keyFacts: Array.isArray(data.key_facts)
        ? data.key_facts.map((f) => String(f || "").trim()).filter(Boolean).slice(0, 8)
        : [],
    }
  } else if (data.topic && typeof data.topic === "object") {
    const t = data.topic as { topic?: string; angle?: string; key_facts?: unknown }
    topicData = {
      topic: String(t.topic || "").trim(),
      angle: String(t.angle || "").trim(),
      keyFacts: Array.isArray(t.key_facts)
        ? t.key_facts.map((f) => String(f || "").trim()).filter(Boolean).slice(0, 8)
        : [],
    }
    if (!topicData.topic) topicData = null
  }

  const post = String(data.post || "").trim()
  const similarityWarning = topicData
    ? buildTopicSimilarityWarning({
        selected: topicData.topic,
        forbidden: args.forbiddenTopics,
      })
    : undefined

  return { topic: topicData, post, writerPrompt, usage, similarityWarning }
}

export function prependTopicToPost(topic: ContentRunTopicData | null, post: string): string {
  const cleanPost = post.trim()
  if (!cleanPost) return ""
  const heading = (topic?.topic || "").trim()
  if (!heading) return cleanPost
  if (cleanPost.startsWith(heading)) return cleanPost
  return `${heading}\n\n${cleanPost}`
}
