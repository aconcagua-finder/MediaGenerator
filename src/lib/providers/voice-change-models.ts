/**
 * Движки пост-шага «Заменить голос» на готовом видео (через fal.ai):
 * звук вынимается ffmpeg'ом, отправляется на конвертацию голоса, затем
 * подкладывается обратно в видео (`-c:v copy`) — видеодорожка не перекодируется.
 *
 * Цены и входы — по fal.ai/models/<id>/llms.txt. ❗ Живыми вызовами НЕ проверено
 * (нет ключа fal): особенно качество на русской речи и пол пресетов Chatterbox
 * (определён по имени голоса).
 */

export type VoiceChangeEngineId = "elevenlabs" | "chatterbox"

export interface VoicePreset {
  /** Значение, которое уходит в fal (имя голоса) */
  id: string
  /** Подпись для UI */
  label: string
  gender: "female" | "male"
}

export interface VoiceChangeEngine {
  id: VoiceChangeEngineId
  /** Endpoint fal (model id) */
  endpoint: string
  name: string
  description: string
  /** USD за минуту входного звука */
  pricePerMinute: number
  presets: VoicePreset[]
  /** Умеет ли брать голос по образцу пользователя (`target_voice_audio_url`) */
  supportsSample: boolean
}

export const VOICE_CHANGE_ENGINES: VoiceChangeEngine[] = [
  {
    id: "elevenlabs",
    endpoint: "fal-ai/elevenlabs/voice-changer",
    name: "ElevenLabs",
    description: "Лучшая естественность и сохранение интонации. Голоса из готового набора. Цена выше.",
    pricePerMinute: 0.3,
    supportsSample: false,
    presets: [
      { id: "Rachel", label: "Rachel (женский)", gender: "female" },
      { id: "Sarah", label: "Sarah (женский)", gender: "female" },
      { id: "Matilda", label: "Matilda (женский)", gender: "female" },
      { id: "Alice", label: "Alice (женский)", gender: "female" },
      { id: "Brian", label: "Brian (мужской)", gender: "male" },
      { id: "Daniel", label: "Daniel (мужской)", gender: "male" },
      { id: "George", label: "George (мужской)", gender: "male" },
      { id: "Eric", label: "Eric (мужской)", gender: "male" },
    ],
  },
  {
    id: "chatterbox",
    endpoint: "resemble-ai/chatterboxhd/speech-to-speech",
    name: "Chatterbox HD",
    description: "Очень дёшево. Можно взять голос из своего образца (файл с голосом 10-30 сек).",
    pricePerMinute: 0.02,
    supportsSample: true,
    presets: [
      { id: "Aurora", label: "Aurora (женский)", gender: "female" },
      { id: "Vicky", label: "Vicky (женский)", gender: "female" },
      { id: "Richard", label: "Richard (мужской)", gender: "male" },
      { id: "Carl", label: "Carl (мужской)", gender: "male" },
    ],
  },
]

export const DEFAULT_VOICE_ENGINE: VoiceChangeEngineId = "elevenlabs"

export function getVoiceEngine(id: string): VoiceChangeEngine | null {
  return VOICE_CHANGE_ENGINES.find((e) => e.id === id) ?? null
}

export function getVoiceEngineByEndpoint(endpoint: string): VoiceChangeEngine | null {
  return VOICE_CHANGE_ENGINES.find((e) => e.endpoint === endpoint) ?? null
}

/** Пресет по id; при невалидном — первый пресет движка */
export function resolveVoicePreset(engine: VoiceChangeEngine, presetId: string | undefined): VoicePreset {
  return engine.presets.find((p) => p.id === presetId) ?? engine.presets[0]
}

/** Оценка: цена за минуту × длительность звука (fal не отдаёт фактическую стоимость) */
export function estimateVoiceChangeCost(engine: VoiceChangeEngine, audioSeconds: number): number {
  if (!(audioSeconds > 0)) return 0
  return (audioSeconds / 60) * engine.pricePerMinute
}

/** Тело запроса к fal. Для Chatterbox образец голоса (URL) перекрывает пресет. */
export function buildVoiceChangeInput(opts: {
  engine: VoiceChangeEngine
  audioUrl: string
  presetId?: string
  sampleUrl?: string
}): Record<string, unknown> {
  const { engine, audioUrl } = opts
  assertHttps(audioUrl)
  if (engine.id === "elevenlabs") {
    return {
      audio_url: audioUrl,
      voice: resolveVoicePreset(engine, opts.presetId).id,
      remove_background_noise: false,
      output_format: "mp3_44100_128",
    }
  }
  // chatterbox
  const input: Record<string, unknown> = {
    source_audio_url: audioUrl,
    high_quality_audio: false,
  }
  if (opts.sampleUrl) {
    assertHttps(opts.sampleUrl)
    input.target_voice_audio_url = opts.sampleUrl
  } else {
    input.target_voice = resolveVoicePreset(engine, opts.presetId).id
  }
  return input
}

function assertHttps(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("Некорректная ссылка на аудиофайл")
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Ссылка на аудиофайл должна быть публичной HTTPS")
  }
}
