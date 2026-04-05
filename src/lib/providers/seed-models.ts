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
    modelId: "grok-imagine-image",
    displayName: "Grok Imagine",
    description: "Стандартная модель xAI. Быстрая генерация.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "1:2"],
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
  {
    provider: "xai",
    modelId: "grok-imagine-image-pro",
    displayName: "Grok Imagine Pro",
    description: "Модель высокого качества xAI.",
    paramsSchema: {
      aspect_ratio: {
        type: "select",
        label: "Соотношение сторон",
        options: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "1:2"],
        default: "1:1",
      },
      resolution: {
        type: "select",
        label: "Разрешение",
        options: ["1k", "2k"],
        default: "1k",
      },
    },
    pricing: { perImage: 0.07 },
  },

  // === OpenRouter ===
  {
    provider: "openrouter",
    modelId: "google/gemini-3.1-flash-image-preview",
    displayName: "Gemini 3.1 Flash Image",
    description: "Новейшая модель Google. Pro-качество на Flash-скорости.",
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
    pricing: { perImage: 0.04 },
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
        label: "Модерация (0-5)",
        options: ["0", "1", "2", "3", "4", "5"],
        default: "5",
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
        label: "Модерация (0-5)",
        options: ["0", "1", "2", "3", "4", "5"],
        default: "5",
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
        label: "Модерация (0-5)",
        options: ["0", "1", "2", "3", "4", "5"],
        default: "5",
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
        label: "Модерация (0-5)",
        options: ["0", "1", "2", "3", "4", "5"],
        default: "5",
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
]
