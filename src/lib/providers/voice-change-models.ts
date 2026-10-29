/**
 * Движки пост-шага «Заменить голос» на готовом видео:
 * звук вынимается ffmpeg'ом, отправляется на конвертацию голоса, затем
 * подкладывается обратно в видео (`-c:v copy`) — видеодорожка не перекодируется.
 *
 * - ElevenLabs — напрямую через API ElevenLabs (`eleven_multilingual_sts_v2`,
 *   официально поддерживает русский). Голос — любой voice_id из библиотеки
 *   ElevenLabs (каталог: `GET /api/video/voice-change/voices`), `presets` здесь
 *   лишь подборка с именами для голосов по умолчанию. Биллинг пропорционален
 *   длине звука (22 сек = 216 кредитов, проверено 2026-10-25).
 * - Chatterbox HD — через fal.ai, готовые пресеты или образец голоса.
 *   ❗ fal списывает за каждую НАЧАТУЮ минуту (проверено 2026-10-23).
 *
 * Акцент результата берётся из исходной речи: меняется тембр, произношение нет.
 */

export type VoiceChangeEngineId = "elevenlabs" | "chatterbox"

/** Чей ключ нужен движку (провайдер в `api_keys` и `video_generations.provider`) */
export type VoiceEngineProvider = "fal" | "elevenlabs"

/**
 * Как провайдер считает минуты: `per_started_minute` — каждый запрос
 * округляется вверх до целой минуты (fal), `prorated` — по фактической длине.
 */
export type VoiceBillingMode = "per_started_minute" | "prorated"

export interface VoicePreset {
  /** Значение, которое уходит провайдеру (имя голоса fal или voice_id ElevenLabs) */
  id: string
  /** Подпись для UI */
  label: string
  gender: "female" | "male"
  /** Короткая характеристика тембра для подсказки в UI */
  hint?: string
  /** Есть записанное превью в `public/voice-previews` (см. voicePreviewUrl) */
  preview?: true
}

export interface VoiceChangeEngine {
  id: VoiceChangeEngineId
  provider: VoiceEngineProvider
  /** Модель провайдера (endpoint fal или model_id ElevenLabs), пишется в `video_generations.model` */
  endpoint: string
  /** Прежние значения `model` у старых задач этого движка (ElevenLabs раньше шёл через fal) */
  legacyEndpoints?: string[]
  name: string
  description: string
  /** USD за минуту входного звука */
  pricePerMinute: number
  billing: VoiceBillingMode
  presets: VoicePreset[]
  /** Голос — любой voice_id каталога провайдера, а не только `presets` */
  dynamicVoices: boolean
  /** Есть тонкие настройки голоса (VoiceSettings) */
  supportsSettings: boolean
  /** Умеет ли брать голос по образцу пользователя (`target_voice_audio_url`) */
  supportsSample: boolean
  /** Максимальная длина звука за один запрос, сек */
  maxAudioSeconds?: number
  /** Голоса по умолчанию для быстрого выбора «женский / мужской» */
  defaultFemale: string
  defaultMale: string
}

/** Модель ElevenLabs speech-to-speech с официальной поддержкой русского */
export const ELEVENLABS_STS_MODEL = "eleven_multilingual_sts_v2"

/**
 * Подборка русских голосов библиотеки ElevenLabs (проверены на русском, самые
 * используемые): голоса по умолчанию и имена для них. Общая для замены голоса
 * и озвучки; первые женский и мужской — по умолчанию (Marina, Nikolay).
 */
