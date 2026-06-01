/**
 * Реестр видеомоделей для вкладки «Видео».
 * Все вызываются через единый OpenRouter endpoint (POST /api/v1/videos),
 * поэтому достаточно одного API-ключа OpenRouter (того же, что у картинок/чата).
 *
 * Цены — ориентир за секунду (USD). Точная сумма берётся из ответа OpenRouter
 * (`usage.cost`) после генерации; здесь — для оценки в UI ДО запуска.
 *
 * Источник capabilities (длительности/разрешения/i2v/звук): openrouter.ai
 * `GET /api/v1/videos/models` — проверено май-июнь 2026.
 */

export type VideoVendor =
  | "google"
  | "openai"
  | "xai"
  | "bytedance"
  | "kuaishou"
  | "minimax"
  | "alibaba"

export type VideoMode = "t2v" | "i2v"

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
  /** Допустимые длительности клипа в секундах */
  durations: number[]
  /** Допустимые разрешения (значение поля `resolution`) */
  resolutions: string[]
  /** Допустимые соотношения сторон */
  aspectRatios: string[]
  /** Ориентировочная цена за секунду в USD (для оценки в UI) */
  pricePerSecond: number
  /** Пометка «новинка» */
  isNew?: boolean
}

export const VIDEO_MODELS: VideoModel[] = [
  // ===== Топ-качество =====
  {
    id: "bytedance/seedance-2.0",
    name: "Seedance 2.0",
    vendor: "bytedance",
    description: "ByteDance — топ качества (лидер арены). Динамика, детали, звук. Отличный баланс цены и качества.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    durations: [4, 8, 12],
    resolutions: ["480p", "720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    pricePerSecond: 0.07,
    isNew: true,
  },
  {
    id: "google/veo-3.1",
    name: "Veo 3.1",
    vendor: "google",
    description: "Google — кинематографичное видео с нативным синхронным звуком, до 4K. Премиум-качество.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p", "4K"],
    aspectRatios: ["16:9", "9:16"],
    pricePerSecond: 0.4,
    isNew: true,
  },
  {
    id: "kwaivgi/kling-v3.0-pro",
    name: "Kling 3.0 Pro",
    vendor: "kuaishou",
    description: "Kuaishou — топовая модель, плавное движение и звук. Хороша для людей и сложных сцен.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    durations: [5, 10],
    resolutions: ["720p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    pricePerSecond: 0.112,
    isNew: true,
  },
  {
    id: "openai/sora-2-pro",
    name: "Sora 2 Pro",
    vendor: "openai",
    description: "OpenAI — премиум-генерация со звуком, длинные клипы. Дорого, но очень качественно.",
    modes: ["t2v"],
    supportsAudio: true,
    durations: [4, 8, 12],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16"],
    pricePerSecond: 0.4,
  },

  // ===== Баланс цены и качества =====
  {
    id: "google/veo-3.1-fast",
    name: "Veo 3.1 Fast",
    vendor: "google",
    description: "Google — качество Veo дешевле и быстрее, со звуком. Хороший выбор по умолчанию для Veo.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p", "4K"],
    aspectRatios: ["16:9", "9:16"],
    pricePerSecond: 0.15,
  },
  {
    id: "kwaivgi/kling-v3.0-std",
    name: "Kling 3.0 Std",
    vendor: "kuaishou",
    description: "Kuaishou — стандартная версия Kling, дешевле Pro. Звук, i2v.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    durations: [5, 10],
    resolutions: ["720p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    pricePerSecond: 0.084,
  },
  {
    id: "minimax/hailuo-2.3",
    name: "Hailuo 2.3",
    vendor: "minimax",
    description: "MiniMax — выразительное движение и эмоции, 1080p. Без звука.",
    modes: ["t2v"],
    supportsAudio: false,
    durations: [6, 10],
    resolutions: ["1080p"],
    aspectRatios: ["16:9"],
    pricePerSecond: 0.082,
  },
  {
    id: "alibaba/wan-2.6",
    name: "Wan 2.6",
    vendor: "alibaba",
    description: "Alibaba — недорогая модель со звуком. Хороша для простых сцен и массовой генерации.",
    modes: ["t2v"],
    supportsAudio: true,
    durations: [5, 10],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16"],
    pricePerSecond: 0.1,
  },

  // ===== Быстрые и дешёвые =====
  {
    id: "x-ai/grok-imagine-video",
    name: "Grok Imagine Video",
    vendor: "xai",
    description: "xAI — быстрая и дешёвая генерация коротких клипов. Без звука.",
    modes: ["t2v"],
    supportsAudio: false,
    durations: [5, 10],
    resolutions: ["480p", "720p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    pricePerSecond: 0.06,
  },
]

/** Цветовая маркировка вендоров для UI */
export const VIDEO_VENDOR_COLORS: Record<VideoVendor, { dot: string; text: string; label: string }> = {
  google:    { dot: "bg-blue-400", text: "text-blue-300", label: "Google" },
  openai:    { dot: "bg-emerald-400", text: "text-emerald-300", label: "OpenAI" },
  xai:       { dot: "bg-violet-400", text: "text-violet-300", label: "xAI" },
  bytedance: { dot: "bg-rose-400", text: "text-rose-300", label: "ByteDance" },
  kuaishou:  { dot: "bg-orange-400", text: "text-orange-300", label: "Kuaishou" },
  minimax:   { dot: "bg-cyan-400", text: "text-cyan-300", label: "MiniMax" },
  alibaba:   { dot: "bg-amber-400", text: "text-amber-300", label: "Alibaba" },
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

/** Дефолтные значения параметров для модели (безопасные/дешёвые) */
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
    generate_audio: false,
  }
}

/** Оценка стоимости клипа (USD) — pricePerSecond × duration */
export function estimateVideoCost(model: VideoModel, durationSeconds: number): number {
  return model.pricePerSecond * durationSeconds
}
