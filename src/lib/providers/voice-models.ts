import { ELEVENLABS_CURATED_VOICES, isElevenLabsVoiceId, sanitizeVoiceName } from "./voice-change-models"

/**
 * Реестр моделей озвучки (TTS) для вкладки «Озвучка».
 * - ElevenLabs — напрямую (`POST /v1/text-to-speech/{voice_id}`, ключ `elevenlabs`):
 *   лучший русский, любой голос библиотеки ElevenLabs, тонкие настройки.
 * - Остальные — через единый OpenRouter endpoint `POST /api/v1/audio/speech`
 *   (OpenAI-совместимый), тем же ключом, что картинки/видео/чат.
 *
 * В отличие от видео, синтез СИНХРОННЫЙ: один HTTP-запрос сразу отдаёт байты
 * аудио (mp3 или, у Gemini, сырой PCM → заворачиваем в WAV). Поэтому нет
 * job/poll/cron — результат кладётся в S3 прямо в обработчике запроса.
 *
 * Источник: openrouter.ai `GET /api/v1/models?output_modalities=speech` +
 * живая проверка каждого слага (см. CLAUDE.md). Проверено июнь 2026.
 */

export type VoiceVendor =
  | "elevenlabs"
  | "microsoft"
  | "google"
  | "xai"
  | "hexgrad"
  | "canopy"
  | "zyphra"
  | "sesame"
  | "mistral"

/**
 * Поддержка русской речи:
 * - good — уверенно озвучивает по-русски (родные ru-голоса или авто-язык);
 * - partial — русский частично/не подтверждён, лучше проверить;
 * - none — только английский / фиксированный набор языков без русского.
 */
export type RussianSpeech = "good" | "partial" | "none"

export interface VoiceOption {
  /** Значение поля `voice`, уходит провайдеру как есть */
  id: string
  /** Подпись в UI */
  label: string
  /** Родной русский голос */
  ru?: boolean
}

/** Чей ключ и адаптер нужен модели (провайдер в `api_keys` и `voice_generations.provider`) */
export type VoiceApiProvider = "openrouter" | "elevenlabs"

/** Возможности модели ElevenLabs (по `GET /v1/models`, проверено 2026-10-25) */
export interface ElevenLabsTtsCaps {
  /** model_id ElevenLabs */
  modelId: string
  /** `can_use_style`: ползунок «Выразительность» */
  supportsStyle: boolean
  /** `can_use_speaker_boost`: переключатель «Усиление голоса» */
  supportsSpeakerBoost: boolean
  /** Аудиотеги в тексте ([excited], [whispers]…) — v3 и v4 */
  supportsAudioTags: boolean
  /**
   * По какой модели смотреть «русский проверен» в `verified_languages`, если
   * сама модель там не публикуется (у eleven_v3 записей нет — берём v4)
   */
  verifiedAs?: string
}

export interface VoiceModel {
  /** ID модели в реестре (OpenRouter — его слаг, ElevenLabs — `elevenlabs/<model_id>`) */
  id: string
  provider: VoiceApiProvider
  /** Имя для UI */
  name: string
  vendor: VoiceVendor
  /** Краткое описание для не-технаря */
  description: string
  russianSpeech: RussianSpeech
  voices: VoiceOption[]
  /** Голос по умолчанию (обязан присутствовать в `voices`) */
  defaultVoice: string
  /** Формат, который запрашиваем у /audio/speech */
  requestFormat: "mp3" | "pcm"
  /** Формат итогового файла (pcm заворачиваем в wav на сервере) */
  outputFormat: "mp3" | "wav"
  /** Поддерживает ли параметр скорости */
  supportsSpeed: boolean
  /** Диапазон скорости [min, max] (если supportsSpeed) */
  speedRange?: [number, number]
  /** Оценка цены за 1000 символов входного текста, USD (для оценки в UI) */
  pricePer1kChars: number
  /** Максимум символов на один запрос */
  maxChars: number
  /** Доступна ли модель сейчас (false → провайдер отдаёт 404) */
  available: boolean
  /** Заметка под селектором (ограничения, нюансы) */
  note?: string
  /** Превью-слаг — может меняться/исчезать */
  isPreview?: boolean
  /** Пометка «новинка» */
  isNew?: boolean
  /** Голос — любой voice_id каталога ElevenLabs (`voices` — лишь подборка с именами) */
  dynamicVoices?: boolean
  /** Только ElevenLabs: возможности модели */
  elevenlabs?: ElevenLabsTtsCaps
}

