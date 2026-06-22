/**
 * AI-классификатор постов по темам. Используется в режиме "topics".
 *
 * Вызываем OpenRouter chat completions с инструкцией: для каждого поста
 * вернуть JSON `{id, match_type: close|indirect|none, topic_id, reason}`.
 * Группируем посты в батчи, чтобы экономить токены и количество запросов.
 *
 * Модель по умолчанию — `anthropic/claude-sonnet-4.6` (см. `DEFAULT_CLASSIFIER`):
 * оптимальный баланс цены/качества на русском (~$1 на 500 постов, ~10 минут).
 * Пользователь может переключить модель в настройках шаблона.
 */

import type {
  MonitoringClassifier,
  MonitoringMatchType,
  MonitoringTopic,
} from "@/lib/db/schema/monitoring"
import { calculateChatCost } from "@/lib/utils/chat-cost"
import { getTextModel } from "@/lib/providers/text-models"

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
const FETCH_TIMEOUT_MS = 60_000

/**
 * Дефолтные настройки классификатора.
 *
 * Финальные замеры на одинаковом наборе ~490 постов и двух темах
 * («Изменения НДС/УСН с 2026» + «Самозанятые: проверки и риски»):
 *
 *   Модель              Время    Цена    Найдено    Точность close
 *   Haiku 4.5         6.8 мин   $0.48   72         высокая (либеральный)
 *   Sonnet 4.6       10.5 мин   $1.15   46         высокая (сбалансированный)
 *   Gemini 3.1 Pro    26 мин    $2.16   36         очень высокая (строгий)
 *
 * Gemini Pro слишком медленный/дорогой для регулярных прогонов,
 * Haiku — слишком либеральный (пропускает много спорных в «близкие»).
 * Sonnet 4.6 — оптимальный дефолт: разумная цена ($1 на 500 постов),
 * 10 минут, и качество сопоставимое с Gemini Pro.
 *
 * Пользователь может переключить модель в настройках шаблона.
 */
export const DEFAULT_CLASSIFIER: MonitoringClassifier = {
  model: "anthropic/claude-sonnet-4.6",
  batchSize: 8,
  keepNonMatches: false,
}

export interface ClassifierInput {
  /** Текст поста для классификации. */
  text: string
  /** URL поста — пишем в запросе для контекста (домен, t.me). */
  postUrl: string
  /** Источник, откуда пришло (имя канала / сайт). */
  sourceLabel?: string
}

export interface ClassifierVerdict {
  matchType: MonitoringMatchType
  topicId?: string
  topicName?: string
  reason: string
}

export interface ClassifierResult {
  verdicts: ClassifierVerdict[]
  inputTokens: number
  outputTokens: number
  cost: number
  /** Сколько запросов реально сделано (батчей). */
  batches: number
}

interface BatchVerdict {
  /** Индекс поста в исходном массиве (как мы их передали модели). */
  index: number
  match_type: "close" | "indirect" | "none"
  topic_id?: string
  reason: string
}

function buildSystemPrompt(topics: MonitoringTopic[]): string {
  const topicsList = topics
    .map((t, idx) => {
      const desc = t.description?.trim() ? `\n   Описание: ${t.description}` : ""
      return `${idx + 1}. id="${t.id}" — ${t.name}${desc}`
    })
    .join("\n")

  return `Ты — строгий тематический фильтр для SMM-специалиста. Решаешь, относится ли пост к ОДНОЙ из заранее заданных тем.

ИНТЕРЕСУЮЩИЕ ТЕМЫ:
${topicsList}

ГРАДАЦИЯ:
- "close" — пост ПРЯМО про эту тему: упоминает ключевые слова темы и/или специфические объекты темы (название компании/площадки/страны/закона). Можно брать в работу сразу.
- "indirect" — пост НЕ про тему напрямую, но упоминает её или её специфические объекты как часть более широкого контекста. Может быть полезен как «зацепка».
- "none" — пост не относится к теме.

КРИТИЧЕСКИ ВАЖНО — НЕ РАСШИРЯЙ ТЕМУ:
- Если в теме указана страна или регион (например «Китай»), посты про ДРУГИЕ страны/регионы — это «none» или максимум «indirect», НЕ «close». Импорт из ЕАЭС ≠ импорт из Китая.
- Если в теме указаны конкретные площадки (Wildberries, Ozon), посты про общие налоговые изменения для УСН без упоминания этих площадок — «indirect» или «none», НЕ «close».
- Общая тематика «налоги / контроль ФНС / отчётность» САМА ПО СЕБЕ не делает пост подходящим — нужно совпадение со СПЕЦИФИЧЕСКОЙ темой запроса.
- Если сомневаешься между «close» и «indirect» — выбирай «indirect». Если сомневаешься между «indirect» и «none» — выбирай «none».

ФОРМАТ ОТВЕТА:
- Голый JSON-массив: [{"index": N, "match_type": "close|indirect|none", "topic_id": "...", "reason": "..."}, ...]
- Если match_type ≠ "none" — обязательно указывай "topic_id" из списка выше.
- "reason" — 1-2 предложения на русском, объясняющие именно ВАШЕ решение: что в посте совпало с темой и почему именно close/indirect (а не сильнее или слабее).
- Никакого markdown, никаких пояснений до или после JSON.

ИГНОРИРУЙ как «none»:
- Рекламу курсов / вебинаров / "подарков", даже если упоминают тему вскользь.
- "Доброе утро", опросы без сути, стикеры, мемы.
- Имена пользователей в форумных постах (Куб Клерк) — смотри только содержание вопроса.`
}

