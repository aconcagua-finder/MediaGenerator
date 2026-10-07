/**
 * Реестр текстовых моделей для чата.
 * Все они вызываются через единый OpenRouter endpoint (chat/completions),
 * поэтому достаточно одного API-ключа OpenRouter.
 *
 * Цены и контекстные окна проверены через openrouter.ai/api/v1/models — 07.10.2026.
 */

export interface TextModel {
  /** Уникальный ID модели в OpenRouter */
  id: string
  /** Имя для UI */
  name: string
  /** Идентификатор провайдера для подсветки в UI */
  vendor: "anthropic" | "openai" | "google" | "xai" | "deepseek" | "qwen"
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
    id: "anthropic/claude-sonnet-5.5",
    name: "Claude Sonnet 5.5",
    vendor: "anthropic",
    description: "Свежий Sonnet (28.09.2026) — прямой апгрейд Sonnet 5 по той же цене. Лучший выбор по умолчанию.",
    category: "balanced",
    contextTokens: 1_000_000,
    pricing: { input: 2.0, output: 10.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    vendor: "anthropic",
    description: "Предыдущий Sonnet — умнее 4.6 и дешевле её; Sonnet 5.5 стоит столько же и новее.",
    category: "balanced",
    contextTokens: 1_000_000,
    // ❗ $2/$10 — вводная цена Anthropic. Анонсировалась «до 31.08.2026 с возвратом
    // к $3/$15», но срок прошёл, а на W37 (07.09.2026) цена всё ещё $2/$10 (сверено с
    // живым /models) — интро продлили/оставили. Недельный аудит поймает возврат.
    pricing: { input: 2.0, output: 10.0 },
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
    id: "openai/gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    vendor: "openai",
    description: "Свежая GPT-6.1 (сентябрь 2026) — средний тир после флагмана Astra. Код, агентные задачи, документы. Дешевле GPT-5.5 в 2.5 раза.",
    category: "balanced",
    contextTokens: 1_050_000,
    pricing: { input: 2.0, output: 10.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "openai/gpt-5.4",
    name: "GPT-5.4",
    vendor: "openai",
    description: "Прошлое поколение флагмана OpenAI. Хорош в фактах, в коде, в анализе; GPT-6.1 Sol новее и заметно дешевле.",
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
    description: "GPT-5 с глубоким reasoning. GPT-6.1 Sol новее и в 2.5 раза дешевле, GPT-6 Astra — умнее.",
    category: "smart",
    contextTokens: 1_050_000,
    pricing: { input: 5.0, output: 30.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "openai/gpt-6-astra",
    name: "GPT-6 Astra",
    vendor: "openai",
    description: "Флагман OpenAI GPT-6 (сентябрь 2026) для самых сложных задач: анализ, разработка, исследования. Дорогая — $10/$50.",
    category: "smart",
    contextTokens: 1_050_000,
    pricing: { input: 10.0, output: 50.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "anthropic/claude-fable-5.1",
    name: "Claude Fable 5.1",
    vendor: "anthropic",
    description: "Старший тир Anthropic (сентябрь 2026): лучшая в линейке в агентном коде и долгих задачах. Дорогая — $10/$50.",
    category: "smart",
    contextTokens: 1_000_000,
    pricing: { input: 10.0, output: 50.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "anthropic/claude-opus-5.5",
    name: "Claude Opus 5.5",
    vendor: "anthropic",
    description: "Новейший Opus (сентябрь 2026) — топ от Anthropic. Умнее Opus 5 и на 20% дешевле.",
    category: "smart",
    contextTokens: 1_000_000,
    // Релиз 22.09.2026, $4/$20 — дешевле Opus 5 ($5/$25). Сверено с живым /models (W40).
    pricing: { input: 4.0, output: 20.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "anthropic/claude-opus-5",
    name: "Claude Opus 5",
    vendor: "anthropic",
    description: "Прошлое поколение Opus (июль 2026). Opus 5.5 новее и дешевле.",
    category: "smart",
    contextTokens: 1_000_000,
    pricing: { input: 5.0, output: 25.0 },
    streaming: true,
    supportsVision: true,
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    vendor: "anthropic",
    description: "Позапрошлое поколение Opus (май 2026). Opus 5.5 новее и дешевле.",
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
    description: "Flash от Google (май 2026). 1M контекст. Gemini 3.8 Flash новее и вдвое дешевле.",
    category: "fast",
    contextTokens: 1_049_000,
    pricing: { input: 1.5, output: 9.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "google/gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    vendor: "google",
    description: "Новейшая Flash от Google (сентябрь 2026): сильнее в коде и агентных задачах, 1M контекст. Вдвое дешевле Gemini 3.5 Flash.",
    category: "fast",
    contextTokens: 1_049_000,
    pricing: { input: 0.75, output: 3.75 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "openai/gpt-6-luna",
    name: "GPT-6 Luna",
    vendor: "openai",
    description: "Быстрая и самая дешёвая GPT-6: чат, классификация, массовая обработка. 1M контекст, $0.1/$0.5.",
    category: "fast",
    contextTokens: 1_050_000,
    pricing: { input: 0.1, output: 0.5 },
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
    description: "Grok (апр 2026). 1M контекст, очень быстрый, дешевле Haiku по выходу. Grok 4.7 новее и умнее.",
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
    id: "x-ai/grok-4.7",
    name: "Grok 4.7",
    vendor: "xai",
    description: "Флагман xAI (сентябрь 2026): код, агентные задачи, проверка собственной работы. 500K контекст.",
    category: "alt",
    contextTokens: 500_000,
    pricing: { input: 2.0, output: 6.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "qwen/qwen3.8-max-0902",
    name: "Qwen 3.8 Max",
    vendor: "qwen",
    description: "Alibaba — флагман Qwen 3.8 (сентябрь 2026): 1M контекст, картинки и видео на входе. Сильная альтернатива за небольшие деньги.",
    category: "alt",
    contextTokens: 1_000_000,
    pricing: { input: 2.0, output: 6.0 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "qwen/qwen3.8-flash",
    name: "Qwen 3.8 Flash",
    vendor: "qwen",
    description: "Alibaba — быстрая и дешёвая Qwen 3.8: код, документы, графики, длинное видео. 1M контекст.",
    category: "alt",
    contextTokens: 1_000_000,
    pricing: { input: 0.15, output: 0.47 },
    isNew: true,
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
    // Политика: совпадать с дефолтным роутом OpenRouter (он же источник правды
    // cron-аудита). W34 дефолт был нативный DeepSeek $0.66/$1.98; W35 сместился на
    // реселлера StreamLake $0.5262/$1.052; в W36 дефолт прыгнул вверх до
    // $1.04226/$2.08452; в W37 просел до $0.95526/$1.91052; в W38 дефолт подскочил
    // до $1.6/$3.2 (+67%); в W39 откатился обратно к $0.95526/$1.91052 (−40%,
    // сверено с живым /models); W41 (07.10.2026) — просел до $0.2088/$0.4176 (−78%).
    // Реселлеры сильно волатильны, следующий аудит сверит снова.
    pricing: { input: 0.209, output: 0.418 },
    isNew: true,
    streaming: true,
  },
  {
    id: "deepseek/deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    vendor: "deepseek",
    description: "Свежая DeepSeek (сентябрь 2026): новая архитектура, дешевле V4 Flash по входу, принимает картинки. Open-source.",
    category: "alt",
    contextTokens: 1_049_000,
    pricing: { input: 0.05, output: 1.2 },
    isNew: true,
    streaming: true,
    supportsVision: true,
  },
  {
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    vendor: "deepseek",
    description: "Самая дешёвая в списке. Open-source, быстрая, хороша для массовой обработки.",
    category: "alt",
    contextTokens: 1_049_000,
    // Дефолтный роут OpenRouter волатилен: W31 $0.098/$0.196 → W34 $0.14/$0.28 →
    // W35 $0.0574/$0.1148 → W36 $0.088606/$0.177212 → W40 $0.14/$0.28 → W41 $0.03/$1.28
    // (вход −79%, выход ×4.6 — реселлер с перекошенным тарифом, сверено с живым /models).
    // Реселлеры волатильны — следующий аудит сверит снова.
    pricing: { input: 0.03, output: 1.28 },
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
  qwen:      { dot: "bg-indigo-400", text: "text-indigo-300", label: "Qwen" },
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