/** Голоса Gemini TTS (одинаковы для всех языков, включая русский). */
const GEMINI_VOICES: VoiceOption[] = [
  "Kore", "Zephyr", "Puck", "Charon", "Fenrir", "Leda", "Orus", "Aoede",
  "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
  "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
].map((v) => ({ id: v, label: v }))

/** Подборка русских голосов ElevenLabs (общая с заменой голоса); первые — по умолчанию */
const ELEVENLABS_VOICES: VoiceOption[] = ELEVENLABS_CURATED_VOICES.map((v) => ({
  id: v.id,
  label: `${v.label} (${v.gender === "female" ? "жен." : "муж."})`,
  ru: true,
}))
const ELEVENLABS_DEFAULT_VOICE = ELEVENLABS_CURATED_VOICES[0].id

function elevenLabsModel(opts: {
  modelId: string
  name: string
  description: string
  pricePer1kChars: number
  maxChars: number
  caps: Omit<ElevenLabsTtsCaps, "modelId">
  note?: string
  isNew?: boolean
}): VoiceModel {
  return {
    id: `elevenlabs/${opts.modelId}`,
    provider: "elevenlabs",
    name: opts.name,
    vendor: "elevenlabs",
    description: opts.description,
    russianSpeech: "good",
    voices: ELEVENLABS_VOICES,
    defaultVoice: ELEVENLABS_DEFAULT_VOICE,
    requestFormat: "mp3",
    outputFormat: "mp3",
    // Скорость у ElevenLabs — внутри voice_settings (см. sanitizeTtsSettings)
    supportsSpeed: true,
    speedRange: [0.7, 1.2],
    pricePer1kChars: opts.pricePer1kChars,
    maxChars: opts.maxChars,
    available: true,
    note: opts.note,
    isNew: opts.isNew,
    dynamicVoices: true,
    elevenlabs: { modelId: opts.modelId, ...opts.caps },
  }
}

