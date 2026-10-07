/**
 * Реестр видеомоделей для вкладки «Видео».
 * Все вызываются через единый OpenRouter endpoint (POST /api/v1/videos),
 * поэтому достаточно одного API-ключа OpenRouter (того же, что у картинок/чата).
 *
 * Цены — эффективная стоимость за секунду по разрешению (см. VideoPrice). Точная
 * сумма всё равно берётся из ответа OpenRouter (`usage.cost`) после генерации;
 * здесь — для оценки в UI и пред-проверки лимитов ДО запуска.
 *
 * Источник capabilities и цен (`pricing_skus`): openrouter.ai
 * `GET /api/v1/videos/models` — сверено с фактическими списаниями июль 2026.
 */

export type VideoVendor =
  | "google"
  | "openai"
  | "xai"
  | "bytedance"
  | "kuaishou"
  | "minimax"
  | "alibaba"
  | "runway"
  | "bfl"
  | "heygen"

export type VideoMode = "t2v" | "i2v"

/**
 * Поддержка русской речи в озвучке:
 * - good — уверенно озвучивает на русском (Veo)
 * - partial — иногда/частично, лучше проверить
 * - none — озвучивает не на русском (англ/кит) или вообще без звука
 */
export type RussianSpeech = "good" | "partial" | "none"

/**
 * Цена генерации видео. У разных вендоров разные схемы биллинга (видео-токены,
 * плоская за секунду, тариф по разрешению, доплата за звук) — здесь всё сведено к
 * единому виду: эффективная цена за секунду для каждого разрешения. Источник —
 * OpenRouter `pricing_skus`, сверено с фактическими `usage.cost`.
 *
 * Токенные модели (Seedance) пересчитаны в $/сек по формуле, подтверждённой
 * реальными списаниями: цена = ширина × высота × 0.0234375 токена/пиксель-сек ×
 * цена_токена. Отсюда 1080p ≈ в 5 раз дороже 480p, 4K ≈ в 20 раз — плоское число
 * за секунду сильно занижало оценку на высоких разрешениях.
 */
export interface VideoPrice {
  /** USD за секунду по разрешению (без звука или когда звук не влияет на цену) */
  perSecond: Record<string, number>
  /** USD за секунду по разрешению СО звуком — задаётся только если звук меняет цену */
  perSecondAudio?: Record<string, number>
}

export interface VideoModel {
  /** ID модели в OpenRouter (передаётся в поле `model`) */
  id: string
  /** Имя для UI */
  name: string
  /** Вендор — для подсветки и группировки */
  vendor: VideoVendor
  /** Краткое описание для не-технаря */
  description: string
  /** Поддерживаемые режимы: text-to-video и/или image-to-video */
  modes: VideoMode[]
  /** Поддерживает ли генерацию звука */
  supportsAudio: boolean
  /**
   * Звук всегда вшит в результат и не отключается (параметра generate_audio нет).
   * Для UI: вместо «Без звука» показываем, что звук встроен.
   */
  builtInAudio?: boolean
  /** Умеет ли озвучивать на русском (для звуковых моделей) */
  russianSpeech: RussianSpeech
  /** Допустимые длительности клипа в секундах */
  durations: number[]
  /** Допустимые разрешения (значение поля `resolution`) */
  resolutions: string[]
  /** Допустимые соотношения сторон */
  aspectRatios: string[]
  /** Цена: эффективная стоимость за секунду по разрешению (+ звук, если влияет) */
  price: VideoPrice
  /** Пометка «новинка» */
  isNew?: boolean
}

