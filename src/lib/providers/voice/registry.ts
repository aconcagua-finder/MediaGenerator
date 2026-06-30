import type { VoiceProvider } from "./types"
import { openrouterVoiceProvider } from "./openrouter-voice"

/**
 * Реестр провайдеров озвучки. Сейчас все TTS-модели идут через OpenRouter,
 * но структура оставлена расширяемой (можно добавить ElevenLabs и т.п.).
 */
const providers: Record<string, VoiceProvider> = {
  openrouter: openrouterVoiceProvider,
}

export function getVoiceProvider(id: string): VoiceProvider {
  const provider = providers[id]
  if (!provider) {
    throw new Error(`Провайдер озвучки "${id}" не найден`)
  }
  return provider
}