export const VOICE_MODELS: VoiceModel[] = [
  // ===== Лучший русский =====
  // ElevenLabs: model_id, лимиты символов и возможности — из GET /v1/models (2026-10-25);
  // цена — тариф за 1000 символов (turbo — множитель 0.5)
  elevenLabsModel({
    modelId: "eleven_v4",
    name: "ElevenLabs v4",
    description: "Лучшая и самая эмоциональная модель ElevenLabs: родные русские голоса из библиотеки, аудиотеги подачи ([whispers], [laughs]…).",
    pricePer1kChars: 0.08,
    maxChars: 10000,
    caps: { supportsStyle: false, supportsSpeakerBoost: false, supportsAudioTags: true },
    isNew: true,
  }),
  elevenLabsModel({
    modelId: "eleven_v4_turbo",
    name: "ElevenLabs v4 Turbo",
    description: "Быстрая и вдвое дешевле v4, те же голоса и аудиотеги. Для черновиков и длинных текстов.",
    pricePer1kChars: 0.04,
    maxChars: 10000,
    caps: { supportsStyle: false, supportsSpeakerBoost: false, supportsAudioTags: true },
    isNew: true,
  }),
  elevenLabsModel({
    modelId: "eleven_v3",
    name: "ElevenLabs v3",
    description: "Выразительная, драматичная подача и аудиотеги. До 5000 символов.",
    pricePer1kChars: 0.08,
    maxChars: 5000,
    caps: { supportsStyle: false, supportsSpeakerBoost: false, supportsAudioTags: true, verifiedAs: "eleven_v4" },
  }),
  elevenLabsModel({
    modelId: "eleven_multilingual_v2",
    name: "ElevenLabs Multilingual v2",
    description: "Ровная и стабильная — для длинных текстов, аудиокниг и закадра. Без аудиотегов.",
    pricePer1kChars: 0.08,
    maxChars: 10000,
    caps: { supportsStyle: true, supportsSpeakerBoost: true, supportsAudioTags: false },
  }),
  {
    id: "microsoft/mai-voice-2",
    provider: "openrouter",
    name: "MAI-Voice-2",
    vendor: "microsoft",
    description: "Microsoft (Azure). Родные русские голоса Маша и Лев, выразительная интонация. Лучший русский через OpenRouter.",
    russianSpeech: "good",
    voices: [
      { id: "ru-RU-Masha:MAI-Voice-2", label: "Маша (рус., жен.)", ru: true },
      { id: "ru-RU-Lev:MAI-Voice-2", label: "Лев (рус., муж.)", ru: true },
      { id: "en-US-Olivia:MAI-Voice-2", label: "Olivia (англ., жен.)" },
      { id: "en-US-Ethan:MAI-Voice-2", label: "Ethan (англ., муж.)" },
      { id: "en-US-Harper:MAI-Voice-2", label: "Harper (англ., жен.)" },
    ],
    defaultVoice: "ru-RU-Masha:MAI-Voice-2",
    requestFormat: "mp3",
    outputFormat: "mp3",
    supportsSpeed: true,
    speedRange: [0.5, 2],
    pricePer1kChars: 0.022,
    maxChars: 5000,
    available: true,
    isNew: true,
  },
  {
    id: "google/gemini-3.1-flash-tts-preview",
    provider: "openrouter",
    name: "Gemini 3.1 Flash TTS",
    vendor: "google",
    description: "Google. 100+ языков (вкл. русский), 30 голосов, поддержка интонационных тегов. Отдаёт WAV. Дороже остальных (тарифицируется и выход).",
    russianSpeech: "good",
    voices: GEMINI_VOICES,
    defaultVoice: "Kore",
    requestFormat: "pcm",
    outputFormat: "wav",
    supportsSpeed: false,
    pricePer1kChars: 0.045,
    maxChars: 5000,
    available: true,
    note: "Голоса работают на любом языке — для русского подойдёт любой из списка.",
    isPreview: true,
    isNew: true,
  },
  {
    id: "x-ai/grok-voice-tts-1.0",
    provider: "openrouter",
    name: "Grok Voice TTS",
    vendor: "xai",
    description: "xAI. 20+ языков с авто-определением: один и тот же голос говорит по-русски, если текст русский.",
    russianSpeech: "good",
    voices: [
      { id: "Eve", label: "Eve" },
      { id: "Ara", label: "Ara" },
      { id: "Rex", label: "Rex" },
      { id: "Sal", label: "Sal" },
      { id: "Leo", label: "Leo" },
    ],
    defaultVoice: "Eve",
    requestFormat: "mp3",
    outputFormat: "mp3",
    supportsSpeed: false,
    pricePer1kChars: 0.015,
    maxChars: 5000,
    available: true,
    note: "Язык определяется автоматически по тексту.",
  },
  // ===== Английские / прочие языки =====
  {
    id: "hexgrad/kokoro-82m",
    provider: "openrouter",
    name: "Kokoro 82M",
    vendor: "hexgrad",
    description: "Открытая модель, 54 голоса (8 языков, БЕЗ русского). Самая дешёвая — для англоязычной озвучки и черновиков.",
    russianSpeech: "none",
    voices: [
      { id: "af_heart", label: "Heart (амер., жен.)" },
      { id: "af_bella", label: "Bella (амер., жен.)" },
      { id: "af_nicole", label: "Nicole (амер., жен.)" },
      { id: "af_sky", label: "Sky (амер., жен.)" },
      { id: "am_michael", label: "Michael (амер., муж.)" },
      { id: "am_adam", label: "Adam (амер., муж.)" },
      { id: "am_onyx", label: "Onyx (амер., муж.)" },
      { id: "am_echo", label: "Echo (амер., муж.)" },
      { id: "bf_emma", label: "Emma (брит., жен.)" },
      { id: "bf_isabella", label: "Isabella (брит., жен.)" },
      { id: "bm_george", label: "George (брит., муж.)" },
      { id: "bm_lewis", label: "Lewis (брит., муж.)" },
    ],
    defaultVoice: "af_heart",
    requestFormat: "mp3",
    outputFormat: "mp3",
    supportsSpeed: false,
    pricePer1kChars: 0.0006,
    maxChars: 5000,
    available: true,
  },
  {
    id: "canopylabs/orpheus-3b-0.1-ft",
    provider: "openrouter",
    name: "Orpheus 3B",
    vendor: "canopy",
    description: "Эмоциональная английская речь, теги <laugh>/<sigh>. Только английский.",
    russianSpeech: "none",
    voices: [
      { id: "tara", label: "Tara" },
      { id: "leah", label: "Leah" },
      { id: "jess", label: "Jess" },
      { id: "leo", label: "Leo" },
      { id: "dan", label: "Dan" },
      { id: "mia", label: "Mia" },
      { id: "zac", label: "Zac" },
      { id: "zoe", label: "Zoe" },
    ],
    defaultVoice: "tara",
    requestFormat: "mp3",
    outputFormat: "mp3",
    supportsSpeed: false,
    pricePer1kChars: 0.007,
    maxChars: 5000,
    available: true,
  },
  {
    id: "zyphra/zonos-v0.1-transformer",
    provider: "openrouter",
    name: "Zonos v0.1 Transformer",
    vendor: "zyphra",
    description: "Английская речь (амер./брит.), мужские и женские голоса. Без русского.",
    russianSpeech: "none",
    voices: [
      { id: "american_female", label: "American (жен.)" },
      { id: "american_male", label: "American (муж.)" },
      { id: "british_female", label: "British (жен.)" },
      { id: "british_male", label: "British (муж.)" },
    ],
    defaultVoice: "american_female",
    requestFormat: "mp3",
    outputFormat: "mp3",
    supportsSpeed: false,
    pricePer1kChars: 0.007,
    maxChars: 5000,
    available: true,
  },
  {
    id: "zyphra/zonos-v0.1-hybrid",
    provider: "openrouter",
    name: "Zonos v0.1 Hybrid",
    vendor: "zyphra",
    description: "Гибридная версия Zonos. Английская речь (амер./брит.). Без русского.",
    russianSpeech: "none",
    voices: [
      { id: "american_female", label: "American (жен.)" },
      { id: "american_male", label: "American (муж.)" },
      { id: "british_female", label: "British (жен.)" },
      { id: "british_male", label: "British (муж.)" },
    ],
    defaultVoice: "american_female",
    requestFormat: "mp3",
    outputFormat: "mp3",
    supportsSpeed: false,
    pricePer1kChars: 0.007,
    maxChars: 5000,
    available: true,
  },
  {
    id: "sesame/csm-1b",
    provider: "openrouter",
    name: "Sesame CSM 1B",
    vendor: "sesame",
    description: "Разговорная английская речь. Без русского.",
    russianSpeech: "none",
    voices: [
      { id: "conversational_a", label: "Conversational A" },
      { id: "conversational_b", label: "Conversational B" },
      { id: "read_speech_a", label: "Read speech A" },
    ],
    defaultVoice: "conversational_a",
    requestFormat: "mp3",
    outputFormat: "mp3",
    supportsSpeed: false,
    pricePer1kChars: 0.007,
    maxChars: 5000,
    available: true,
  },
  // ===== Временно недоступна =====
  {
    id: "mistralai/voxtral-mini-tts-2603",
    provider: "openrouter",
    name: "Voxtral Mini TTS",
    vendor: "mistral",
    description: "Mistral. Пресетные голоса (EN/FR/ES/DE/IT/PT), без русского. Провайдер сейчас отдаёт 404 — временно недоступна.",
    russianSpeech: "none",
    voices: [
      { id: "casual_male", label: "Casual (муж.)" },
      { id: "casual_female", label: "Casual (жен.)" },
      { id: "neutral_male", label: "Neutral (муж.)" },
      { id: "neutral_female", label: "Neutral (жен.)" },
    ],
    defaultVoice: "casual_male",
    requestFormat: "mp3",
    outputFormat: "mp3",
    supportsSpeed: false,
    pricePer1kChars: 0.016,
    maxChars: 5000,
    available: false,
    note: "Провайдер периодически возвращает 404 — модель может быть недоступна.",
  },
]

