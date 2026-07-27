/**
 * Реестр текстовых моделей для чата.
 * Все они вызываются через единый OpenRouter endpoint (chat/completions),
 * поэтому достаточно одного API-ключа OpenRouter.
 *
 * Цены и контекстные окна проверены через openrouter.ai/api/v1/models — июнь 2026.
 */

export interface TextModel {
  /** Уникальный ID модели в OpenRouter */
  id: string
  /** Имя для UI */
  name: string
  /** Идентификатор провайдера для подсветки в UI */
  vendor: "anthropic" | "openai" | "google" | "xai" | "deepseek"
  /** Краткое описание для не-технаря */
  description: string
  /** Категория для группировки */
  category: "balanced" | "smart" | "fast" | "alt"
  /** Размер контекстного окна в токенах (для подсчёта и подсказки в UI) */
  contextTokens: number
  /** Цена за 1М входных/выходных токенов в USD */
  pricing: { input: number; output: number }
  /** Подсветка как "новинка" */
  isNew?: boolean
  /** Поддерживает ли модель потоковую передачу */
  streaming: boolean
  /**
   * Принимает ли модель картинки во входе (vision). Используется
   * для активации paste/drop-вложений в чате. Источник правды:
   * `VISION_TEXT_MODELS` в `@/lib/capabilities` — здесь дублируем
   * как удобный флаг для UI.
   */
  supportsVision?: boolean
}

