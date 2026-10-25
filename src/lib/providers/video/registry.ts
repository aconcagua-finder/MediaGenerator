import type { VideoProvider } from "./types"
import { openrouterVideoProvider } from "./openrouter-video"
import { falVideoProvider } from "./fal-video"
import { elevenlabsVideoProvider } from "./elevenlabs-video"

/**
 * Реестр видео-провайдеров. OpenRouter — основной (единый ключ + нормализованная
 * схема). fal.ai — Kling Motion Control и замена голоса Chatterbox HD; доступен
 * только при активном ключе `fal` (без него модели скрыты в UI, а submit
 * возвращает 400). ElevenLabs — замена голоса (запуск в `startVoiceChange`,
 * здесь только опрос/скачивание для `finalize.ts`).
 */
const videoProviders: Record<string, VideoProvider> = {
  openrouter: openrouterVideoProvider,
  fal: falVideoProvider,
  elevenlabs: elevenlabsVideoProvider,
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