function buildUserPrompt(items: ClassifierInput[]): string {
  const blocks = items.map((it, idx) => {
    const text = it.text.length > 1500 ? `${it.text.slice(0, 1500)}…` : it.text
    const meta = it.sourceLabel ? ` (источник: ${it.sourceLabel})` : ""
    return `[${idx}] ${it.postUrl}${meta}\n${text}`
  })
  return `Классифицируй посты ниже. Верни JSON массив.\n\n${blocks.join("\n\n---\n\n")}`
}

/**
 * Иногда модель оборачивает JSON в ```json или комментирует. Достаём чистый
 * массив. Если не получается — кидаем ошибку (потеряем батч, но не упадём
 * всем pipeline'ом).
 */
function parseModelOutput(content: string): BatchVerdict[] {
  let cleaned = content.trim()
  // Markdown code fence
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/m)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  // Иногда модель сначала пишет "Вот результат:", потом массив
  const arrayStart = cleaned.indexOf("[")
  const arrayEnd = cleaned.lastIndexOf("]")
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    cleaned = cleaned.slice(arrayStart, arrayEnd + 1)
  }

  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed)) {
    throw new Error("Ответ модели не массив")
  }
  const verdicts: BatchVerdict[] = []
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    const index = Number(obj.index)
    const matchTypeRaw = String(obj.match_type ?? "").toLowerCase()
    const matchType =
      matchTypeRaw === "close" || matchTypeRaw === "indirect" ? matchTypeRaw : "none"
    const topicId = typeof obj.topic_id === "string" ? obj.topic_id : undefined
    const reason = typeof obj.reason === "string" ? obj.reason : ""
    if (!Number.isFinite(index)) continue
    verdicts.push({ index, match_type: matchType, topic_id: topicId, reason })
  }
  return verdicts
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; tokensIn: number; tokensOut: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mediagenerator.local",
        "X-Title": "MediaGenerator Monitoring",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        // Не используем `response_format: json_object`: Gemini через OpenRouter
        // его не поддерживает, а наш парсер всё равно умеет выдирать массив
        // из любой обёртки.
      }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 300)}`)
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const content = data.choices?.[0]?.message?.content ?? ""
    return {
      content,
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
    }
  } finally {
    clearTimeout(timer)
  }
}

export interface ClassifyOptions {
  apiKey: string
  topics: MonitoringTopic[]
  classifier: MonitoringClassifier
  posts: ClassifierInput[]
  /**
   * Колбэк прогресса. Вызывается после каждого батча. Если возвращает Promise,
   * pipeline дожидается завершения (например, чтобы записать в БД).
   */
  onProgress?: (info: {
    batchesProcessed: number
    batchesTotal: number
    avgBatchMs: number
    costSoFar: number
  }) => void | Promise<void>
}

/**
 * Классифицирует посты батчами. Для каждого батча делает один запрос к
 * OpenRouter. Если батч упал — посты этого батча помечаются как "none"
 * с причиной "ошибка классификатора", чтобы pipeline не падал целиком.
 */
export async function classifyPosts(opts: ClassifyOptions): Promise<ClassifierResult> {
  if (opts.topics.length === 0 || opts.posts.length === 0) {
    return { verdicts: [], inputTokens: 0, outputTokens: 0, cost: 0, batches: 0 }
  }
  const batchSize = Math.max(1, Math.min(20, opts.classifier.batchSize))
  const systemPrompt = buildSystemPrompt(opts.topics)
  const pricing = getTextModel(opts.classifier.model)?.pricing ?? { input: 1, output: 5 }

  const verdicts: ClassifierVerdict[] = new Array(opts.posts.length).fill(null) as never[]
  let inputTokens = 0
  let outputTokens = 0
  let cost = 0
  let batches = 0
  const batchesTotal = Math.ceil(opts.posts.length / batchSize)
  let totalBatchMs = 0

  for (let start = 0; start < opts.posts.length; start += batchSize) {
    const slice = opts.posts.slice(start, start + batchSize)
    const userPrompt = buildUserPrompt(slice)
    batches++
    const batchStart = Date.now()
    try {
      const { content, tokensIn, tokensOut } = await callOpenRouter(
        opts.apiKey,
        opts.classifier.model,
        systemPrompt,
        userPrompt,
      )
      inputTokens += tokensIn
      outputTokens += tokensOut
      cost += calculateChatCost(tokensIn, tokensOut, pricing)

      const parsed = parseModelOutput(content)
      for (const v of parsed) {
        const absIndex = start + v.index
        if (absIndex < start || absIndex >= start + slice.length) continue
        const topic = opts.topics.find((t) => t.id === v.topic_id)
        verdicts[absIndex] = {
          matchType: v.match_type as MonitoringMatchType,
          topicId: topic?.id,
          topicName: topic?.name,
          reason: v.reason,
        }
      }
    } catch (err) {
      // Помечаем весь батч как "none" с диагностическим reason
      for (let i = 0; i < slice.length; i++) {
        verdicts[start + i] = {
          matchType: "none",
          reason: `Ошибка классификатора: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    } finally {
      totalBatchMs += Date.now() - batchStart
      if (opts.onProgress) {
        try {
          await opts.onProgress({
            batchesProcessed: batches,
            batchesTotal,
            avgBatchMs: Math.round(totalBatchMs / batches),
            costSoFar: cost,
          })
        } catch {
          // ignore progress errors
        }
      }
    }
  }

  // Заполняем "пропуски", если модель что-то не вернула
  for (let i = 0; i < verdicts.length; i++) {
    if (!verdicts[i]) {
      verdicts[i] = {
        matchType: "none",
        reason: "Модель не вернула вердикт для этого поста",
      }
    }
  }

  return { verdicts, inputTokens, outputTokens, cost, batches }
}
