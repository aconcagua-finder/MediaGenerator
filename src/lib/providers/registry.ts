import type { ImageProvider } from "./types"
import { openaiProvider } from "./openai"
import { xaiProvider } from "./xai"
import { openrouterProvider } from "./openrouter"
import { bflProvider } from "./bfl"
import { googleProvider } from "./google"

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
}

/** Модели, помеченные как "новинки" в селекторе */
export const NEW_IMAGE_MODELS = new Set([
  "openai:gpt-image-2",
  "openrouter:openai/gpt-5.4-image-2",
])