export const DEFAULT_VOICE_MODEL = "microsoft/mai-voice-2"
/** По умолчанию при наличии ключа ElevenLabs — лучший русский */
export const DEFAULT_ELEVENLABS_VOICE_MODEL = "elevenlabs/eleven_v4"

/** model_id ElevenLabs, по которому проверяется «русский проверен» у голосов */
export function elevenLabsVerificationModel(model: VoiceModel): string | undefined {
  return model.elevenlabs ? (model.elevenlabs.verifiedAs ?? model.elevenlabs.modelId) : undefined
}

export function getVoiceModel(id: string): VoiceModel | undefined {
  return VOICE_MODELS.find((m) => m.id === id)
}

/** Валиден ли голос для модели */
export function isValidVoice(model: VoiceModel, voiceId: string): boolean {
  return model.voices.some((v) => v.id === voiceId)
}

/** Голос из запроса или дефолтный, если переданный невалиден (ElevenLabs — любой voice_id) */
export function resolveVoice(model: VoiceModel, voiceId?: string | null): string {
  if (model.dynamicVoices) return isElevenLabsVoiceId(voiceId) ? voiceId : model.defaultVoice
  return voiceId && isValidVoice(model, voiceId) ? voiceId : model.defaultVoice
}

/**
 * Подпись голоса: имя от клиента (ElevenLabs, санитизируется), иначе подпись из
 * списка модели, иначе сам id.
 */
