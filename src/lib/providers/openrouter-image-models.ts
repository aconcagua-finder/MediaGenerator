/**
 * Image-модели OpenRouter, добавленные в октябре 2026 (Images API, `POST /api/v1/images`).
 *
 * Единый источник правды для четырёх мест: сид реестра (`seed-models.ts`), расчёт
 * стоимости (`cost-calculator.ts`), карта правок (`capabilities.ts`) и бейдж «Новинка»
 * (`registry.ts`). Значения сверены с `GET /api/v1/images/models` и
 * `GET /api/v1/images/models/{slug}/endpoints` (поддерживаемые параметры и цены).
 *
 * Цены — USD за изображение. Реальную сумму адаптер берёт из `usage.cost` ответа
 * OpenRouter; здесь цена нужна для оценки в форме и пред-проверки лимитов.
 * Пометка «оценка» в комментарии — у провайдера нет явной цены за изображение
 * и значение выведено из токенного тарифа и измеренного расхода токенов.
 *
 * Не добавлены намеренно:
 *  - recraft/recraft-v4-styles(-pro)(-vector): требуют минимум 1 референс-картинку;
 *  - inclusionai/ming-image-0.1-design-layer: тоже требует входное изображение;
 *  - *-preview, у которых есть GA, дубли прямых провайдеров и openrouter/auto*.
 */

export type OpenRouterImagePrice =
  | { perImage: number }
  | { bySize: Record<string, number> }

export interface OpenRouterImageSpec {
  modelId: string
  displayName: string
  description: string
  /** Допустимые aspect_ratio; пусто — параметр не поддерживается моделью */
  aspects: string[]
  /** Допустимые image_size (tier разрешения); пусто — параметр не поддерживается */
  sizes: string[]
  /** Опциональный параметр качества */
  quality?: { options: string[]; default: string }
  price: OpenRouterImagePrice
  /** Принимает ли референс-картинку (редактирование / image-to-image) */
  imageInput: boolean
}

const A_WIDE = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
const A_NO_ULTRA = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"]
const A_RECRAFT = ["1:1", "3:4", "4:3", "9:16", "16:9"]
const A_MAI = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"]
const A_KREA = ["1:1", "2:3", "3:2", "4:3", "4:5", "9:16", "16:9"]