export const VIDEO_MODELS: VideoModel[] = [
  // ===== Топ-качество =====
  {
    id: "bytedance/seedance-2.0",
    name: "Seedance 2.0",
    vendor: "bytedance",
    description: "ByteDance — топ качества (лидер арены). Динамика, детали, звук, до 4K. Отличный баланс цены и качества.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "none",
    durations: [4, 8, 12],
    resolutions: ["480p", "720p", "1080p", "4K"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"],
    // video_tokens $0.000007 (480p/720p); ByteDance ввёл поресольюшн-тариф:
    // 1080p $0.0000077, 4K $0.000004 (аудит W34) — 4K подешевел почти вдвое.
    price: { perSecond: { "480p": 0.0673, "720p": 0.1512, "1080p": 0.3742, "4K": 0.7776 } },
    isNew: true,
  },
  {
    id: "alibaba/happyhorse-1.1",
    name: "HappyHorse 1.1",
    vendor: "alibaba",
    description: "Alibaba — новейшая топовая модель (лидер слепых тестов арены): сильное следование промпту, плавное движение, до 1080p. На OpenRouter без звука; i2v только по первому кадру.",
    modes: ["t2v", "i2v"],
    supportsAudio: false,
    russianSpeech: "none",
    durations: [4, 8, 12],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"],
    price: { perSecond: { "720p": 0.0988, "1080p": 0.1278 } },
    isNew: true,
  },
  {
    id: "google/veo-3.1",
    name: "Veo 3.1",
    vendor: "google",
    description: "Google — кинематографичное видео с нативным синхронным звуком, до 4K. Лучшее для русской озвучки.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "good",
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p", "4K"],
    aspectRatios: ["16:9", "9:16"],
    // звук почти удваивает цену; 4K дороже
    price: {
      perSecond: { "720p": 0.2, "1080p": 0.2, "4K": 0.4 },
      perSecondAudio: { "720p": 0.4, "1080p": 0.4, "4K": 0.6 },
    },
    isNew: true,
  },
  {
    id: "kwaivgi/kling-v3.0-pro",
    name: "Kling 3.0 Pro",
    vendor: "kuaishou",
    description: "Kuaishou — топовая модель, плавное движение и звук. Озвучка только англ/кит/яп/кор/исп.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "none",
    durations: [5, 10],
    resolutions: ["720p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    // разрешение не влияет; звук +50%
    price: {
      perSecond: { "720p": 0.112 },
      perSecondAudio: { "720p": 0.168 },
    },
    isNew: true,
  },
  {
    id: "kwaivgi/kling-video-o1",
    name: "Kling O1",
    vendor: "kuaishou",
    description: "Kuaishou — новейшая флагманская модель Kling: лучше понимает сложные промпты, плавное движение и звук. Озвучка не на русском.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "none",
    durations: [5, 10],
    resolutions: ["720p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    price: { perSecond: { "720p": 0.112 } },
    isNew: true,
  },

  // ===== Баланс цены и качества =====
  {
    id: "google/veo-3.1-fast",
    name: "Veo 3.1 Fast",
    vendor: "google",
    description: "Google — качество Veo дешевле и быстрее, со звуком. Хорошо озвучивает на русском.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "good",
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p", "4K"],
    aspectRatios: ["16:9", "9:16"],
    price: {
      perSecond: { "720p": 0.08, "1080p": 0.1, "4K": 0.25 },
      perSecondAudio: { "720p": 0.1, "1080p": 0.12, "4K": 0.3 },
    },
  },
  {
    id: "google/veo-3.1-lite",
    name: "Veo 3.1 Lite",
    vendor: "google",
    description: "Google — самый дешёвый Veo со звуком и русской озвучкой. Лучший бюджетный вариант для речи.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "good",
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16"],
    price: {
      perSecond: { "720p": 0.03, "1080p": 0.05 },
      perSecondAudio: { "720p": 0.05, "1080p": 0.08 },
    },
    isNew: true,
  },
  {
    id: "kwaivgi/kling-v3.0-std",
    name: "Kling 3.0 Std",
    vendor: "kuaishou",
    description: "Kuaishou — стандартная версия Kling, дешевле Pro. Звук, i2v. Без русской озвучки.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "none",
    durations: [5, 10],
    resolutions: ["720p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    // разрешение не влияет; звук +50%
    price: {
      perSecond: { "720p": 0.084 },
      perSecondAudio: { "720p": 0.126 },
    },
  },
  {
    id: "minimax/hailuo-3",
    name: "Hailuo 3",
    vendor: "minimax",
    description: "MiniMax — новое поколение Hailuo: точное следование промпту, редактирование по инструкции и рендер текста, до 2K со звуком. Русская озвучка не подтверждена — лучше проверить.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "partial",
    durations: [5, 10],
    resolutions: ["2K"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    // duration_seconds $0.13 (плоско, единственное разрешение 2K); отдельная
    // SKU reference_images $0.04 — доплата за i2v-кадр, в оценку за секунду не входит
    price: { perSecond: { "2K": 0.13 } },
    isNew: true,
  },
  {
    id: "minimax/hailuo-3-max",
    name: "Hailuo 3 Max",
    vendor: "minimax",
    description: "MiniMax — ускоренная версия Hailuo 3 (совместно с fal.ai): из текста, стартового и конечного кадра, до 768p, клипы до 15 сек. Без звука — озвучку добавляйте отдельно.",
    modes: ["t2v", "i2v"],
    supportsAudio: false,
    russianSpeech: "none",
    durations: [5, 10, 15],
    resolutions: ["480p", "768p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    // duration_seconds_480p $0.05, duration_seconds_768p $0.08
    price: { perSecond: { "480p": 0.05, "768p": 0.08 } },
    isNew: true,
  },
  {
    id: "runway/gen-4.5",
    name: "Gen-4.5",
    vendor: "runway",
    description: "Runway — кинематографичная генерация из текста или стартового кадра: сильное движение, детализация и следование промпту, 720p. Без звука.",
    modes: ["t2v", "i2v"],
    supportsAudio: false,
    russianSpeech: "none",
    durations: [5, 10],
    resolutions: ["720p"],
    aspectRatios: ["16:9", "9:16"],
    // cents_per_second_output 12 → $0.12/сек
    price: { perSecond: { "720p": 0.12 } },
    isNew: true,
  },
  {
    id: "black-forest-labs/flux-3-video",
    name: "FLUX.3 Video",
    vendor: "bfl",
    description: "Black Forest Labs — первая видеомодель FLUX: генерация из текста или по опорным кадрам (первый/последний) и продолжение клипа, до 1080p и 20 сек, со звуком. Русская озвучка не подтверждена — лучше проверить.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "partial",
    durations: [5, 10, 15, 20],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    // cents_per_second_output 720p 17 → $0.17, 1080p 29 → $0.29 (продолжение клипа
    // дороже — отдельные SKU, в оценку за секунду не входит)
    price: { perSecond: { "720p": 0.17, "1080p": 0.29 } },
    isNew: true,
  },
  {
    id: "minimax/hailuo-2.3",
    name: "Hailuo 2.3",
    vendor: "minimax",
    description: "MiniMax — выразительное движение и эмоции, 1080p. Без звука (озвучку добавляйте отдельно).",
    modes: ["t2v", "i2v"],
    supportsAudio: false,
    russianSpeech: "none",
    durations: [6, 10],
    resolutions: ["1080p"],
    aspectRatios: ["16:9"],
    price: { perSecond: { "1080p": 0.0817 } },
  },
  {
    id: "alibaba/wan-3.0",
    name: "Wan 3.0",
    vendor: "alibaba",
    description: "Alibaba — новейшее поколение Wan: длинные клипы до 30 сек, разрешения от 480p до 1080p, со звуком и i2v по первому кадру. Русская озвучка не гарантирована. Wan 3.0 Prime — быстрый режим той же модели (дороже).",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "partial",
    durations: [5, 10, 15, 20, 30],
    resolutions: ["480p", "720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    // тариф по разрешению (duration_seconds_Xp), звук включён в цену
    price: { perSecond: { "480p": 0.05, "720p": 0.1, "1080p": 0.2 } },
    isNew: true,
  },
  {
    id: "alibaba/wan-3.0-prime",
    name: "Wan 3.0 Prime",
    vendor: "alibaba",
    description: "Alibaba — быстрый режим Wan 3.0: из текста или стартового кадра, клипы до 30 сек, от 480p до 1080p, со звуком. Дороже обычного Wan 3.0. Русская озвучка не гарантирована.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "partial",
    durations: [5, 10, 15, 20, 30],
    resolutions: ["480p", "720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    // тариф по разрешению (duration_seconds_Xp), звук включён в цену
    price: { perSecond: { "480p": 0.068, "720p": 0.14, "1080p": 0.28 } },
    isNew: true,
  },
  {
    id: "alibaba/wan-2.6",
    name: "Wan 2.6",
    vendor: "alibaba",
    description: "Alibaba — прошлое поколение Wan: теперь со звуком и i2v, до 1080p. Русская озвучка не гарантирована. Wan 3.0 — новейшее поколение с длинными клипами.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "partial",
    durations: [5, 10],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16"],
    // тариф по разрешению (ставки t2v; i2v чуть дороже), звук включён
    price: { perSecond: { "720p": 0.08, "1080p": 0.12 } },
  },
  {
    id: "alibaba/wan-2.7",
    name: "Wan 2.7",
    vendor: "alibaba",
    description: "Alibaba — поколение Wan 2.x: больше длительностей и форматов, со звуком и i2v. Русский — не гарантирован. Wan 3.0 — новее и с длинными клипами.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "partial",
    durations: [5, 10],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    // плоская за секунду, разрешение не влияет
    price: { perSecond: { "720p": 0.1, "1080p": 0.1 } },
    isNew: true,
  },
  {
    id: "alibaba/happyhorse-1.0",
    name: "HappyHorse 1.0",
    vendor: "alibaba",
    description: "Alibaba — предыдущее поколение HappyHorse: генерация из текста, стартового кадра или набора референсов, до 1080p. На OpenRouter без звука; i2v по первому кадру. HappyHorse 1.1 — новее и качественнее.",
    modes: ["t2v", "i2v"],
    supportsAudio: false,
    russianSpeech: "none",
    durations: [4, 8, 12],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"],
    price: { perSecond: { "720p": 0.0988, "1080p": 0.1694 } },
  },

  // ===== Быстрые и дешёвые =====
  {
    id: "bytedance/seedance-2.0-fast",
    name: "Seedance 2.0 Fast",
    vendor: "bytedance",
    description: "ByteDance — быстрая и недорогая версия Seedance 2.0. Хорошая динамика и звук, до 720p. Без русской озвучки.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "none",
    durations: [4, 8, 12],
    resolutions: ["480p", "720p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"],
    // video_tokens подешевел $0.0000056 → $0.0000042 (аудит W34, −25%)
    price: { perSecond: { "480p": 0.0404, "720p": 0.0907 } },
    isNew: true,
  },
  {
    id: "bytedance/seedance-2.0-mini",
    name: "Seedance 2.0 Mini",
    vendor: "bytedance",
    description: "ByteDance — самая дешёвая версия Seedance 2.0: из текста, стартового и конечного кадра, до 720p, со звуком. Без русской озвучки.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "none",
    durations: [4, 8, 12],
    resolutions: ["480p", "720p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"],
    // video_tokens $0.0000035 (звук не влияет): 854×480×0.0234375×цена и 1280×720×0.0234375×цена
    price: { perSecond: { "480p": 0.0336, "720p": 0.0756 } },
    isNew: true,
  },
  {
    id: "bytedance/seedance-2.5",
    name: "Seedance 2.5",
    vendor: "bytedance",
    description: "ByteDance — новое поколение Seedance для длинных историй: клипы до 30 сек, стартовый и конечный кадр, до 720p, со звуком. Дороже Seedance 2.0 при том же разрешении. Без русской озвучки.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "none",
    durations: [4, 8, 12, 16, 20, 30],
    resolutions: ["480p", "720p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    // video_tokens $0.0000107 (звук не влияет): 854×480×0.0234375×цена и 1280×720×0.0234375×цена
    price: { perSecond: { "480p": 0.1028, "720p": 0.2311 } },
    isNew: true,
  },
  {
    id: "bytedance/seedance-1-5-pro",
    name: "Seedance 1.5 Pro",
    vendor: "bytedance",
    description: "ByteDance — прошлое поколение Seedance: очень дёшево, со звуком и i2v, до 1080p. Без русской озвучки.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "none",
    durations: [4, 8, 12],
    resolutions: ["480p", "720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"],
    // video_tokens $0.0000012 без звука / $0.0000024 со звуком
    price: {
      perSecond: { "480p": 0.0115, "720p": 0.0259, "1080p": 0.0583 },
      perSecondAudio: { "480p": 0.0231, "720p": 0.0518, "1080p": 0.1166 },
    },
  },
  {
    id: "x-ai/grok-imagine-video-1.5",
    name: "Grok Imagine Video 1.5",
    vendor: "xai",
    description: "xAI — новое поколение Grok Imagine: лучше движение и физика, до 1080p. Из текста или из стартового кадра. На OpenRouter без звука.",
    modes: ["t2v", "i2v"],
    supportsAudio: false,
    russianSpeech: "none",
    durations: [5, 10],
    resolutions: ["480p", "720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"],
    price: { perSecond: { "480p": 0.08, "720p": 0.14, "1080p": 0.25 } },
    isNew: true,
  },
  {
    id: "x-ai/grok-imagine-video-1.5-lite",
    name: "Grok Imagine Video 1.5 Lite",
    vendor: "xai",
    description: "xAI — облегчённая и быстрая версия Grok Imagine 1.5 (дистиллят): из текста или из стартового кадра, до 1080p, заметно дешевле. На OpenRouter без звука. Цена 1080p резко выше 720p.",
    modes: ["t2v", "i2v"],
    supportsAudio: false,
    russianSpeech: "none",
    durations: [5, 10, 15],
    resolutions: ["480p", "720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"],
    // cents_per_video_output_second_*: 480p 2, 720p 3, 1080p 14; cents_per_image_input 1 —
    // плоская доплата за стартовый кадр, в оценку за секунду не входит
    price: { perSecond: { "480p": 0.02, "720p": 0.03, "1080p": 0.14 } },
    isNew: true,
  },
  {
    id: "x-ai/grok-imagine-video",
    name: "Grok Imagine Video",
    vendor: "xai",
    description: "xAI — быстрая и дешёвая генерация коротких клипов, с поддержкой i2v. Без русской озвучки.",
    modes: ["t2v", "i2v"],
    supportsAudio: false,
    russianSpeech: "none",
    durations: [5, 10],
    resolutions: ["480p", "720p"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"],
    price: { perSecond: { "480p": 0.05, "720p": 0.07 } },
  },
  {
    id: "heygen/heygen-video-1",
    name: "HeyGen Video",
    vendor: "heygen",
    description: "HeyGen — универсальная видеомодель: из текста или стартового кадра, клипы 5-15 сек, до 2K. Звук (диалоги, фон, эффекты) генерируется всегда и не отключается. Русская озвучка не подтверждена — лучше проверить.",
    modes: ["t2v", "i2v"],
    supportsAudio: false,
    builtInAudio: true,
    russianSpeech: "partial",
    durations: [5, 10, 15],
    resolutions: ["480p", "768p", "2K"],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    // duration_seconds_480p $0.02, _768p $0.03, _2k $0.09; reference_duration_seconds_*
    // (с референсами) вдвое дороже — в оценку за секунду не входит
    price: { perSecond: { "480p": 0.02, "768p": 0.03, "2K": 0.09 } },
    isNew: true,
  },
]

/**
 * Снимок сырых `pricing_skus` OpenRouter, из которых выведены цены `price` выше
 * (июль 2026). Используется ТОЛЬКО аудитом дрейфа (registry-audit): если живые SKU
 * разойдутся с этим снимком — провайдер поменял цены и `price` пора пересчитать.
 * ❗ При обновлении цен обновляйте и этот снимок (иначе аудит будет ложно молчать).
 */
export const VIDEO_PRICING_SKUS: Record<string, Record<string, number>> = {
  "bytedance/seedance-2.0": {
    video_tokens: 0.000007, video_tokens_4k: 0.000004, video_tokens_1080p: 0.0000077,
    video_tokens_without_audio: 0.000007, video_tokens_with_video_input: 0.0000043,
    video_tokens_4k_with_video_input: 0.0000024, video_tokens_1080p_with_video_input: 0.0000047,
  },
  "alibaba/happyhorse-1.1": { duration_seconds_720p: 0.0988, duration_seconds_1080p: 0.1278 },
  "alibaba/happyhorse-1.0": { duration_seconds_720p: 0.0988, duration_seconds_1080p: 0.1694 },
  "google/veo-3.1": {
    duration_seconds_with_audio: 0.4, duration_seconds_with_audio_4k: 0.6,
    duration_seconds_without_audio: 0.2, duration_seconds_without_audio_4k: 0.4,
  },
  "kwaivgi/kling-v3.0-pro": {
    duration_seconds: 0.112, duration_seconds_with_audio: 0.168,
    text_to_video_duration_seconds_480p: 0.112, text_to_video_duration_seconds_720p: 0.112,
    image_to_video_duration_seconds_720p: 0.112, text_to_video_duration_seconds_1080p: 0.112,
    image_to_video_duration_seconds_1080p: 0.112,
  },
  "kwaivgi/kling-video-o1": { duration_seconds: 0.112 },
  "google/veo-3.1-fast": {
    duration_seconds_with_audio: 0.12, duration_seconds_with_audio_4k: 0.3, duration_seconds_with_audio_720p: 0.1,
    duration_seconds_without_audio: 0.1, duration_seconds_without_audio_4k: 0.25, duration_seconds_without_audio_720p: 0.08,
  },
  "google/veo-3.1-lite": {
    duration_seconds_with_audio: 0.08, duration_seconds_without_audio: 0.05,
    duration_seconds_with_audio_720p: 0.05, duration_seconds_without_audio_720p: 0.03,
  },
  "kwaivgi/kling-v3.0-std": {
    duration_seconds: 0.084, duration_seconds_with_audio: 0.126,
    text_to_video_duration_seconds_480p: 0.084, text_to_video_duration_seconds_720p: 0.084,
    image_to_video_duration_seconds_720p: 0.084, text_to_video_duration_seconds_1080p: 0.084,
    image_to_video_duration_seconds_1080p: 0.084,
  },
  "minimax/hailuo-3": { duration_seconds: 0.13, reference_images: 0.04 },
  "minimax/hailuo-2.3": { duration_seconds: 0.0817 },
  "runway/gen-4.5": { cents_per_second_output: 12 },
  "black-forest-labs/flux-3-video": {
    cents_per_second_output: 17,
    cents_per_second_output_720p: 17, cents_per_second_output_1080p: 29,
    cents_per_second_video_continuation_720p: 41, cents_per_second_video_continuation_1080p: 53,
  },
  "alibaba/wan-2.6": {
    text_to_video_duration_seconds_480p: 0.04, text_to_video_duration_seconds_720p: 0.08,
    image_to_video_duration_seconds_720p: 0.1, text_to_video_duration_seconds_1080p: 0.12,
    image_to_video_duration_seconds_1080p: 0.15,
  },
  "alibaba/wan-2.7": { duration_seconds: 0.1 },
  "alibaba/wan-3.0": { duration_seconds_480p: 0.05, duration_seconds_720p: 0.1, duration_seconds_1080p: 0.2 },
  "bytedance/seedance-2.0-fast": { video_tokens: 0.0000042, video_tokens_without_audio: 0.0000042, video_tokens_with_video_input: 0.000002475 },
  "bytedance/seedance-1-5-pro": { video_tokens: 0.0000024, video_tokens_without_audio: 0.0000012 },
  "x-ai/grok-imagine-video": {
    cents_per_image_input: 0.2, cents_per_video_output_second_480p: 5, cents_per_video_output_second_720p: 7,
  },
  "x-ai/grok-imagine-video-1.5": {
    cents_per_image_input: 1, cents_per_video_output_second_480p: 8,
    cents_per_video_output_second_720p: 14, cents_per_video_output_second_1080p: 25,
  },
  "x-ai/grok-imagine-video-1.5-lite": {
    cents_per_image_input: 1, cents_per_video_output_second_480p: 2,
    cents_per_video_output_second_720p: 3, cents_per_video_output_second_1080p: 14,
  },
  "minimax/hailuo-3-max": { duration_seconds: 0.08, duration_seconds_480p: 0.05, duration_seconds_768p: 0.08 },
  "alibaba/wan-3.0-prime": { duration_seconds_480p: 0.068, duration_seconds_720p: 0.14, duration_seconds_1080p: 0.28 },
  "bytedance/seedance-2.0-mini": { video_tokens: 0.0000035, video_tokens_without_audio: 0.0000035, video_tokens_with_video_input: 0.0000021 },
  "bytedance/seedance-2.5": { video_tokens: 0.0000107, video_tokens_without_audio: 0.0000107, video_tokens_with_video_input: 0.0000064 },
  "heygen/heygen-video-1": {
    duration_seconds_480p: 0.02, duration_seconds_768p: 0.03, duration_seconds_2k: 0.09,
    reference_duration_seconds_480p: 0.04, reference_duration_seconds_768p: 0.06, reference_duration_seconds_2k: 0.18,
  },
}

/** Цветовая маркировка вендоров для UI */
export const VIDEO_VENDOR_COLORS: Record<VideoVendor, { dot: string; text: string; label: string }> = {
  google:    { dot: "bg-blue-400", text: "text-blue-300", label: "Google" },
  openai:    { dot: "bg-emerald-400", text: "text-emerald-300", label: "OpenAI" },
  xai:       { dot: "bg-violet-400", text: "text-violet-300", label: "xAI" },
  bytedance: { dot: "bg-rose-400", text: "text-rose-300", label: "ByteDance" },
  kuaishou:  { dot: "bg-orange-400", text: "text-orange-300", label: "Kuaishou" },
  minimax:   { dot: "bg-cyan-400", text: "text-cyan-300", label: "MiniMax" },
  alibaba:   { dot: "bg-amber-400", text: "text-amber-300", label: "Alibaba" },
  runway:    { dot: "bg-fuchsia-400", text: "text-fuchsia-300", label: "Runway" },
  bfl:       { dot: "bg-lime-400", text: "text-lime-300", label: "Black Forest Labs" },
  heygen:    { dot: "bg-pink-400", text: "text-pink-300", label: "HeyGen" },
}

/** Подписи/цвета для индикатора русской озвучки */
export const RUSSIAN_SPEECH_INFO: Record<RussianSpeech, { label: string; short: string; dot: string; text: string }> = {
  good:    { label: "Озвучивает на русском", short: "RU озвучка", dot: "bg-emerald-400", text: "text-emerald-300" },
  partial: { label: "Русская озвучка частично — лучше проверить", short: "RU частично", dot: "bg-amber-400", text: "text-amber-300" },
  none:    { label: "Озвучивает не на русском (англ/кит)", short: "не RU", dot: "bg-neutral-500", text: "text-neutral-500" },
}

/** Модель по умолчанию — топ качества при адекватной цене */
export const DEFAULT_VIDEO_MODEL = "bytedance/seedance-2.0"

export function getVideoModel(id: string): VideoModel | null {
  return VIDEO_MODELS.find((m) => m.id === id) || null
}

/** Поддерживает ли модель image-to-video (референс-кадр) */
export function supportsImageToVideo(id: string): boolean {
  return getVideoModel(id)?.modes.includes("i2v") ?? false
}

/**
 * Дефолтные значения параметров для модели.
 * Звук включён по умолчанию для всех моделей, которые его умеют: разница в цене
 * минимальна, а забыть включить и получить немое видео — обидно. Для моделей без
 * звука остаётся `false`.
 */
export function defaultVideoParams(model: VideoModel): {
  duration: number
  resolution: string
  aspect_ratio: string
  generate_audio: boolean
} {
  return {
    duration: model.durations[0],
    resolution: model.resolutions.includes("720p") ? "720p" : model.resolutions[0],
    aspect_ratio: model.aspectRatios.includes("16:9") ? "16:9" : model.aspectRatios[0],
    generate_audio: model.supportsAudio,
  }
}

/**
 * Эффективная цена за секунду для выбранного разрешения и режима звука.
 * Если разрешение не задано/не найдено — берём максимум из таблицы (консервативно,
 * чтобы не занизить). Для «от $X/сек» в списке моделей есть videoPriceFrom.
 */
export function videoPricePerSecond(
  model: VideoModel,
  resolution?: string,
  audio = false
): number {
  const table =
    audio && model.price.perSecondAudio ? model.price.perSecondAudio : model.price.perSecond
  if (resolution && table[resolution] != null) return table[resolution]
  const values = Object.values(table)
  return values.length ? Math.max(...values) : 0
}

/** Минимальная цена за секунду среди разрешений — для «от $X/сек» в списке моделей */
export function videoPriceFrom(model: VideoModel): number {
  const values = Object.values(model.price.perSecond)
  return values.length ? Math.min(...values) : 0
}

/**
 * Оценка стоимости клипа (USD) с учётом разрешения и звука.
 * Точная сумма всё равно берётся из `usage.cost` OpenRouter после генерации —
 * это оценка ДО запуска и пред-проверка лимитов.
 */
export function estimateVideoCost(
  model: VideoModel,
  opts: { durationSeconds: number; resolution?: string; audio?: boolean }
): number {
  return videoPricePerSecond(model, opts.resolution, opts.audio) * opts.durationSeconds
}