export const ELEVENLABS_CURATED_VOICES: VoicePreset[] = [
  { id: "ymDCYd8puC7gYjxIamPt", label: "Marina", gender: "female", hint: "мягкий, ясный, тёплый" },
  { id: "EDpEYNf6XIeKYRzYcx4I", label: "Mariia", gender: "female", hint: "размеренный, спокойный" },
  { id: "AB9XsbSA4eLG12t2myjN", label: "Larisa Actrisa", gender: "female", hint: "уверенный, чёткий" },
  { id: "7G0NvIkWRnU0Dqjgz13p", label: "Kate", gender: "female", hint: "спокойный, естественный" },
  { id: "Jbte7ht1CqapnZvc4KpK", label: "Kari", gender: "female", hint: "дружелюбный, тёплый" },
  { id: "3EuKHIEZbSzrHGNmdYsx", label: "Nikolay", gender: "male", hint: "уверенный, чёткий" },
  { id: "gJEfHTTiifXEDmO687lC", label: "Prince Nur", gender: "male", hint: "глубокий, насыщенный" },
  { id: "txnCCHHGKmYIwrn7HfHQ", label: "Alexandr Vlasov", gender: "male", hint: "живой, энергичный" },
  { id: "kwajW3Xh5svCeKU5ky2S", label: "Dmitry", gender: "male", hint: "чёткий, энергичный" },
  { id: "ogi2DyUAKJb7CEdqqvlU", label: "Stanislav", gender: "male", hint: "глубокий, тёплый" },
]

export const VOICE_CHANGE_ENGINES: VoiceChangeEngine[] = [
  {
    id: "elevenlabs",
    provider: "elevenlabs",
    endpoint: ELEVENLABS_STS_MODEL,
    legacyEndpoints: ["fal-ai/elevenlabs/voice-changer"],
    name: "ElevenLabs",
    description: "Лучшая естественность, родные русские голоса из библиотеки ElevenLabs, тонкие настройки.",
    pricePerMinute: 0.12,
    billing: "prorated",
    dynamicVoices: true,
    supportsSettings: true,
    supportsSample: false,
    maxAudioSeconds: 300,
    // Русские голоса библиотеки, проверенные на eleven_multilingual_sts_v2, самые используемые
    defaultFemale: "ymDCYd8puC7gYjxIamPt",
    defaultMale: "3EuKHIEZbSzrHGNmdYsx",
    presets: ELEVENLABS_CURATED_VOICES,
  },
  {
    id: "chatterbox",
    provider: "fal",
    endpoint: "resemble-ai/chatterboxhd/speech-to-speech",
    name: "Chatterbox HD",
    description: "Очень дёшево. Можно взять голос из своего образца (файл с голосом 10-30 сек).",
    pricePerMinute: 0.02,
    billing: "per_started_minute",
    dynamicVoices: false,
    supportsSettings: false,
    supportsSample: true,
    defaultFemale: "Aurora",
    defaultMale: "Richard",
    presets: [
      { id: "Aurora", label: "Aurora", gender: "female", preview: true },
      { id: "Vicky", label: "Vicky", gender: "female", preview: true },
      { id: "Richard", label: "Richard", gender: "male", preview: true },
      { id: "Carl", label: "Carl", gender: "male", preview: true },
    ],
  },
]

export const DEFAULT_VOICE_ENGINE: VoiceChangeEngineId = "elevenlabs"

export function getVoiceEngine(id: string): VoiceChangeEngine | null {
  return VOICE_CHANGE_ENGINES.find((e) => e.id === id) ?? null
}

export function getVoiceEngineByEndpoint(endpoint: string): VoiceChangeEngine | null {
  return (
    VOICE_CHANGE_ENGINES.find((e) => e.endpoint === endpoint || e.legacyEndpoints?.includes(endpoint)) ?? null
  )
}

/** Пресет по id; при невалидном — первый пресет движка */
export function resolveVoicePreset(engine: VoiceChangeEngine, presetId: string | undefined): VoicePreset {
  return engine.presets.find((p) => p.id === presetId) ?? engine.presets[0]
}

/** Подпись пресета с полом: «Aurora (женский)» */
export function voicePresetTitle(preset: VoicePreset): string {
  return `${preset.label} (${preset.gender === "female" ? "женский" : "мужской"})`
}

/** voice_id ElevenLabs: 20 латинских букв и цифр */
const ELEVENLABS_VOICE_ID = /^[A-Za-z0-9]{20}$/

export function isElevenLabsVoiceId(value: unknown): value is string {
  return typeof value === "string" && ELEVENLABS_VOICE_ID.test(value)
}

const VOICE_NAME_MAX = 80

/**
 * Имя голоса, присланное клиентом (оно же подпись задачи в библиотеке):
 * без управляющих символов, пробелы схлопнуты, не длиннее 80 символов.
 */
