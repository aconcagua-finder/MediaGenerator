import { getApiKeys } from "@/lib/actions/api-keys"
import { VoiceForm } from "@/components/voice/voice-form"

export default async function VoicePage() {
  const keys = await getApiKeys()
  const hasOpenRouterKey = keys.some((k) => k.provider === "openrouter" && k.isActive)

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-xl font-bold text-white">Озвучка</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Синтез речи из текста (TTS). Все модели — через OpenRouter, тем же ключом.
          Для русского лучше всего подходят MAI-Voice-2, Gemini Flash TTS и Grok Voice.
          Готовое аудио попадает в Библиотеку.
        </p>
      </div>

      <VoiceForm hasOpenRouterKey={hasOpenRouterKey} />
    </div>
  )
}
