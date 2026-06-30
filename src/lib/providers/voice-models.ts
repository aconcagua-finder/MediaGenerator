/**
 * Реестр моделей озвучки (TTS) для вкладки «Озвучка».
 * Все вызываются через единый OpenRouter endpoint `POST /api/v1/audio/speech`
 * (OpenAI-совместимый), тем же ключом, что картинки/видео/чат.
 *
 * В отличие от видео, синтез СИНХРОННЫЙ: один HTTP-запрос сразу отдаёт байты
 * аудио (mp3 или, у Gemini, сырой PCM → заворачиваем в WAV). Поэтому нет
 * job/poll/cron — результат кладётся в S3 прямо в обработчике запроса.
 *
 * Источник: openrouter.ai `GET /api/v1/models?output_modalities=speech` +
 * живая проверка каждого слага (см. CLAUDE.md). Проверено июнь 2026.
 */

export type VoiceVendor =
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

export interface VoiceModel {
  /** ID модели в OpenRouter (поле `model`) */
  id: string
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
}

/** Голоса Gemini TTS (одинаковы для всех языков, включая русский). */
const GEMINI_VOICES: VoiceOption[] = [
  "Kore", "Zephyr", "Puck", "Charon", "Fenrir", "Leda", "Orus", "Aoede",
  "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
  "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
].map((v) => ({ id: v, label: v }))

export const VOICE_MODELS: VoiceModel[] = [
  // ===== Лучший русский =====
  {
    id: "microsoft/mai-voice-2",
    name: "MAI-Voice-2",
    vendor: "microsoft",
    description: "Microsoft (Azure). Родные русские голоса Маша и Лев, выразительная интонация. Лучший выбор для русской озвучки.",
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

export function getVoiceModel(id: string): VoiceModel | undefined {
  return VOICE_MODELS.find((m) => m.id === id)
}

/** Валиден ли голос для модели */
export function isValidVoice(model: VoiceModel, voiceId: string): boolean {
  return model.voices.some((v) => v.id === voiceId)
}

/** Голос из запроса или дефолтный, если переданный невалиден */
export function resolveVoice(model: VoiceModel, voiceId?: string | null): string {
  return voiceId && isValidVoice(model, voiceId) ? voiceId : model.defaultVoice
}

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
