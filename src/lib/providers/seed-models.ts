/**
 * Начальные данные для таблицы model_registry.
 * Используется при первом запуске для заполнения реестра моделей.
 */

export interface SeedModel {
  provider: string
  modelId: string
  displayName: string
  description: string
  paramsSchema: Record<string, unknown>
  pricing: Record<string, unknown>
}

export const SEED_MODELS: SeedModel[] = [
  // === OpenAI ===
  {
    provider: "openai",
    modelId: "gpt-image-2",
    displayName: "GPT Image 2",
    description: "Новейшая модель OpenAI (апр 2026). O-series reasoning, 2K, точный текст, лучшая в семействе.",
    paramsSchema: {
      size: {
        type: "select",
        label: "Размер",
        options: ["1024x1024", "1536x1024", "1024x1536", "1792x1024", "1024x1792"],
        default: "1024x1024",
      },
      quality: {
        type: "select",
        label: "Качество",
        options: ["low", "medium", "high"],
        default: "medium",
      },
      output_format: {
        type: "select",
        label: "Формат",
        options: ["png", "jpeg", "webp"],
        default: "png",
      },
      // GPT Image 2 не поддерживает transparent background (отвечает 400),
      // поэтому опция фона тут отсутствует. Для прозрачного фона — gpt-image-1.5.
      moderation: {
        type: "select",
        label: "Модерация",
        options: ["low", "auto"],
        default: "low",
        optionLabels: { "low": "low — мягкая", "auto": "auto — стандартная" },
      },
    },
    pricing: {
      low:    { "1024x1024": 0.006, wide: 0.009 },
      medium: { "1024x1024": 0.053, wide: 0.080 },
      high:   { "1024x1024": 0.211, wide: 0.317 },
    },
  },
  {
    provider: "openai",
    modelId: "gpt-image-1.5",
    displayName: "GPT Image 1.5",
    description: "Флагманская модель OpenAI. Лучшее качество и следование промпту.",
    paramsSchema: {
      size: {
        type: "select",
        label: "Размер",
        options: ["1024x1024", "1536x1024", "1024x1536", "1792x1024", "1024x1792"],
        default: "1024x1024",
      },
      quality: {
        type: "select",
        label: "Качество",
        options: ["low", "medium", "high"],
        default: "medium",
      },
      output_format: {
        type: "select",
        label: "Формат",
        options: ["png", "jpeg", "webp"],
        default: "png",
      },
      background: {
        type: "select",
        label: "Фон",
        options: ["opaque", "transparent"],
        default: "opaque",
      },
      moderation: {
        type: "select",
        label: "Модерация",
        options: ["low", "auto"],
        default: "low",
        optionLabels: { "low": "low — мягкая", "auto": "auto — стандартная" },
      },
    },
    pricing: {
      low:    { "1024x1024": 0.009, wide: 0.013 },
      medium: { "1024x1024": 0.034, wide: 0.050 },
      high:   { "1024x1024": 0.133, wide: 0.200 },
    },
  },
  {
    provider: "openai",
    modelId: "gpt-image-1",
    displayName: "GPT Image 1",
    description: "Предыдущее поколение. Хорошее качество, чуть дешевле.",
    paramsSchema: {
      size: {
        type: "select",
        label: "Размер",
        options: ["1024x1024", "1536x1024", "1024x1536"],
        default: "1024x1024",
      },
      quality: {
        type: "select",
        label: "Качество",
        options: ["low", "medium", "high"],
        default: "medium",
      },
      output_format: {
        type: "select",
        label: "Формат",
        options: ["png", "jpeg", "webp"],
        default: "png",
      },
      background: {
        type: "select",
        label: "Фон",
        options: ["opaque", "transparent"],
        default: "opaque",
      },
      moderation: {
        type: "select",
        label: "Модерация",
        options: ["low", "auto"],
        default: "low",
        optionLabels: { "low": "low — мягкая", "auto": "auto — стандартная" },
      },
    },
    pricing: {
      low:    { "1024x1024": 0.011, wide: 0.016 },
      medium: { "1024x1024": 0.042, wide: 0.063 },
      high:   { "1024x1024": 0.167, wide: 0.250 },
    },
  },
  {
    provider: "openai",
    modelId: "gpt-image-1-mini",
    displayName: "GPT Image 1 Mini",
    description: "Бюджетная модель. Самая дешёвая от OpenAI.",
    paramsSchema: {
      size: {
        type: "select",
        label: "Размер",
        options: ["1024x1024", "1536x1024", "1024x1536"],
        default: "1024x1024",
      },
      quality: {
        type: "select",
        label: "Качество",
        options: ["low", "medium", "high"],
        default: "medium",
      },
      output_format: {
        type: "select",
        label: "Формат",
        options: ["png", "jpeg", "webp"],
        default: "png",
      },
      background: {
        type: "select",
        label: "Фон",
        options: ["opaque", "transparent"],
        default: "opaque",
      },
      moderation: {
        type: "select",
        label: "Модерация",
        options: ["low", "auto"],
        default: "low",
        optionLabels: { "low": "low — мягкая", "auto": "auto — стандартная" },
      },
    },
    pricing: {
      low:    { "1024x1024": 0.005, wide: 0.006 },
      medium: { "1024x1024": 0.011, wide: 0.015 },
      high:   { "1024x1024": 0.036, wide: 0.052 },
    },
  },

  // === xAI ===
  {
    provider: "xai",
    modelId: "grok-imagine-image-quality",
    displayName: "Grok Imagine Quality",
    description: "Новый флагман xAI (заменил Pro). Лучшее качество за $0.05/изображение.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "1:2"],
        default: "1:1",
      },
      resolution: {
        type: "select",
        label: "Разрешение",
        options: ["1k", "2k"],
        default: "1k",
      },
    },
    pricing: { perImage: 0.05 },
  },
  {
    provider: "xai",
    modelId: "grok-imagine-image",
    displayName: "Grok Imagine",
    description: "Стандартная модель xAI. Быстрая, дешёвая ($0.02/изображение).",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "1:2"],
        default: "1:1",
      },
      resolution: {
        type: "select",
        label: "Разрешение",
        options: ["1k", "2k"],
        default: "1k",
      },
    },
    pricing: { perImage: 0.02 },
  },
  // === OpenRouter ===
  {
    provider: "openrouter",
    modelId: "google/gemini-3.1-flash-image",
    displayName: "Nano Banana 2",
    description: "Google Gemini 3.1 Flash. Pro-качество, до 4K, точный текст, edit.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["0.5K", "1K", "2K", "4K"],
        default: "1K",
      },
    },
    pricing: { perImage: 0.067 },
  },
  {
    provider: "openrouter",
    modelId: "google/gemini-3.1-flash-lite-image",
    displayName: "Nano Banana 2 Lite",
    description: "Google Gemini 3.1 Flash Lite. Быстро и дёшево (~4 сек).",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["0.5K", "1K", "2K", "4K"],
        default: "1K",
      },
    },
    pricing: { perImage: 0.034 },
  },
  {
    provider: "openrouter",
    modelId: "google/gemini-3-pro-image-preview",
    displayName: "Gemini 3 Pro Image",
    description: "Google — максимальное качество, 2K/4K выход.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["0.5K", "1K", "2K", "4K"],
        default: "1K",
      },
    },
    pricing: { perImage: 0.08 },
  },
  {
    provider: "openrouter",
    modelId: "google/gemini-2.5-flash-image",
    displayName: "Gemini 2.5 Flash Image",
    description: "Google — стабильная и быстрая генерация.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["0.5K", "1K", "2K", "4K"],
        default: "1K",
      },
    },
    pricing: { perImage: 0.039 },
  },
  {
    provider: "openrouter",
    modelId: "openai/gpt-5-image",
    displayName: "GPT-5 Image",
    description: "OpenAI через OpenRouter — флагманская модель.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["1K", "2K"],
        default: "1K",
      },
    },
    pricing: { perImage: 0.10 },
  },
  {
    provider: "openrouter",
    modelId: "openai/gpt-5-image-mini",
    displayName: "GPT-5 Image Mini",
    description: "OpenAI Mini — бюджетная генерация через OpenRouter.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["1K", "2K"],
        default: "1K",
      },
    },
    pricing: { perImage: 0.04 },
  },
  {
    provider: "openrouter",
    modelId: "openai/gpt-5.4-image-2",
    displayName: "GPT-5.4 Image 2",
    description: "OpenAI через OpenRouter — новейшая GPT Image. Лучшее качество и кириллица в семействе.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["1K", "2K"],
        default: "1K",
      },
    },
    pricing: { perImage: 0.12 },
  },
  // FLUX.2 и Seedream доступны на OpenRouter по прямому slug, но НЕ попадают
  // в дефолтный список `?output_modalities=image` (его дёргает listModels).
  // Генерация работает (chat/completions, modalities:["image"]); проверено
  // через GET /api/v1/models/{slug}/endpoints (HTTP 200, status 0) — июнь 2026.
  {
    provider: "openrouter",
    modelId: "black-forest-labs/flux.2-pro",
    displayName: "FLUX.2 Pro",
    description: "Black Forest Labs — высокое качество.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["0.5K", "1K", "2K"],
        default: "1K",
      },
    },
    pricing: { firstMP: 0.03, extraMP: 0.015 },
  },
  {
    provider: "openrouter",
    modelId: "black-forest-labs/flux.2-max",
    displayName: "FLUX.2 Max",
    description: "Black Forest Labs — максимальное качество FLUX.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["0.5K", "1K", "2K"],
        default: "1K",
      },
    },
    pricing: { firstMP: 0.07, extraMP: 0.03 },
  },
  {
    provider: "openrouter",
    modelId: "black-forest-labs/flux.2-flex",
    displayName: "FLUX.2 Flex",
    description: "Black Forest Labs — гибкий формат, быстрая.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["0.5K", "1K", "2K"],
        default: "1K",
      },
    },
    pricing: { perMP: 0.06 },
  },
  {
    provider: "openrouter",
    modelId: "bytedance-seed/seedream-4.5",
    displayName: "Seedream 4.5",
    description: "ByteDance — высокое качество, хорошие детали.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["0.5K", "1K", "2K"],
        default: "1K",
      },
    },
    pricing: { perImage: 0.04 },
  },

  // === Black Forest Labs (прямой API) ===
  {
    provider: "bfl",
    modelId: "flux-2-pro",
    displayName: "FLUX.2 Pro (BFL)",
    description: "Прямой API. Высокое качество, safety_tolerance 0-5.",
    paramsSchema: {
      width: {
        type: "select",
        label: "Ширина",
        options: ["512", "768", "1024", "1280", "1536"],
        default: "1024",
      },
      height: {
        type: "select",
        label: "Высота",
        options: ["512", "768", "1024", "1280", "1536"],
        default: "1024",
      },
      safety_tolerance: {
        type: "select",
        label: "Фильтр",
        options: ["0", "1", "2", "3", "4", "5"],
        default: "5",
        optionLabels: { "0": "0 — строго", "1": "1", "2": "2 — средне", "3": "3", "4": "4", "5": "5 — мягко" },
      },
      output_format: {
        type: "select",
        label: "Формат",
        options: ["png", "jpeg", "webp"],
        default: "png",
      },
    },
    pricing: { firstMP: 0.03, extraMP: 0.015 },
  },
  {
    provider: "bfl",
    modelId: "flux-2-max",
    displayName: "FLUX.2 Max (BFL)",
    description: "Прямой API. Максимальное качество FLUX.",
    paramsSchema: {
      width: {
        type: "select",
        label: "Ширина",
        options: ["512", "768", "1024", "1280", "1536"],
        default: "1024",
      },
      height: {
        type: "select",
        label: "Высота",
        options: ["512", "768", "1024", "1280", "1536"],
        default: "1024",
      },
      safety_tolerance: {
        type: "select",
        label: "Фильтр",
        options: ["0", "1", "2", "3", "4", "5"],
        default: "5",
        optionLabels: { "0": "0 — строго", "1": "1", "2": "2 — средне", "3": "3", "4": "4", "5": "5 — мягко" },
      },
      output_format: {
        type: "select",
        label: "Формат",
        options: ["png", "jpeg", "webp"],
        default: "png",
      },
    },
    pricing: { firstMP: 0.07, extraMP: 0.03 },
  },
  {
    provider: "bfl",
    modelId: "flux-2-flex",
    displayName: "FLUX.2 Flex (BFL)",
    description: "Прямой API. Гибкий формат, контроль модерации.",
    paramsSchema: {
      width: {
        type: "select",
        label: "Ширина",
        options: ["512", "768", "1024", "1280", "1536"],
        default: "1024",
      },
      height: {
        type: "select",
        label: "Высота",
        options: ["512", "768", "1024", "1280", "1536"],
        default: "1024",
      },
      safety_tolerance: {
        type: "select",
        label: "Фильтр",
        options: ["0", "1", "2", "3", "4", "5"],
        default: "5",
        optionLabels: { "0": "0 — строго", "1": "1", "2": "2 — средне", "3": "3", "4": "4", "5": "5 — мягко" },
      },
      output_format: {
        type: "select",
        label: "Формат",
        options: ["png", "jpeg", "webp"],
        default: "png",
      },
    },
    pricing: { perMP: 0.06 },
  },
  {
    provider: "bfl",
    modelId: "flux-2-klein-4b",
    displayName: "FLUX.2 Klein 4B (BFL)",
    description: "Прямой API. Быстрая и дешёвая, real-time.",
    paramsSchema: {
      width: {
        type: "select",
        label: "Ширина",
        options: ["512", "768", "1024", "1280"],
        default: "1024",
      },
      height: {
        type: "select",
        label: "Высота",
        options: ["512", "768", "1024", "1280"],
        default: "1024",
      },
      safety_tolerance: {
        type: "select",
        label: "Фильтр",
        options: ["0", "1", "2", "3", "4", "5"],
        default: "5",
        optionLabels: { "0": "0 — строго", "1": "1", "2": "2 — средне", "3": "3", "4": "4", "5": "5 — мягко" },
      },
      output_format: {
        type: "select",
        label: "Формат",
        options: ["png", "jpeg", "webp"],
        default: "png",
      },
    },
    pricing: { firstMP: 0.014, extraMP: 0.014 },
  },

  // === Google AI (прямой API) ===
  {
    provider: "google",
    modelId: "gemini-3.1-flash-image",
    displayName: "Gemini 3.1 Flash Image",
    description: "Google Nano Banana 2 (GA). Быстрая, до 4K, safety настраивается.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "4:5", "5:4"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["512", "1K", "2K", "4K"],
        default: "1K",
      },
      safety: {
        type: "select",
        label: "Фильтр",
        options: ["off", "low", "medium", "strict"],
        default: "off",
        optionLabels: { "off": "off — без фильтра", "low": "low — мягкий", "medium": "medium — средний", "strict": "strict — строгий" },
      },
    },
    pricing: { "512": 0.045, "1K": 0.067, "2K": 0.101, "4K": 0.151 },
  },
  {
    provider: "google",
    modelId: "gemini-3-pro-image",
    displayName: "Gemini 3 Pro Image",
    description: "Google Nano Banana Pro (GA). Максимальное качество, до 4K.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "4:5", "5:4"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["1K", "2K", "4K"],
        default: "1K",
      },
      safety: {
        type: "select",
        label: "Фильтр",
        options: ["off", "low", "medium", "strict"],
        default: "off",
        optionLabels: { "off": "off — без фильтра", "low": "low — мягкий", "medium": "medium — средний", "strict": "strict — строгий" },
      },
    },
    pricing: { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
  },
  {
    provider: "google",
    modelId: "gemini-2.5-flash-image",
    displayName: "Gemini 2.5 Flash Image",
    description: "Google. Стабильная, быстрая генерация.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
        default: "1:1",
      },
      image_size: {
        type: "select",
        label: "Размер",
        options: ["1K", "2K", "4K"],
        default: "1K",
      },
      safety: {
        type: "select",
        label: "Фильтр",
        options: ["off", "low", "medium", "strict"],
        default: "off",
        optionLabels: { "off": "off — без фильтра", "low": "low — мягкий", "medium": "medium — средний", "strict": "strict — строгий" },
      },
    },
    pricing: { "1K": 0.039, "2K": 0.039, "4K": 0.039 },
  },

  // === Recraft (прямой API) — векторная генерация SVG ===
  {
    provider: "recraft",
    modelId: "recraft-v3-vector",
    displayName: "Recraft V3 Вектор (SVG)",
    description: "Настоящий вектор — SVG для логотипов, иконок, веб-графики. Масштабируется без потерь. Нужен ключ recraft.ai.",
    paramsSchema: {
      size: {
        type: "select",
        label: "Размер",
        options: ["1024x1024", "1365x1024", "1024x1365", "1280x1024", "1024x1280"],
        default: "1024x1024",
      },
      substyle: {
        type: "select",
        label: "Стиль",
        options: ["none", "line_art", "hand_drawn", "engraving", "flat_2", "linocut"],
        default: "none",
        optionLabels: {
          none: "Авто",
          line_art: "Контурный",
          hand_drawn: "От руки",
          engraving: "Гравюра",
          flat_2: "Плоский",
          linocut: "Линогравюра",
        },
      },
    },
    pricing: { perImage: 0.08 },
  },
]