export function voiceLabel(model: VoiceModel, voiceId: string, clientName?: unknown): string {
  const known = model.voices.find((v) => v.id === voiceId)?.label
  if (model.dynamicVoices) return sanitizeVoiceName(clientName) || known || "голос ElevenLabs"
  return known || voiceId
}

/** Тонкие настройки ElevenLabs TTS (имена полей как в API `voice_settings`) */
export interface TtsVoiceSettings {
  /** 0..1: выше — ровнее, ниже — эмоциональнее */
  stability: number
  /** 0..1: насколько точно держаться тембра голоса */
  similarity_boost: number
  /** 0..1: выразительность (только модели с `can_use_style`) */
  style?: number
  /** Только модели с `can_use_speaker_boost` */
  use_speaker_boost?: boolean
  /** 0.7..1.2 */
  speed?: number
}

export const DEFAULT_TTS_SETTINGS: Required<TtsVoiceSettings> = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true,
  speed: 1,
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.round(Math.min(max, Math.max(min, value)) * 100) / 100
}

/** Все поля настроек зажаты в допустимые диапазоны, мусор — по умолчанию (для хранения в UI) */
export function normalizeTtsSettings(raw: unknown): Required<TtsVoiceSettings> {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_TTS_SETTINGS
  return {
    stability: clampNum(r.stability, 0, 1, d.stability),
    similarity_boost: clampNum(r.similarity_boost, 0, 1, d.similarity_boost),
    style: clampNum(r.style, 0, 1, d.style),
    use_speaker_boost: typeof r.use_speaker_boost === "boolean" ? r.use_speaker_boost : d.use_speaker_boost,
    speed: clampNum(r.speed, 0.7, 1.2, d.speed),
  }
}

