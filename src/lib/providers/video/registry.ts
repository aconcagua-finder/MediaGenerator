import type { VideoProvider } from "./types"
import { openrouterVideoProvider } from "./openrouter-video"
import { falVideoProvider } from "./fal-video"

/**
 * Реестр видео-провайдеров. OpenRouter — основной (единый ключ + нормализованная
 * схема). fal.ai — Kling Motion Control и замена голоса; доступен только при
 * активном ключе `fal` (без него модели скрыты в UI, а submit возвращает 400).
 */
const videoProviders: Record<string, VideoProvider> = {
  openrouter: openrouterVideoProvider,
  fal: falVideoProvider,
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
