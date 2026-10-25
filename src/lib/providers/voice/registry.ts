import type { VoiceProvider } from "./types"
import { openrouterVoiceProvider } from "./openrouter-voice"
import { elevenlabsVoiceProvider } from "./elevenlabs-voice"

/**
 * Реестр провайдеров озвучки: OpenRouter (большинство моделей, общий ключ) и
 * ElevenLabs напрямую (ключ `elevenlabs`). Провайдер модели — `VoiceModel.provider`.
 */
const providers: Record<string, VoiceProvider> = {
  openrouter: openrouterVoiceProvider,
  elevenlabs: elevenlabsVoiceProvider,
}

export function getVoiceProvider(id: string): VoiceProvider {
  const provider = providers[id]
  if (!provider) {
    throw new Error(`Провайдер озвучки "${id}" не найден`)
  }
  return provider
}
