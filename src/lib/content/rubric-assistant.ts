import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import type { ContentRubricPrompts, ContentRubricSettings } from "@/lib/db/schema/content"
import { DEFAULT_RUBRIC_SETTINGS } from "./default-rubrics"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const ASSISTANT_MODEL = "anthropic/claude-sonnet-4.6"

const ASSISTANT_SYSTEM = `Ты помогаешь редактору создать новую рубрику для генерации Telegram/SMM-постов через pipeline: Perplexity-поиск → выбор темы → сжатие контекста → написание поста.

На входе — свободное описание желаемой рубрики на русском (тема, аудитория, стиль, источники, формат). На выходе — JSON-конфиг рубрики, который можно сразу применить.

Думай так:
1) Какая тематика? Какие точные ключевые слова и подразделы.
2) Какие официальные/авторитетные домены для поиска? Только настоящие сайты (без выдумок). Минимум 3, максимум 12.
3) Какой формат поста (telegram / twitter / instagram / email) и оптимальная длина в символах.
4) Какой recency-фильтр (day / week / month / year)?
5) Сформулируй perplexity_search_prompt — что именно искать. Обязательно поддерживай плейсхолдеры {start_date} и {end_date}. Не вставляй конкретные даты.
6) Сформулируй post_writer_system_prompt — стилевые рамки именно этой рубрики (структура поста, тон, запреты). Это надстройка над общим SMM-гайдом, не дублируй базовые правила (про дефис, кавычки, эмодзи).
7) Если пользователь явно просит включить Reddit-поиск — оставь reddit_enabled=true и сформулируй reddit_search_prompt. По умолчанию reddit выключен.

Формат ответа — только JSON:
{
  "slug": "snake_case_latin_only",
  "title": "Короткое название для UI на русском",
  "description": "1 предложение, в чём суть рубрики",
  "collection": "Группа / проект, к которому рубрика относится (например 'ЦФУ Групп · Налоги', 'Personal blog'). Можно null, если непонятно.",
  "settings": {
    "researchWindowDays": 7,
    "perplexityModel": "sonar-pro",
    "perplexityReasoningEffort": "medium",
    "perplexitySearchContextSize": "high",
    "searchDomainFilter": ["nalog.gov.ru", "consultant.ru"],
    "searchRecencyFilter": "week",
    "searchLanguage": "ru",
    "redditEnabled": false,
    "audience": "целевая аудитория одной фразой",
    "postFormat": "telegram",
    "targetLength": 1200,
    "topicGuardEnabled": true,
    "topicGuardLookbackDays": 30,
    "topicGuardMaxTopics": 20
  },
  "prompts": {
    "perplexitySearchPrompt": "...",
    "redditSearchPrompt": "",
    "postWriterSystemPrompt": ""
  },
  "rationale": "1-2 предложения, что именно ты сконфигурировал и почему"
}

Подсказка для searchLanguage:
- "ru" — если домены/тематика русские (российские СМИ, ФНС, законы РФ);
- "en" — если ищем в англоязычных источниках (западные tech-блоги, новости индустрии);
- "mixed" — если оба, например русскоязычная аудитория, но источники включают западные tech-новости.

Поля, которых нет в схеме, не добавляй. Если пользователь дал противоречивые требования — выбери разумный вариант и упомяни в rationale.`

export interface RubricDraft {
  slug: string
  title: string
  description: string
  collection: string | null
  settings: ContentRubricSettings
  prompts: ContentRubricPrompts
  rationale: string
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string | null } }>
  error?: { message?: string }
}

export async function draftRubric(args: {
  userId: string
  description: string
}): Promise<RubricDraft> {
  const apiKey = await getDecryptedApiKey(args.userId, "openrouter")
  if (!apiKey) throw new Error("Нет ключа OpenRouter")
  if (!args.description.trim()) {
    throw new Error("Опиши, какую рубрику ты хочешь — в одном-двух предложениях")
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ASSISTANT_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ASSISTANT_SYSTEM },
        { role: "user", content: args.description },
      ],
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 240)}`)
  }
  const data = (await response.json()) as OpenRouterResponse
  if (data.error?.message) throw new Error(data.error.message)
  const raw = data.choices?.[0]?.message?.content || ""
  let parsed: Partial<RubricDraft>
  try {
    parsed = JSON.parse(raw) as Partial<RubricDraft>
  } catch {
    throw new Error("Модель не вернула корректный JSON")
  }

  // Заполняем пропущенные поля дефолтами + санитизируем
  const slug = (parsed.slug || "rubric")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .slice(0, 64) || "rubric"
  const settings: ContentRubricSettings = {
    ...DEFAULT_RUBRIC_SETTINGS,
    ...(parsed.settings || {}),
    // Сохраняем массив доменов в нужном формате
    searchDomainFilter: Array.isArray(parsed.settings?.searchDomainFilter)
      ? parsed.settings!.searchDomainFilter
          .map((d) => String(d || "").trim())
          .filter(Boolean)
      : DEFAULT_RUBRIC_SETTINGS.searchDomainFilter,
  }
  const prompts: ContentRubricPrompts = {
    perplexitySearchPrompt: (parsed.prompts?.perplexitySearchPrompt || "").trim(),
    redditSearchPrompt: (parsed.prompts?.redditSearchPrompt || "").trim(),
    postWriterSystemPrompt: (parsed.prompts?.postWriterSystemPrompt || "").trim(),
  }
  return {
    slug,
    title: (parsed.title || "Новая рубрика").trim(),
    description: (parsed.description || "").trim(),
    collection: parsed.collection ? String(parsed.collection).trim() || null : null,
    settings,
    prompts,
    rationale: (parsed.rationale || "").trim(),
  }
}