export function sanitizeVoiceName(raw: unknown): string {
  if (typeof raw !== "string") return ""
  const clean = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, " ").replace(/\s+/g, " ").trim()
  return clean.length > VOICE_NAME_MAX ? clean.slice(0, VOICE_NAME_MAX).trimEnd() : clean
}

export interface ResolvedVoice {
  /** Значение для провайдера: voice_id ElevenLabs или имя пресета fal */
  id: string
  /** Подпись для задачи и UI */
  name: string
}

/**
 * Голос из запроса. ElevenLabs: любой корректный voice_id + имя от клиента
 * (если имени нет — из подборки, иначе общая подпись); Chatterbox: пресет.
 * Невалидный голос (в т.ч. имя старого пресета fal вроде «Jessica») —
 * женский голос по умолчанию.
 */
export function resolveVoice(engine: VoiceChangeEngine, rawId: unknown, rawName?: unknown): ResolvedVoice {
  if (engine.dynamicVoices) {
    if (isElevenLabsVoiceId(rawId)) {
      const known = engine.presets.find((p) => p.id === rawId)
      return { id: rawId, name: sanitizeVoiceName(rawName) || known?.label || `голос ${engine.name}` }
    }
    const def = resolveVoicePreset(engine, engine.defaultFemale)
    return { id: def.id, name: def.label }
  }
  const preset = resolveVoicePreset(engine, typeof rawId === "string" ? rawId : undefined)
  return { id: preset.id, name: preset.label }
}

/**
 * Тонкие настройки голоса ElevenLabs (имена полей как в API). Хранятся в
 * `params.voice_settings` задачи и в `params.voice_over.settings` v2v.
 */
export interface VoiceSettings {
  /** 0..1: выше — ровнее и предсказуемее, ниже — эмоциональнее */
  stability: number
  /** 0..1: насколько близко держаться тембра выбранного голоса */
  similarity_boost: number
  /** 0..1: усиление характерной манеры голоса (выразительность) */
  style: number
  use_speaker_boost: boolean
  /** Чистка фона исходной записи перед конвертацией */
  remove_background_noise: boolean
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true,
  // Исходники v2v и ручной замены голоса — обычно запись с телефона: чистка фона помогает
  remove_background_noise: true,
}

/**
 * Откуда звук, который переозвучиваем: `recording` — запись пользователя
 * (исходник «Видео → видео», ручная замена голоса), `generated` — звук,
 * сгенерированный видеомоделью (текст/картинка → видео: Veo, Kling, Seedance…).
 */
export type VoiceSourceKind = "recording" | "generated"

/**
 * Настройки по умолчанию для происхождения звука. ❗ У сгенерированного звука
 * чистка фона ВЫКЛЮЧЕНА: он и так чистый, а remove_background_noise рассчитан
 * на запись с телефона и на чистом звуке только портит речь. Эталон заказчика
 * (eleven_multilingual_sts_v2, 0.5 / 0.75 / 0 / усиление вкл / без чистки фона,
 * mp3_44100_128, затем подкладка `-c:v copy -c:a aac -b:a 192k -shortest`)
 * совпадает с этими значениями для `generated`.
 */
export function defaultVoiceSettingsFor(kind: VoiceSourceKind): VoiceSettings {
  return kind === "generated"
    ? { ...DEFAULT_VOICE_SETTINGS, remove_background_noise: false }
    : { ...DEFAULT_VOICE_SETTINGS }
}

/** Режим видео-генерации → происхождение звука для автопереозвучки */
export function voiceSourceKindForMode(mode: string): VoiceSourceKind {
  return mode === "v2v" ? "recording" : "generated"
}

function unit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

/** Настройки из запроса: числа зажаты в [0, 1], всё некорректное — по умолчанию (`defaults`) */
export function sanitizeVoiceSettings(raw: unknown, defaults: VoiceSettings = DEFAULT_VOICE_SETTINGS): VoiceSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const d = defaults
  return {
    stability: unit(r.stability, d.stability),
    similarity_boost: unit(r.similarity_boost, d.similarity_boost),
    style: unit(r.style, d.style),
    use_speaker_boost: bool(r.use_speaker_boost, d.use_speaker_boost),
    remove_background_noise: bool(r.remove_background_noise, d.remove_background_noise),
  }
}