export const OPENROUTER_IMAGE_SPECS: OpenRouterImageSpec[] = [
  // === OpenAI GPT Image 2.5 ===
  {
    modelId: "openai/gpt-image-2.5-sunburst",
    displayName: "GPT Image 2.5 Sunburst",
    description: "OpenAI — точный тир GPT Image 2.5: детальные сцены, текст на картинке, правки. Цена зависит от качества.",
    aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"],
    sizes: [],
    // токенный тариф $0.00003, как у GPT-5.4 Image 2; оценка по высокому качеству
    price: { perImage: 0.12 },
    imageInput: true,
  },
  {
    modelId: "openai/gpt-image-2.5-flare",
    displayName: "GPT Image 2.5 Flare",
    description: "OpenAI — быстрый тир GPT Image 2.5 для повседневных задач. Цена зависит от качества.",
    aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"],
    sizes: [],
    price: { perImage: 0.12 },
    imageInput: true,
  },

  // === Black Forest Labs ===
  {
    modelId: "black-forest-labs/flux-3-image",
    displayName: "FLUX.3 Image",
    description: "Black Forest Labs — флагман FLUX.3: генерация и правка по нескольким референсам (до 10). 4K заметно дороже.",
    aspects: A_WIDE,
    sizes: ["1K", "2K", "4K"],
    // SKU по тирам: 1k 0.048, 2k 0.10, 4k 0.607 (сейчас OpenRouter списывает вдвое меньше прайса)
    price: { bySize: { "1K": 0.048, "2K": 0.1, "4K": 0.607 } },
    imageInput: true,
  },

  // === ByteDance Seedream 5.0 ===
  {
    modelId: "bytedance-seed/seedream-5-0-pro",
    displayName: "Seedream 5.0 Pro",
    description: "ByteDance — старший Seedream 5.0: сложные промпты, до 14 референсов. 2K вдвое дороже 1K.",
    aspects: A_WIDE,
    sizes: ["1K", "2K"],
    // output_image 0.045, вариант high_resolution 0.09 (отнесён к 2K)
    price: { bySize: { "1K": 0.045, "2K": 0.09 } },
    imageInput: true,
  },
  {
    modelId: "bytedance-seed/seedream-5-0-lite",
    displayName: "Seedream 5.0 Lite",
    description: "ByteDance — Seedream 5.0 Lite: поиск в вебе при генерации, сложные промпты, референсы. От 2K, единая цена.",
    aspects: A_WIDE,
    sizes: ["2K", "4K"],
    price: { perImage: 0.035 },
    imageInput: true,
  },
  {
    modelId: "bytedance-seed/seedream-5-0-flash",
    displayName: "Seedream 5.0 Flash",
    description: "ByteDance — быстрый и дешёвый тир Seedream 5.0 для больших объёмов.",
    aspects: A_WIDE,
    sizes: ["1K", "2K"],
    price: { perImage: 0.018 },
    imageInput: true,
  },

  // === xAI ===
  {
    modelId: "x-ai/grok-imagine-image-2.0",
    displayName: "Grok Imagine Image 2.0",
    description: "xAI — Grok Imagine 2.0: генерация и правка по референсам, качество low/medium. Цена в форме — для medium.",
    aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
    sizes: ["1K", "2K"],
    quality: { options: ["low", "medium"], default: "medium" },
    // medium_1k 0.06, medium_2k 0.08 (low: 0.04 и 0.06)
    price: { bySize: { "1K": 0.06, "2K": 0.08 } },
    imageInput: true,
  },

  // === Google ===
  {
    modelId: "google/gemini-nano-banana-2.1",
    displayName: "Nano Banana 2.1",
    description: "Google — Nano Banana 2.1 (Flash-тир): преемник Nano Banana 2 и Pro, сильнее в ретуши товаров и правках.",
    aspects: A_WIDE,
    sizes: ["1K", "2K", "4K"],
    // токен $0.00003 — вдвое дешевле Nano Banana 2; оценка по таблице Nano Banana 2 Lite
    price: { bySize: { "1K": 0.034, "2K": 0.051, "4K": 0.076 } },
    imageInput: true,
  },

  // === Qwen ===
  {
    modelId: "qwen/qwen-image-3",
    displayName: "Qwen Image 3",
    description: "Alibaba Qwen — точный рендер текста и мелких деталей, генерация и правка. Единая цена за 1K и 2K.",
    aspects: A_NO_ULTRA,
    sizes: ["1K", "2K"],
    price: { bySize: { "1K": 0.03, "2K": 0.03 } },
    imageInput: true,
  },
  {
    modelId: "qwen/qwen-image-3-pro",
    displayName: "Qwen Image 3 Pro",
    description: "Alibaba Qwen — старшая версия Qwen Image 3. 2K почти вдвое дороже 1K.",
    aspects: A_NO_ULTRA,
    sizes: ["1K", "2K"],
    price: { bySize: { "1K": 0.04, "2K": 0.075 } },
    imageInput: true,
  },

  // === Recraft V4 ===
  {
    modelId: "recraft/recraft-v4",
    displayName: "Recraft V4",
    description: "Recraft — растровая генерация V4: дизайн, иллюстрации, ~1K.",
    aspects: A_RECRAFT,
    sizes: [],
    price: { perImage: 0.04 },
    imageInput: true,
  },
  {
    modelId: "recraft/recraft-v4-pro",
    displayName: "Recraft V4 Pro",
    description: "Recraft — старшая растровая V4 с повышенной детализацией. Дорогая.",
    aspects: A_RECRAFT,
    sizes: [],
    price: { perImage: 0.25 },
    imageInput: true,
  },
  {
    modelId: "recraft/recraft-v4-vector",
    displayName: "Recraft V4 Вектор (SVG)",
    description: "Recraft — настоящий вектор SVG для логотипов, иконок и веб-графики. Масштабируется без потерь.",
    aspects: A_RECRAFT,
    sizes: [],
    price: { perImage: 0.08 },
    imageInput: true,
  },
  {
    modelId: "recraft/recraft-v4-pro-vector",
    displayName: "Recraft V4 Pro Вектор (SVG)",
    description: "Recraft — старший вектор V4 (SVG) с повышенной детализацией. Дорогой.",
    aspects: A_RECRAFT,
    sizes: [],
    price: { perImage: 0.3 },
    imageInput: true,
  },

  // === Recraft V4.1 ===
  {
    modelId: "recraft/recraft-v4.1",
    displayName: "Recraft V4.1",
    description: "Recraft — растровая генерация V4.1, чуть дешевле V4.",
    aspects: A_RECRAFT,
    sizes: [],
    price: { perImage: 0.035 },
    imageInput: true,
  },
  {
    modelId: "recraft/recraft-v4.1-flash",
    displayName: "Recraft V4.1 Flash",
    description: "Recraft — самая быстрая и дешёвая V4.1 (~1.5 сек, ~1K). Только из текста, без референсов.",
    aspects: A_RECRAFT,
    sizes: [],
    price: { perImage: 0.007 },
    imageInput: false,
  },
  {
    modelId: "recraft/recraft-v4.1-pro",
    displayName: "Recraft V4.1 Pro",
    description: "Recraft — старшая растровая V4.1 с повышенной детализацией.",
    aspects: A_RECRAFT,
    sizes: [],
    price: { perImage: 0.21 },
    imageInput: true,
  },
  {
    modelId: "recraft/recraft-v4.1-utility",
    displayName: "Recraft V4.1 Utility",
    description: "Recraft — универсальная V4.1 для прикладной графики: баннеры, макеты, ~1K.",
    aspects: A_RECRAFT,
    sizes: [],
    price: { perImage: 0.035 },
    imageInput: true,
  },
  {
    modelId: "recraft/recraft-v4.1-utility-pro",
    displayName: "Recraft V4.1 Utility Pro",
    description: "Recraft — старшая универсальная V4.1 для прикладной графики.",
    aspects: A_RECRAFT,
    sizes: [],
    price: { perImage: 0.21 },
    imageInput: true,
  },
  {
    modelId: "recraft/recraft-v4.1-vector",
    displayName: "Recraft V4.1 Вектор (SVG)",
    description: "Recraft — вектор SVG на V4.1 для логотипов, иконок и веб-графики.",
    aspects: A_RECRAFT,
    sizes: [],
    price: { perImage: 0.08 },
    imageInput: true,
  },
  {
    modelId: "recraft/recraft-v4.1-pro-vector",
    displayName: "Recraft V4.1 Pro Вектор (SVG)",
    description: "Recraft — старший вектор SVG на V4.1 с повышенной детализацией. Дорогой.",
    aspects: A_RECRAFT,
    sizes: [],
    price: { perImage: 0.3 },
    imageInput: true,
  },

  // === Microsoft MAI-Image ===
  {
    modelId: "microsoft/mai-image-2.5",
    displayName: "MAI-Image 2.5",
    description: "Microsoft AI — MAI-Image 2.5: генерация и правка, ~1K.",
    aspects: A_MAI,
    sizes: [],
    // 1024 токена на изображение (измерено на 2.6 Flash) × $0.000047
    price: { perImage: 0.048 },
    imageInput: true,
  },
  {
    modelId: "microsoft/mai-image-2.5-pro",
    displayName: "MAI-Image 2.5 Pro",
    description: "Microsoft AI — старшая MAI-Image 2.5, максимум качества. Дорогая.",
    aspects: A_MAI,
    sizes: [],
    price: { perImage: 0.111 },
    imageInput: true,
  },
  {
    modelId: "microsoft/mai-image-2.6",
    displayName: "MAI-Image 2.6",
    description: "Microsoft AI — точный тир MAI-Image 2.6 для дизайнерских визуалов; поддерживает веб-grounding.",
    aspects: A_MAI,
    sizes: [],
    price: { perImage: 0.039 },
    imageInput: true,
  },
  {
    modelId: "microsoft/mai-image-2.6-flash",
    displayName: "MAI-Image 2.6 Flash",
    description: "Microsoft AI — быстрый и дешёвый тир MAI-Image 2.6.",
    aspects: A_MAI,
    sizes: [],
    // подтверждено живым вызовом: usage.cost $0.0195
    price: { perImage: 0.0195 },
    imageInput: true,
  },

  // === Krea 2 ===
  {
    modelId: "krea/krea-2-large",
    displayName: "Krea 2 Large",
    description: "Krea — старшая Krea 2: эстетика и стабильность стиля, ~1K, один референс.",
    aspects: A_KREA,
    sizes: [],
    price: { perImage: 0.06 },
    imageInput: true,
  },
  {
    modelId: "krea/krea-2-medium",
    displayName: "Krea 2 Medium",
    description: "Krea — сбалансированная и недорогая Krea 2, ~1K, один референс.",
    aspects: A_KREA,
    sizes: [],
    price: { perImage: 0.03 },
    imageInput: true,
  },
  {
    modelId: "krea/krea-2-medium-turbo",
    displayName: "Krea 2 Medium Turbo",
    description: "Krea — ускоренная Krea 2 Medium, самая дешёвая в семействе, ~1K.",
    aspects: A_KREA,
    sizes: [],
    // подтверждено живым вызовом: usage.cost $0.015
    price: { perImage: 0.015 },
    imageInput: true,
  },

  // === Meta ===
  {
    modelId: "meta/muse-image",
    displayName: "Meta Muse Image",
    description: "Meta — агентная модель: сначала рассуждает, потом рисует; генерация и правка. ⚠️ Требует подтверждения 18+ в настройках аккаунта OpenRouter.",
    aspects: [],
    sizes: [],
    // токенный тариф × 4175 токенов (оценка)
    price: { perImage: 0.01 },
    imageInput: true,
  },

  // === Tencent ===
  {
    modelId: "tencent/hy-image-v3.5-preview",
    displayName: "Hy Image 3.5 (preview)",
    description: "Tencent — Hy Image 3.5: генерация и многошаговое редактирование, до 20 референсов. Превью-версия.",
    aspects: A_NO_ULTRA,
    sizes: ["1K", "2K"],
    // 1K подтверждено живым вызовом ($0.024 = 15000 токенов); 2K — оценка ×4
    price: { bySize: { "1K": 0.024, "2K": 0.096 } },
    imageInput: true,
  },

  // === inclusionAI ===
  {
    modelId: "inclusionai/ming-image-0.1-design",
    displayName: "Ming Image 0.1 Design",
    description: "inclusionAI — графический дизайн с читаемым текстом на картинке. Бесплатно на OpenRouter, только из текста.",
    aspects: [],
    sizes: [],
    price: { perImage: 0 },
    imageInput: false,
  },

  // === Sourceful Riverflow ===
  {
    modelId: "sourceful/riverflow-v2-fast",
    displayName: "Riverflow V2 Fast",
    description: "Sourceful — быстрая Riverflow V2: текст и картинка → картинка, поддержка шрифтов.",
    aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"],
    sizes: ["1K", "2K"],
    price: { bySize: { "1K": 0.02, "2K": 0.04 } },
    imageInput: true,
  },
  {
    modelId: "sourceful/riverflow-v2-pro",
    displayName: "Riverflow V2 Pro",
    description: "Sourceful — старшая Riverflow V2: высокая детализация, до 4K. 4K дороже вдвое.",
    aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"],
    sizes: ["1K", "2K", "4K"],
    price: { bySize: { "1K": 0.15, "2K": 0.15, "4K": 0.33 } },
    imageInput: true,
  },
  {
    modelId: "sourceful/riverflow-v2.5-fast",
    displayName: "Riverflow V2.5 Fast",
    description: "Sourceful — быстрая Riverflow 2.5 для продакшена с низкой задержкой. Выдаёт JPEG.",
    aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"],
    sizes: ["1K", "2K"],
    price: { bySize: { "1K": 0.019, "2K": 0.021 } },
    imageInput: true,
  },
  {
    modelId: "sourceful/riverflow-v2.5-pro",
    displayName: "Riverflow V2.5 Pro",
    description: "Sourceful — старшая Riverflow 2.5: максимум качества, до 4K.",
    aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"],
    sizes: ["1K", "2K", "4K"],
    price: { bySize: { "1K": 0.13, "2K": 0.15, "4K": 0.17 } },
    imageInput: true,
  },
]

const SPEC_BY_ID = new Map(OPENROUTER_IMAGE_SPECS.map((s) => [s.modelId, s]))

export function getOpenRouterImageSpec(modelId: string): OpenRouterImageSpec | null {
  return SPEC_BY_ID.get(modelId) ?? null
}

/**
 * Цена одного изображения по реестру. Для tier-цен без совпадения берём максимум
 * (консервативно, не занижаем). null — модели нет в реестре.
 */
export function openRouterImagePrice(modelId: string, imageSize?: string): number | null {
  const spec = SPEC_BY_ID.get(modelId)
  if (!spec) return null
  if ("perImage" in spec.price) return spec.price.perImage
  const table = spec.price.bySize
  if (imageSize && table[imageSize] != null) return table[imageSize]
  const defaultSize = spec.sizes[0]
  if (!imageSize && defaultSize && table[defaultSize] != null) return table[defaultSize]
  return Math.max(...Object.values(table))
}

/** Модели с поддержкой референс-картинки (правка / image-to-image) */
export const OPENROUTER_IMAGE_INPUT_IDS = OPENROUTER_IMAGE_SPECS
  .filter((s) => s.imageInput)
  .map((s) => s.modelId)
