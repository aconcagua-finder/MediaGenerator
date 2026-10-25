import { downloadBuffer } from "@/lib/storage/s3"
import type { VideoJobContext, VideoProvider } from "./types"

/**
 * «Провайдер» задач замены голоса ElevenLabs для общего цикла `finalize.ts`.
 * ElevenLabs отвечает синхронно, поэтому `startVoiceChange` сам вызывает API и
 * кладёт готовый звук в S3 (`params.providerState.convertedKey`) ещё до того,
 * как задачу кто-то опросит. Здесь опрос лишь сообщает, что звук готов, а
 * fetchVideo отдаёт его из S3 — дальше подкладка под видео, стоимость,
 * автопереозвучка и реконсилятор работают как для fal.
 */

export function convertedAudioKey(ctx?: VideoJobContext): string | null {
  const state = (ctx?.params as { providerState?: { convertedKey?: unknown } } | null)?.providerState
  return typeof state?.convertedKey === "string" && state.convertedKey ? state.convertedKey : null
}

export const elevenlabsVideoProvider: VideoProvider = {
  id: "elevenlabs",
  // Результат уже лежит у нас в S3: ключ ElevenLabs для опроса не нужен
  pollsWithoutKey: true,

  async submit() {
    throw new Error("ElevenLabs: задачи замены голоса запускает startVoiceChange")
  },

  async poll(providerJobId, apiKey, ctx) {
    void providerJobId
    void apiKey
    const key = convertedAudioKey(ctx)
    return key
      ? { state: "completed", videoUrls: [key] }
      : { state: "failed", videoUrls: [], error: "ElevenLabs не вернул звук" }
  },

  async fetchVideo(providerJobId, apiKey, index, ctx) {
    void providerJobId
    void apiKey
    void index
    const key = convertedAudioKey(ctx)
    if (!key) throw new Error("ElevenLabs: нет готового звука")
    const { buffer, contentType } = await downloadBuffer(key)
    return { buffer, contentType: contentType || "audio/mpeg" }
  },
}
