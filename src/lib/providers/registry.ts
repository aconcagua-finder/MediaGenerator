import type { ImageProvider } from "./types"
import { openaiProvider } from "./openai"
import { xaiProvider } from "./xai"
import { openrouterProvider } from "./openrouter"
import { bflProvider } from "./bfl"
import { googleProvider } from "./google"
import { perplexityProvider } from "./perplexity"
import { recraftProvider } from "./recraft"
import { OPENROUTER_IMAGE_SPECS } from "./openrouter-image-models"

/**
 * Реестр провайдеров.
 * Единая точка доступа ко всем адаптерам.
 */
const providers: Record<string, ImageProvider> = {
  openai: openaiProvider,
  xai: xaiProvider,
  openrouter: openrouterProvider,
  bfl: bflProvider,
  google: googleProvider,
  perplexity: perplexityProvider,
  recraft: recraftProvider,
}

export function getProvider(id: string): ImageProvider {
  const provider = providers[id]
  if (!provider) {
    throw new Error(`Провайдер "${id}" не найден`)
  }
  return provider
}

export function getAllProviders(): ImageProvider[] {
  return Object.values(providers)
}

export function getProviderIds(): string[] {
  return Object.keys(providers)
}

/**
 * Метаинформация о провайдерах для UI
 */
export const PROVIDER_INFO: Record<string, { name: string; description: string; dot: string; text: string; label: string }> = {
  openai: {
    name: "OpenAI",
    description: "GPT Image — флагманские модели генерации",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    label: "OpenAI",
  },
  xai: {
    name: "xAI (Grok)",
    description: "Grok Imagine — быстрая генерация изображений",
    dot: "bg-violet-400",
    text: "text-violet-300",
    label: "xAI",
  },
  openrouter: {
    name: "OpenRouter",
    description: "Агрегатор — Gemini, FLUX, Seedream и другие",
    dot: "bg-rose-400",
    text: "text-rose-300",
    label: "OpenRouter",
  },
  bfl: {
    name: "Black Forest Labs",
    description: "FLUX напрямую — safety_tolerance, максимальный контроль",
    dot: "bg-amber-400",
    text: "text-amber-300",
    label: "BFL",
  },
  google: {
    name: "Google AI",
    description: "Gemini — прямой API, настройка safety filters",
    dot: "bg-blue-400",
    text: "text-blue-300",
    label: "Google",
  },
  perplexity: {
    name: "Perplexity",
    description: "Sonar Deep Research — поиск свежих веб-источников для рубрики «Публикации»",
    dot: "bg-cyan-400",
    text: "text-cyan-300",
    label: "Perplexity",
  },
  recraft: {
    name: "Recraft",
    description: "Векторная генерация (SVG) — логотипы, иконки, веб-графика. Нужен ключ recraft.ai",
    dot: "bg-pink-400",
    text: "text-pink-300",
    label: "Recraft",
  },
}

/** Модели, помеченные как "новинки" в селекторе */
export const NEW_IMAGE_MODELS = new Set([
  "openai:gpt-image-2",
  "openrouter:openai/gpt-5.4-image-2",
  "openrouter:google/gemini-3.1-flash-image",
  "openrouter:google/gemini-3.1-flash-lite-image",
  "recraft:recraft-v3-vector",
  ...OPENROUTER_IMAGE_SPECS.map((s) => `openrouter:${s.modelId}`),
])