export const TEXT_MODELS: TextModel[] = [
  // ===== Универсальные (баланс качества/цены) =====
  {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    vendor: "anthropic",
    description: "Новое поколение Sonnet — умнее 4.6 и сейчас дешевле её. Лучший выбор по умолчанию.",
    category: "balanced",
    contextTokens: 1_000_000,
    // ❗ $2/$10 — вводная цена Anthropic, действует до 31.08.2026, дальше
    // возврат к прайсу $3/$15. Недельный аудит поймает возврат (сверка с живым API).
    pricing: { input: 2.0, output: 10.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    vendor: "anthropic",
    description: "Прошлое поколение Sonnet. Проверенная временем, но Sonnet 5 сейчас дешевле.",
    category: "balanced",
    contextTokens: 1_000_000,
    pricing: { input: 3.0, output: 15.0 },
    streaming: true,
    supportsVision: true,
  },
  {
    id: "openai/gpt-5.4",
    name: "GPT-5.4",
    vendor: "openai",
    description: "Свежий флагман OpenAI. Хорош в фактах, в коде, в анализе.",
    category: "balanced",
    contextTokens: 1_050_000,
    pricing: { input: 2.5, output: 15.0 },
    streaming: true,
    supportsVision: true,
  },

  // ===== Для сложных задач (smart, reasoning) =====
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    vendor: "openai",
    description: "Новейшая GPT с глубоким reasoning. Самая умная в линейке OpenAI.",
    category: "smart",
    contextTokens: 1_050_000,
    pricing: { input: 5.0, output: 30.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "anthropic/claude-opus-5",
    name: "Claude Opus 5",
    vendor: "anthropic",
    description: "Новое поколение Opus — топ от Anthropic. Глубокий анализ и длинные рассуждения по цене Opus 4.8.",
    category: "smart",
    contextTokens: 1_000_000,
    pricing: { input: 5.0, output: 25.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    vendor: "anthropic",
    description: "Прошлое поколение Opus (май 2026). Проверенная временем; Opus 5 новее по той же цене.",
    category: "smart",
    contextTokens: 1_000_000,
    pricing: { input: 5.0, output: 25.0 },
    streaming: true,
    supportsVision: true,
  },
  {
    id: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    vendor: "google",
    description: "Google — огромный контекст, хорош для длинных документов и анализа.",
    category: "smart",
    contextTokens: 1_049_000,
    pricing: { input: 2.0, output: 12.0 },
    streaming: true,
    supportsVision: true,
  },

  // ===== Быстрые и дешёвые =====
  {
    id: "google/gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    vendor: "google",
    description: "Новейшая Flash от Google (май 2026). 1M контекст, баланс цены и качества — между Haiku и Sonnet.",
    category: "fast",
    contextTokens: 1_049_000,
    pricing: { input: 1.5, output: 9.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    vendor: "anthropic",
    description: "Быстрая Anthropic. Для коротких задач, переписки, простых текстов.",
    category: "fast",
    contextTokens: 200_000,
    pricing: { input: 1.0, output: 5.0 },
    streaming: true,
    supportsVision: true,
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    vendor: "openai",
    description: "Лёгкая GPT. Быстро и почти бесплатно для простых задач.",
    category: "fast",
    contextTokens: 400_000,
    pricing: { input: 0.25, output: 2.0 },
    streaming: true,
    supportsVision: true,
  },
  {
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash",
    vendor: "google",
    description: "Быстрая Google. 1M контекст, дешевле Gemini 3.5 Flash, ниже качество.",
    category: "fast",
    contextTokens: 1_049_000,
    pricing: { input: 0.5, output: 3.0 },
    streaming: true,
    supportsVision: true,
  },
  {
    id: "google/gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    vendor: "google",
    description: "Сверхдешёвая Google. Для простой переписки и массовой обработки текста.",
    category: "fast",
    contextTokens: 1_049_000,
    pricing: { input: 0.25, output: 1.5 },
    streaming: true,
    supportsVision: true,
  },

  // ===== Альтернативы =====
  {
    id: "x-ai/grok-4.3",
    name: "Grok 4.3",
    vendor: "xai",
    description: "Новейший Grok (апр 2026). 1M контекст, очень быстрый, дешевле Haiku по выходу.",
    category: "alt",
    contextTokens: 1_000_000,
    pricing: { input: 1.25, output: 2.5 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "x-ai/grok-4.20-multi-agent",
    name: "Grok 4.20 Multi-Agent",
    vendor: "xai",
    description: "Топовый Grok с мульти-агентным режимом. 2M контекст, умнее обычного Grok 4.20 в reasoning — по той же цене.",
    category: "alt",
    contextTokens: 2_000_000,
    pricing: { input: 1.25, output: 2.5 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "x-ai/grok-4.20",
    name: "Grok 4.20",
    vendor: "xai",
    description: "Базовый Grok с большим контекстом. Свежие данные из X, прямолинейный стиль.",
    category: "alt",
    contextTokens: 2_000_000,
    pricing: { input: 1.25, output: 2.5 },
    streaming: true,
    supportsVision: true,
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    vendor: "deepseek",
    description: "Open-source топ. Качество рядом с GPT-5, цена в 5-10 раз ниже.",
    category: "alt",
    contextTokens: 1_049_000,
    pricing: { input: 0.435, output: 0.87 },
    isNew: true,
    streaming: true,
  },
  {
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    vendor: "deepseek",
    description: "Самая дешёвая в списке. Open-source, быстрая, хороша для массовой обработки.",
    category: "alt",
    contextTokens: 1_049_000,
    // Дефолтная цена OpenRouter выросла $0.098/$0.196 → $0.14/$0.28 (сверено с
    // живым API, аудит W31: нативный DeepSeek-endpoint и большинство провайдеров).
    pricing: { input: 0.14, output: 0.28 },
    streaming: true,
  },
]

export const CATEGORY_LABELS: Record<TextModel["category"], string> = {
  balanced: "Универсальные",
  smart: "Умные — для сложных задач",
  fast: "Быстрые и дешёвые",
  alt: "Альтернативы",
}

/** Цветовая маркировка провайдеров для UI */
export const VENDOR_COLORS: Record<TextModel["vendor"], { dot: string; text: string; label: string }> = {
  anthropic: { dot: "bg-orange-400", text: "text-orange-300", label: "Anthropic" },
  openai:    { dot: "bg-emerald-400", text: "text-emerald-300", label: "OpenAI" },
  google:    { dot: "bg-blue-400", text: "text-blue-300", label: "Google" },
  xai:       { dot: "bg-violet-400", text: "text-violet-300", label: "xAI" },
  deepseek:  { dot: "bg-cyan-400", text: "text-cyan-300", label: "DeepSeek" },
}

/** Форматирование размера контекста для UI */
export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`
  }
  return `${Math.round(tokens / 1000)}K`
}

/** Модель по умолчанию для нового чата */
export const DEFAULT_TEXT_MODEL = "anthropic/claude-sonnet-4.6"

/** Дефолтные настройки чата — оптимальные для большинства задач */
export const DEFAULT_CHAT_SETTINGS = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1.0,
}

/** Готовые системные промпты для разных задач */
export const SYSTEM_PROMPT_PRESETS: Array<{ id: string; label: string; prompt: string }> = [
  {
    id: "none",
    label: "Без инструкции",
    prompt: "",
  },
  {
    id: "copywriter",
    label: "Копирайтер",
    prompt: "Ты опытный копирайтер, пишущий на русском языке. Создавай яркие, продающие тексты с живым языком. Избегай канцелярита и штампов. Соблюдай тон, который запрашивает пользователь.",
  },
  {
    id: "editor",
    label: "Редактор",
    prompt: "Ты редактор. Улучшай тексты: убирай повторы, штампы, канцелярит. Делай предложения короче и яснее. Сохраняй смысл и интонацию автора. Помечай изменения, если просит.",
  },
  {
    id: "smm",
    label: "SMM-специалист",
    prompt: "Ты SMM-специалист, пишущий посты для соцсетей на русском. Адаптируй стиль под платформу. Используй эмодзи умеренно. Делай тексты вовлекающими, с цепляющим началом.",
  },
  {
    id: "translator",
    label: "Переводчик",
    prompt: "Ты переводчик. Переводи естественно, сохраняя смысл и стиль. Не переводи дословно — адаптируй идиомы. Если в исходнике термин — найди русский эквивалент или оставь оригинал с пояснением.",
  },
  {
    id: "analyst",
    label: "Аналитик",
    prompt: "Ты аналитик. Структурируй мысли, опирайся на факты, выдвигай гипотезы. Указывай уверенность. Когда не знаешь — говори об этом. Используй markdown для структуры.",
  },
]

export function getTextModel(id: string): TextModel | null {
  return TEXT_MODELS.find((m) => m.id === id) || null
}
