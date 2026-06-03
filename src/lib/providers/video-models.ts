/**
 * Реестр видеомоделей для вкладки «Видео».
 * Все вызываются через единый OpenRouter endpoint (POST /api/v1/videos),
 * поэтому достаточно одного API-ключа OpenRouter (того же, что у картинок/чата).
 *
 * Цены — ориентир за секунду (USD). Точная сумма берётся из ответа OpenRouter
 * (`usage.cost`) после генерации; здесь — для оценки в UI ДО запуска.
 *
 * Источник capabilities (длительности/разрешения/i2v/звук): openrouter.ai
 * `GET /api/v1/videos/models` — проверено июнь 2026.
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

/**
 * Поддержка русской речи в озвучке:
 * - good — уверенно озвучивает на русском (Veo)
 * - partial — иногда/частично, лучше проверить
 * - none — озвучивает не на русском (англ/кит) или вообще без звука
 */
export type RussianSpeech = "good" | "partial" | "none"

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
  /** Умеет ли озвучивать на русском (для звуковых моделей) */
  russianSpeech: RussianSpeech
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
    russianSpeech: "none",
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
    description: "Google — кинематографичное видео с нативным синхронным звуком, до 4K. Лучшее для русской озвучки.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "good",
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
    description: "Kuaishou — топовая модель, плавное движение и звук. Озвучка только англ/кит/яп/кор/исп.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "none",
    durations: [5, 10],
    resolutions: ["720p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    pricePerSecond: 0.112,
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
    pricePerSecond: 0.112,
    isNew: true,
  },
  {
    id: "openai/sora-2-pro",
    name: "Sora 2 Pro",
    vendor: "openai",
    description: "OpenAI — премиум со звуком, длинные клипы. Русский — частично (мультиязычная озвучка).",
    modes: ["t2v"],
    supportsAudio: true,
    russianSpeech: "partial",
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
    description: "Google — качество Veo дешевле и быстрее, со звуком. Хорошо озвучивает на русском.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "good",
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p", "4K"],
    aspectRatios: ["16:9", "9:16"],
    pricePerSecond: 0.15,
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
    pricePerSecond: 0.05,
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
    pricePerSecond: 0.084,
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
    pricePerSecond: 0.082,
  },
  {
    id: "alibaba/wan-2.6",
    name: "Wan 2.6",
    vendor: "alibaba",
    description: "Alibaba — недорогая модель со звуком. Русский — не гарантирован.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "partial",
    durations: [5, 10],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16"],
    pricePerSecond: 0.1,
  },
  {
    id: "alibaba/wan-2.7",
    name: "Wan 2.7",
    vendor: "alibaba",
    description: "Alibaba — новое поколение Wan: больше длительностей и форматов, со звуком и i2v. Русский — не гарантирован.",
    modes: ["t2v", "i2v"],
    supportsAudio: true,
    russianSpeech: "partial",
    durations: [5, 10],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    pricePerSecond: 0.1,
    isNew: true,
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
    aspectRatios: ["16:9", "9:16", "1:1"],
    pricePerSecond: 0.05,
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
    aspectRatios: ["16:9", "9:16", "1:1"],
    pricePerSecond: 0.02,
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

/** Оценка стоимости клипа (USD) — pricePerSecond × duration */
export function estimateVideoCost(model: VideoModel, durationSeconds: number): number {
  return model.pricePerSecond * durationSeconds
}
