import { db } from "@/lib/db"
import { and, asc, eq } from "drizzle-orm"
import {
  contentRunMessages,
  contentRuns,
  user,
  type ContentRubricSettings,
} from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { calculateChatCost } from "@/lib/utils/chat-cost"
import { getTextModel } from "@/lib/providers/text-models"
import { sql } from "drizzle-orm"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
const APP_TITLE = "MediaGenerator Content Refine"

const REFINE_SYSTEM_TEMPLATE = `Ты редактор поста. Пользователь только что получил черновик и хочет его доработать.

Контекст рубрики:
- Площадка: {{POST_FORMAT}}
- Аудитория: {{AUDIENCE}}
- Целевая длина: ~{{TARGET_LENGTH}} символов

Текущий пост:
---
{{POST}}
---

Когда пользователь просит изменить пост — верни ПОЛНЫЙ обновлённый текст поста, целиком, без объяснений до или после.

Когда пользователь просто задаёт вопрос (например "почему ты выбрал такой заголовок?", "какие есть альтернативы?") — отвечай свободным текстом без переписывания поста.

Формат вывода — JSON:
{
  "reply": "<твой ответ пользователю одной фразой: что ты сделал или что отвечаешь>",
  "post": "<полный обновлённый текст поста ИЛИ пустая строка, если правок не было>"
}

Никаких выдумок: всё, что меняешь — должно опираться на текущий текст и его факты. Если пользователь просит добавить новый факт, которого нет в посте, спроси у него источник.

Стилевые правила: длинное тире не использовать (только дефис), только прямые двойные кавычки, без эмодзи, без штампов "в современном мире", "погрузимся", "революционный", "трансформация", "синергия", "экосистема", "ландшафт".`

interface RefineMessage {
  role: "user" | "assistant"
  content: string
}

interface RefineInput {
  runId: string
  userId: string
  userMessage: string
}

interface RefineResult {
  reply: string
  newPost: string | null
  usage: { promptTokens: number; completionTokens: number; cost: number }
  /** Обновлённая общая стоимость run-а — отдаём, чтобы фронт мог сразу её показать. */
  totalCost: number
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string | null } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string }
}

function renderRefineSystem(args: {
  post: string
  settings: ContentRubricSettings
}): string {
  return REFINE_SYSTEM_TEMPLATE.replaceAll("{{POST}}", args.post)
    .replaceAll("{{POST_FORMAT}}", args.settings.postFormat)
    .replaceAll("{{AUDIENCE}}", args.settings.audience || "массовая аудитория")
    .replaceAll("{{TARGET_LENGTH}}", String(args.settings.targetLength))
}

/**
 * Запрос в OpenRouter с попыткой JSON-парсинга reply/post. Если модель не
 * вернула валидный JSON — трактуем весь текст как reply (правок не было).
 */
async function callRefineLLM(args: {
  apiKey: string
  model: string
  systemPrompt: string
  history: RefineMessage[]
  userMessage: string
}): Promise<{
  reply: string
  newPost: string | null
  promptTokens: number
  completionTokens: number
}> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: args.systemPrompt },
  ]
  for (const m of args.history) {
    messages.push({ role: m.role, content: m.content })
  }
  messages.push({ role: "user", content: args.userMessage })

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": APP_URL,
      "X-Title": APP_TITLE,
    },
    body: JSON.stringify({
      model: args.model,
      messages,
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 240)}`)
  }
  const data = (await response.json()) as OpenRouterResponse
  if (data.error?.message) throw new Error(data.error.message)
  const raw = data.choices?.[0]?.message?.content || ""

  let reply = raw
  let newPost: string | null = null
  try {
    const parsed = JSON.parse(raw) as { reply?: string; post?: string }
    reply = (parsed.reply || "").trim() || raw.trim()
    const post = (parsed.post || "").trim()
    if (post) newPost = post
  } catch {
    // если модель отдала plain text — это просто ответ, без правок
    reply = raw.trim()
  }

  return {
    reply,
    newPost,
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
  }
}

export async function listRunMessages(runId: string) {
  return db
    .select()
    .from(contentRunMessages)
    .where(eq(contentRunMessages.runId, runId))
    .orderBy(asc(contentRunMessages.createdAt))
}

export async function refineRunPost(input: RefineInput): Promise<RefineResult> {
  // Загружаем run, проверяем владельца и наличие поста
  const [run] = await db
    .select()
    .from(contentRuns)
    .where(and(eq(contentRuns.id, input.runId), eq(contentRuns.userId, input.userId)))
    .limit(1)
  if (!run) throw new Error("Запуск не найден")
  if (!run.postText) throw new Error("Пост ещё не готов")

  const apiKey = await getDecryptedApiKey(input.userId, "openrouter")
  if (!apiKey) throw new Error("Нет ключа OpenRouter")

  const history = await listRunMessages(input.runId)
  const model = run.settings.postGenerationModel
  const pricing = getTextModel(model)?.pricing || { input: 0, output: 0 }

  const systemPrompt = renderRefineSystem({
    post: run.postText,
    settings: run.settings,
  })

  const llm = await callRefineLLM({
    apiKey,
    model,
    systemPrompt,
    history: history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    userMessage: input.userMessage,
  })

  const cost = calculateChatCost(llm.promptTokens, llm.completionTokens, pricing)

  // Записываем оба сообщения в одной транзакции — порядок важен для отображения.
  await db.insert(contentRunMessages).values({
    runId: input.runId,
    role: "user",
    content: input.userMessage,
  })
  await db.insert(contentRunMessages).values({
    runId: input.runId,
    role: "assistant",
    content: llm.reply,
    postSnapshot: llm.newPost,
    model,
    tokensIn: llm.promptTokens,
    tokensOut: llm.completionTokens,
    cost: cost.toFixed(6),
  })

  // Считаем новую общую стоимость и пишем за одну транзакцию.
  const prevTotal = (run.costs?.total as number) || 0
  const newTotal = prevTotal + cost
  if (cost > 0 || (llm.newPost && llm.newPost !== run.postText)) {
    const patch: Record<string, unknown> = {}
    if (llm.newPost && llm.newPost !== run.postText) {
      patch.postText = llm.newPost
    }
    patch.costs = sql`${contentRuns.costs} || ${JSON.stringify({
      refine: ((run.costs?.refine as number) || 0) + cost,
      total: newTotal,
    })}::jsonb`
    await db.update(contentRuns).set(patch).where(eq(contentRuns.id, input.runId))
  }

  // Списываем стоимость с totalSpent пользователя
  if (cost > 0) {
    await db
      .update(user)
      .set({
        totalSpent: sql`${user.totalSpent}::numeric + ${cost.toFixed(6)}::numeric`,
      })
      .where(eq(user.id, input.userId))
  }

  return {
    reply: llm.reply,
    newPost: llm.newPost,
    usage: {
      promptTokens: llm.promptTokens,
      completionTokens: llm.completionTokens,
      cost,
    },
    totalCost: newTotal,
  }
}
