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
  /** Короткая характеристика тембра для подсказки в UI */
  hint?: string
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
  /** Голоса по умолчанию для быстрого выбора «женский / мужской» */
  defaultFemale: string
  defaultMale: string
}

export const VOICE_CHANGE_ENGINES: VoiceChangeEngine[] = [
  {
    id: "elevenlabs",
    endpoint: "fal-ai/elevenlabs/voice-changer",
    name: "ElevenLabs",
    description: "Лучшая естественность и сохранение интонации. Голоса из готового набора. Цена выше.",
    pricePerMinute: 0.3,
    supportsSample: false,
    // Полный набор голосов, который принимает fal (поле `voice`, см. llms.txt модели)
    defaultFemale: "Jessica",
    defaultMale: "Brian",
    presets: [
      { id: "Jessica", label: "Jessica", gender: "female", hint: "молодая, живая, игривая" },
      { id: "Sarah", label: "Sarah", gender: "female", hint: "мягкая, деловая" },
      { id: "Rachel", label: "Rachel", gender: "female", hint: "спокойная, ровная" },
      { id: "Aria", label: "Aria", gender: "female", hint: "выразительная, с хрипотцой" },
      { id: "Laura", label: "Laura", gender: "female", hint: "бодрая, задорная" },
      { id: "Charlotte", label: "Charlotte", gender: "female", hint: "низкая, обволакивающая" },
      { id: "Alice", label: "Alice", gender: "female", hint: "уверенная, британская" },
      { id: "Matilda", label: "Matilda", gender: "female", hint: "тёплая, дружелюбная" },
      { id: "Lily", label: "Lily", gender: "female", hint: "бархатная, британская" },
      { id: "River", label: "River", gender: "female", hint: "андрогинная, расслабленная" },
      { id: "Brian", label: "Brian", gender: "male", hint: "глубокий, дикторский" },
      { id: "George", label: "George", gender: "male", hint: "тёплый рассказчик" },
      { id: "Daniel", label: "Daniel", gender: "male", hint: "строгий, новостной" },
      { id: "Eric", label: "Eric", gender: "male", hint: "мягкий, обаятельный" },
      { id: "Chris", label: "Chris", gender: "male", hint: "простой, разговорный" },
      { id: "Liam", label: "Liam", gender: "male", hint: "молодой, чёткий" },
      { id: "Will", label: "Will", gender: "male", hint: "молодой, дружелюбный" },
      { id: "Roger", label: "Roger", gender: "male", hint: "уверенный, лёгкий" },
      { id: "Charlie", label: "Charlie", gender: "male", hint: "непринуждённый" },
      { id: "Callum", label: "Callum", gender: "male", hint: "с хрипотцой, напряжённый" },
      { id: "Bill", label: "Bill", gender: "male", hint: "возрастной, надёжный" },
    ],
  },
  {
    id: "chatterbox",
    endpoint: "resemble-ai/chatterboxhd/speech-to-speech",
    name: "Chatterbox HD",
    description: "Очень дёшево. Можно взять голос из своего образца (файл с голосом 10-30 сек).",
    pricePerMinute: 0.02,
    supportsSample: true,
    defaultFemale: "Aurora",
    defaultMale: "Richard",
    presets: [
      { id: "Aurora", label: "Aurora", gender: "female" },
      { id: "Vicky", label: "Vicky", gender: "female" },
      { id: "Richard", label: "Richard", gender: "male" },
      { id: "Carl", label: "Carl", gender: "male" },
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

/** Подпись пресета с полом: «Jessica (женский)» */
export function voicePresetTitle(preset: VoicePreset): string {
  return `${preset.label} (${preset.gender === "female" ? "женский" : "мужской"})`
}

/** Движок автоматической переозвучки после видео → видео */
export const AUTO_VOICE_ENGINE: VoiceChangeEngineId = "elevenlabs"

/** Настройка автопереозвучки, которая сохраняется в params v2v-генерации */
export interface VoiceOverSetting {
  engine: VoiceChangeEngineId
  voice: string
}

/**
 * Санитизация запроса автопереозвучки из тела `/api/video/generate`.
 * null — переозвучка не нужна (оставляем исходный звук); неизвестный голос
 * заменяется женским голосом по умолчанию.
 */
export function parseVoiceOver(raw: unknown): VoiceOverSetting | null {
  if (!raw || typeof raw !== "object") return null
  const voice = (raw as { voice?: unknown }).voice
  const engine = getVoiceEngine(AUTO_VOICE_ENGINE)!
  const valid = typeof voice === "string" && engine.presets.some((p) => p.id === voice)
  return { engine: engine.id, voice: valid ? voice : engine.defaultFemale }
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