/**
 * Превью пресета (лежит в `public/voice-previews`) или null, если его не
 * записывали. Только Chatterbox: у голосов ElevenLabs превью отдаёт каталог
 * (`previewUrl`, публичный mp3 ElevenLabs).
 */
export function voicePreviewUrl(engine: VoiceChangeEngine, presetId: string): string | null {
  const preset = engine.presets.find((p) => p.id === presetId)
  return preset?.preview ? `/voice-previews/${engine.id}-${preset.id.toLowerCase()}.mp3` : null
}

/** Движок автоматической переозвучки после видео → видео */
export const AUTO_VOICE_ENGINE: VoiceChangeEngineId = "elevenlabs"

/** Настройка автопереозвучки, которая сохраняется в params v2v-генерации */
export interface VoiceOverSetting {
  engine: VoiceChangeEngineId
  voice: string
  voice_name: string
  settings: VoiceSettings
}

/**
 * Санитизация запроса автопереозвучки из тела `/api/video/generate`
 * (`{ voice, voiceName?, settings? }`). null — переозвучка не нужна (оставляем
 * исходный звук); неизвестный голос заменяется женским голосом по умолчанию.
 * Незаданные настройки берутся по умолчанию для режима (см. defaultVoiceSettingsFor).
 */
export function parseVoiceOver(raw: unknown, mode: string = "v2v"): VoiceOverSetting | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as { voice?: unknown; voiceName?: unknown; settings?: unknown }
  const engine = getVoiceEngine(AUTO_VOICE_ENGINE)!
  const voice = resolveVoice(engine, r.voice, r.voiceName)
  const defaults = defaultVoiceSettingsFor(voiceSourceKindForMode(mode))
  return { engine: engine.id, voice: voice.id, voice_name: voice.name, settings: sanitizeVoiceSettings(r.settings, defaults) }
}

/** Режимы, после которых умеем автопереозвучку: v2v и генерация видео со звуком */
export const AUTO_VOICE_OVER_MODES = ["v2v", "t2v", "i2v"] as const

export function supportsAutoVoiceOver(mode: string): boolean {
  return (AUTO_VOICE_OVER_MODES as readonly string[]).includes(mode)
}

/**
 * Оценка: цена за минуту × минуты звука. fal округляет каждый запрос вверх до
 * целой минуты (7 сек = 1 минута), ElevenLabs считает по фактической длине.
 * Фактическую стоимость в ответе ни тот, ни другой не отдаёт.
 */
export function estimateVoiceChangeCost(engine: VoiceChangeEngine, audioSeconds: number): number {
  if (!(audioSeconds > 0)) return 0
  const minutes = engine.billing === "per_started_minute" ? Math.ceil(audioSeconds / 60) : audioSeconds / 60
  return minutes * engine.pricePerMinute
}

/** Текст ошибки, когда у движка нет ключа провайдера */
export function voiceEngineNoKeyMessage(engine: VoiceChangeEngine): string {
  return engine.provider === "elevenlabs"
    ? "Нужен ключ ElevenLabs. Администратор добавляет его в Настройках."
    : "Нужен ключ fal.ai. Администратор добавляет его в Настройках."
}

/** Подпись цены движка для UI */
export function voicePriceLabel(engine: VoiceChangeEngine): string {
  const unitLabel = engine.billing === "per_started_minute" ? "за начатую минуту" : "за минуту"
  return `$${engine.pricePerMinute.toFixed(2)} ${unitLabel}`
}

/** Тело запроса к fal (Chatterbox HD). Образец голоса (URL) перекрывает пресет. */
export function buildVoiceChangeInput(opts: {
  engine: VoiceChangeEngine
  audioUrl: string
  presetId?: string
  sampleUrl?: string
}): Record<string, unknown> {
  const { engine, audioUrl } = opts
  if (engine.provider !== "fal") {
    throw new Error(`${engine.name} работает не через fal.ai`)
  }
  assertHttps(audioUrl)
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
