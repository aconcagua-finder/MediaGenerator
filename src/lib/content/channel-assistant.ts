import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import type {
  ContentRubricPrompts,
  ContentRubricSettings,
} from "@/lib/db/schema/content"
import { DEFAULT_RUBRIC_SETTINGS } from "./default-rubrics"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const ASSISTANT_MODEL = "anthropic/claude-sonnet-4.6"

const SYSTEM_PROMPT = `Ты помогаешь редактору создать новый канал в системе автогенерации контента. Канал — это продукт/проект (бизнес-блог, нишевый TG-канал, корпоративная рассылка), внутри которого живёт несколько рубрик.

На входе — свободное описание канала: тематика, аудитория, площадка, стиль. На выходе — JSON с описанием канала и 3-5 рубрик к нему.

Думай так:
1) Какая ниша канала? Дай короткое название и slug (snake_case latin).
2) Какая аудитория, какой формат поста (telegram/twitter/instagram/email), какой режим pipeline (express для коротких постов, full для лонгридов)?
3) Какие 5-10 доверенных доменов источников? Только реальные сайты.
4) Какой язык источников: ru / en / mixed?
5) Какой voice_profile канала — короткий (60-120 слов) текст-обвязка для writer-промпта: тон, эмодзи (использовать или нет), запреты, любимые приёмы.
6) Какие 3-5 типов постов (рубрик) реально нужны под этот канал? Например для канала про SMM: «Дайджест недели», «Кейс из практики», «Разбор инструмента», «Чек-лист».
7) Для каждой рубрики — perplexity_search_prompt с плейсхолдерами {start_date}/{end_date} и опционально post_writer_system_prompt (можно оставить пустым — тогда используется универсальный SMM-гайд).

Формат ответа — только JSON:
{
  "channel": {
    "slug": "snake_case",
    "title": "Краткое имя канала",
    "description": "1-2 предложения о канале",
    "icon": "один эмодзи",
    "voiceProfile": "60-120 слов о тоне и приёмах канала",
    "defaultSettings": {
      "researchWindowDays": 7,
      "perplexityModel": "sonar-pro",
      "perplexityReasoningEffort": "medium",
      "perplexitySearchContextSize": "high",
      "searchDomainFilter": ["example.com"],
      "searchRecencyFilter": "week",
      "searchLanguage": "ru",
      "redditEnabled": false,
      "audience": "целевая аудитория",
      "postFormat": "telegram",
      "targetLength": 1200,
      "topicGuardEnabled": true,
      "topicGuardLookbackDays": 90,
      "topicGuardMaxTopics": 30,
      "pipelineMode": "express"
    }
  },
  "rubrics": [
    {
      "slug": "snake_case",
      "title": "Название рубрики",
      "description": "Одно предложение, в чём суть",
      "settingsOverride": {
        "targetLength": 1500,
        "researchWindowDays": 14
      },
      "prompts": {
        "perplexitySearchPrompt": "Найди материалы за {start_date}-{end_date}…",
        "postWriterSystemPrompt": ""
      }
    }
  ],
  "rationale": "1-2 предложения, что и почему собрал"
}

Подсказки:
- Если канал русскоязычный и про РФ — searchLanguage="ru", в доменах российские сайты.
- Если канал про западный tech — searchLanguage="en" или "mixed".
- redditEnabled оставляй false по умолчанию, true — только если канал явно про западные сабы.
- pipelineMode="express" для коротких постов до 1500 знаков, "full" для лонгридов 2000+.
- В rubrics.prompts.postWriterSystemPrompt лучше оставить пустую строку — тогда модель использует общий SMM-гайд с подстановкой voiceProfile канала.`

export interface ChannelDraft {
  channel: {
    slug: string
    title: string
    description: string
    icon: string
    voiceProfile: string
    defaultSettings: ContentRubricSettings
  }
  rubrics: Array<{
    slug: string
    title: string
    description: string
    settingsOverride?: Partial<ContentRubricSettings>
    prompts: ContentRubricPrompts
  }>
  rationale: string
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string | null } }>
  error?: { message?: string }
}

const ASSISTANT_TIMEOUT_MS = 3 * 60 * 1000

export async function draftChannel(args: {
  userId: string
  description: string
}): Promise<ChannelDraft> {
  const apiKey = await getDecryptedApiKey(args.userId, "openrouter")
  if (!apiKey) throw new Error("Нет ключа OpenRouter")
  if (!args.description.trim()) {
    throw new Error("Опиши канал — пара фраз о теме, аудитории и формате")
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ASSISTANT_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(OPENROUTER_URL, {
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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: args.description.trim() },
        ],
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Ассистент не ответил за 3 минуты — попробуй снова")
    }
    throw err
  }
  clearTimeout(timer)

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 240)}`)
  }
  const data = (await response.json()) as OpenRouterResponse
  if (data.error?.message) throw new Error(data.error.message)
  const raw = data.choices?.[0]?.message?.content || ""

  let parsed: Partial<ChannelDraft>
  try {
    parsed = JSON.parse(raw) as Partial<ChannelDraft>
  } catch {
    throw new Error("Модель не вернула корректный JSON")
  }
  if (!parsed.channel || !parsed.rubrics?.length) {
    throw new Error("Ассистент не собрал канал — попробуй переформулировать описание")
  }

  // Санитизация
  const ch = parsed.channel
  const slug = String(ch.slug || "channel")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .slice(0, 64) || "channel"

  const defaultSettings: ContentRubricSettings = {
    ...DEFAULT_RUBRIC_SETTINGS,
    ...(ch.defaultSettings || {}),
    searchDomainFilter: Array.isArray(ch.defaultSettings?.searchDomainFilter)
      ? ch.defaultSettings.searchDomainFilter
          .map((d) => String(d || "").trim())
          .filter(Boolean)
      : DEFAULT_RUBRIC_SETTINGS.searchDomainFilter,
  }

  const rubrics = parsed.rubrics
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      slug: String(r.slug || "rubric")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .slice(0, 64) || "rubric",
      title: String(r.title || "Рубрика").trim(),
      description: String(r.description || "").trim(),
      settingsOverride: r.settingsOverride || {},
      prompts: {
        perplexitySearchPrompt: String(r.prompts?.perplexitySearchPrompt || "").trim(),
        redditSearchPrompt: String(r.prompts?.redditSearchPrompt || "").trim(),
        postWriterSystemPrompt: String(r.prompts?.postWriterSystemPrompt || "").trim(),
      } as ContentRubricPrompts,
    }))

  return {
    channel: {
      slug,
      title: String(ch.title || "Новый канал").trim(),
      description: String(ch.description || "").trim(),
      icon: String(ch.icon || "").trim() || "📡",
      voiceProfile: String(ch.voiceProfile || "").trim(),
      defaultSettings,
    },
    rubrics,
    rationale: String(parsed.rationale || "").trim(),
  }
}
