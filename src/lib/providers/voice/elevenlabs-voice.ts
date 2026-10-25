import { elevenLabsTextToSpeech } from "@/lib/providers/elevenlabs"
import { getVoiceModel, resolveVoice, sanitizeTtsSettings } from "@/lib/providers/voice-models"
import type { VoiceProvider, VoiceSynthRequest, VoiceSynthResult } from "./types"

/**
 * Озвучка ElevenLabs напрямую (`POST /v1/text-to-speech/{voice_id}`): ответ —
 * сразу mp3. Голос — voice_id из каталога, настройки зажимаются под модель
 * (неподдерживаемые поля не уходят в API). Стоимость в ответе не отдаётся —
 * биллинг по оценке из символов (`estimateVoiceCost`).
 */
export const elevenlabsVoiceProvider: VoiceProvider = {
  async synth(req: VoiceSynthRequest, apiKey: string): Promise<VoiceSynthResult> {
    const model = getVoiceModel(req.model)
    if (!model?.elevenlabs) throw new Error(`Модель «${req.model}» не из ElevenLabs`)
    const out = await elevenLabsTextToSpeech(apiKey, {
      voiceId: resolveVoice(model, req.voice),
      text: req.text,
      modelId: model.elevenlabs.modelId,
      settings: sanitizeTtsSettings(model, req.settings),
    })
    return { buffer: out.buffer, contentType: "audio/mpeg", outputFormat: "mp3", generationId: null }
  },

  async fetchCost(): Promise<number | null> {
    return null
  },
}
