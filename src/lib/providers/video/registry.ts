import type { VideoProvider } from "./types"
import { openrouterVideoProvider } from "./openrouter-video"

/**
 * Реестр видео-провайдеров. Пока только OpenRouter (единый ключ + нормализованная
 * схема). Задел: при необходимости сюда добавится fal.ai/Replicate тем же интерфейсом.
 */
const videoProviders: Record<string, VideoProvider> = {
  openrouter: openrouterVideoProvider,
}

export function getVideoProvider(id: string): VideoProvider {
  const provider = videoProviders[id]
  if (!provider) {
    throw new Error(`Видео-провайдер "${id}" не найден`)
  }
  return provider
}

export function getVideoProviderIds(): string[] {
  return Object.keys(videoProviders)
}