/**
 * Настройки из запроса под возможности модели: числа зажаты в допустимый
 * диапазон, неподдерживаемые моделью поля (style / speaker boost) выброшены,
 * чтобы не уходили в API.
 */
export function sanitizeTtsSettings(model: VoiceModel, raw: unknown): TtsVoiceSettings {
  const all = normalizeTtsSettings(raw)
  const caps = model.elevenlabs
  const out: TtsVoiceSettings = { stability: all.stability, similarity_boost: all.similarity_boost }
  if (caps?.supportsStyle) out.style = all.style
  if (caps?.supportsSpeakerBoost) out.use_speaker_boost = all.use_speaker_boost
  if (model.supportsSpeed) {
    const [min, max] = model.speedRange ?? [0.7, 1.2]
    out.speed = Math.min(max, Math.max(min, all.speed))
  }
  return out
}

/**
 * Аудиотеги ElevenLabs v3/v4: пишутся в тексте в квадратных скобках, задают
 * подачу и не произносятся. Подписи — для кнопок-подсказок в UI.
 */
export const ELEVENLABS_AUDIO_TAGS: { tag: string; label: string }[] = [
  { tag: "[excited]", label: "радостно" },
  { tag: "[whispers]", label: "шёпотом" },
  { tag: "[laughs]", label: "смех" },
  { tag: "[sighs]", label: "вздох" },
  { tag: "[sarcastic]", label: "с сарказмом" },
  { tag: "[curious]", label: "с интересом" },
  { tag: "[sad]", label: "грустно" },
  { tag: "[angry]", label: "сердито" },
]

/** Зажать скорость в допустимый диапазон модели */
export function clampSpeed(model: VoiceModel, speed?: number | null): number {
  if (!model.supportsSpeed || typeof speed !== "number" || !isFinite(speed)) return 1
  const [min, max] = model.speedRange ?? [0.5, 2]
  return Math.min(max, Math.max(min, speed))
}

export function defaultVoiceParams(model: VoiceModel): { voice: string; speed: number } {
  return { voice: model.defaultVoice, speed: 1 }
}

/** Оценка стоимости синтеза по числу символов входного текста (USD). */
export function estimateVoiceCost(model: VoiceModel, charCount: number): number {
  const chars = Math.max(0, charCount)
  return (chars / 1000) * model.pricePer1kChars
}

export const VOICE_VENDOR_COLORS: Record<VoiceVendor, { dot: string; text: string; label: string }> = {
  elevenlabs: { dot: "bg-orange-400", text: "text-orange-300", label: "ElevenLabs" },
  microsoft: { dot: "bg-sky-400", text: "text-sky-300", label: "Microsoft" },
  google: { dot: "bg-rose-400", text: "text-rose-300", label: "Google" },
  xai: { dot: "bg-violet-400", text: "text-violet-300", label: "xAI" },
  hexgrad: { dot: "bg-emerald-400", text: "text-emerald-300", label: "Kokoro" },
  canopy: { dot: "bg-amber-400", text: "text-amber-300", label: "Canopy" },
  zyphra: { dot: "bg-cyan-400", text: "text-cyan-300", label: "Zyphra" },
  sesame: { dot: "bg-pink-400", text: "text-pink-300", label: "Sesame" },
  mistral: { dot: "bg-orange-400", text: "text-orange-300", label: "Mistral" },
}

export const RUSSIAN_SPEECH_INFO: Record<RussianSpeech, { dot: string; text: string; short: string; label: string }> = {
  good: { dot: "bg-emerald-400", text: "text-emerald-300", short: "рус. речь", label: "Уверенно озвучивает по-русски" },
  partial: { dot: "bg-amber-400", text: "text-amber-300", short: "рус. ±", label: "Русский — частично, лучше проверить" },
  none: { dot: "bg-neutral-500", text: "text-neutral-400", short: "англ.", label: "Русский не поддерживает (англ./др. языки)" },
}
