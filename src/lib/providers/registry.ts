import type { ImageProvider } from "./types"
import { openaiProvider } from "./openai"
import { xaiProvider } from "./xai"
import { openrouterProvider } from "./openrouter"

/**
 * Реестр провайдеров.
 * Единая точка доступа ко всем адаптерам.
 */
const providers: Record<string, ImageProvider> = {
  openai: openaiProvider,
  xai: xaiProvider,
  openrouter: openrouterProvider,
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
export const PROVIDER_INFO: Record<string, { name: string; description: string }> = {
  openai: {
    name: "OpenAI",
    description: "GPT Image — флагманские модели генерации",
  },
  xai: {
    name: "xAI (Grok)",
    description: "Grok Imagine — быстрая генерация изображений",
  },
  openrouter: {
    name: "OpenRouter",
    description: "Агрегатор — Gemini, FLUX, Seedream и другие",
  },
}
