import { getApiKeys } from "@/lib/actions/api-keys"
import { getSession } from "@/lib/auth-server"
import { hasActiveProviderKey } from "@/lib/provider-keys"
import { VoiceForm } from "@/components/voice/voice-form"

export default async function VoicePage() {
  const keys = await getApiKeys()
  const hasOpenRouterKey = keys.some((k) => k.provider === "openrouter" && k.isActive)
  const session = await getSession()
  // ElevenLabs: свой ключ или ключ админа (как у замены голоса)
  const hasElevenLabsKey = session?.user ? await hasActiveProviderKey(session.user.id, "elevenlabs") : false

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-xl font-bold text-white">Озвучка</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Синтез речи из текста (TTS). Лучший русский — ElevenLabs: родные русские голоса из библиотеки,
          аудиотеги для подачи. Остальные модели — через OpenRouter, тем же ключом; из них для русского
          подходят MAI-Voice-2, Gemini Flash TTS и Grok Voice. Готовое аудио попадает в Библиотеку.
        </p>
      </div>

      <VoiceForm hasOpenRouterKey={hasOpenRouterKey} hasElevenLabsKey={hasElevenLabsKey} />
    </div>
  )
}
