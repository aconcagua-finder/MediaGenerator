import { describe, it, expect, vi, afterEach } from "vitest"
import { buildTextToSpeechRequest, elevenLabsTextToSpeech } from "@/lib/providers/elevenlabs"
import { isRuVerifiedFor } from "@/lib/providers/elevenlabs-voices"
import {
  VOICE_MODELS,
  DEFAULT_ELEVENLABS_VOICE_MODEL,
  DEFAULT_TTS_SETTINGS,
  ELEVENLABS_AUDIO_TAGS,
  elevenLabsVerificationModel,
  estimateVoiceCost,
  getVoiceModel,
  normalizeTtsSettings,
  resolveVoice,
  sanitizeTtsSettings,
  voiceLabel,
} from "@/lib/providers/voice-models"
import { getVoiceProvider } from "@/lib/providers/voice/registry"
import { humanizeVoiceError } from "@/lib/voice/humanize-error"
import { humanizeVideoError } from "@/lib/video/humanize-error"

const MARINA = "ymDCYd8puC7gYjxIamPt"
const RINA = "ycbyWsnf4hqZgdpKHqiU"

const v4 = getVoiceModel("elevenlabs/eleven_v4")!
const turbo = getVoiceModel("elevenlabs/eleven_v4_turbo")!
const v3 = getVoiceModel("elevenlabs/eleven_v3")!
const v2 = getVoiceModel("elevenlabs/eleven_multilingual_v2")!

afterEach(() => vi.unstubAllGlobals())

describe("ElevenLabs TTS — реестр", () => {
  it("четыре модели, все через провайдера elevenlabs, первыми в списке", () => {
    const el = VOICE_MODELS.filter((m) => m.provider === "elevenlabs")
    expect(el.map((m) => m.elevenlabs!.modelId)).toEqual([
      "eleven_v4",
      "eleven_v4_turbo",
      "eleven_v3",
      "eleven_multilingual_v2",
    ])
    expect(VOICE_MODELS.slice(0, 4)).toEqual(el)
    for (const m of el) {
      expect(m.id).toBe(`elevenlabs/${m.elevenlabs!.modelId}`)
      expect(m.russianSpeech).toBe("good")
      expect(m.dynamicVoices).toBe(true)
      expect(m.outputFormat).toBe("mp3")
    }
    expect(DEFAULT_ELEVENLABS_VOICE_MODEL).toBe("elevenlabs/eleven_v4")
  })

  it("остальные модели — OpenRouter", () => {
    expect(getVoiceModel("microsoft/mai-voice-2")!.provider).toBe("openrouter")
    expect(VOICE_MODELS.every((m) => m.provider === "openrouter" || m.vendor === "elevenlabs")).toBe(true)
  })

  it("цены за 1000 символов по тарифу ElevenLabs", () => {
    expect(v4.pricePer1kChars).toBe(0.08)
    expect(turbo.pricePer1kChars).toBe(0.04)
    expect(v3.pricePer1kChars).toBe(0.08)
    expect(v2.pricePer1kChars).toBe(0.08)
    expect(estimateVoiceCost(v4, 1000)).toBeCloseTo(0.08, 6)
    expect(estimateVoiceCost(turbo, 2500)).toBeCloseTo(0.1, 6)
    expect(estimateVoiceCost(v3, 0)).toBe(0)
  })

  it("лимиты символов по GET /v1/models", () => {
    expect(v4.maxChars).toBe(10000)
    expect(turbo.maxChars).toBe(10000)
    expect(v3.maxChars).toBe(5000)
    expect(v2.maxChars).toBe(10000)
  })

  it("возможности: style и speaker boost только у Multilingual v2, теги — у v3/v4", () => {
    expect(v2.elevenlabs).toMatchObject({ supportsStyle: true, supportsSpeakerBoost: true, supportsAudioTags: false })
    for (const m of [v4, turbo, v3]) {
      expect(m.elevenlabs).toMatchObject({ supportsStyle: false, supportsSpeakerBoost: false, supportsAudioTags: true })
    }
    expect(ELEVENLABS_AUDIO_TAGS.map((t) => t.tag)).toEqual(
      expect.arrayContaining(["[excited]", "[whispers]", "[laughs]", "[sighs]", "[sarcastic]"]),
    )
  })

  it("провайдер elevenlabs есть в реестре озвучки", () => {
    expect(getVoiceProvider("elevenlabs")).toBeTruthy()
    expect(getVoiceProvider("openrouter")).toBeTruthy()
  })
})

describe("ElevenLabs TTS — голос", () => {
  it("любой корректный voice_id библиотеки; мусор и голос OpenRouter — Marina", () => {
    expect(resolveVoice(v4, RINA)).toBe(RINA)
    expect(resolveVoice(v4, "ru-RU-Masha:MAI-Voice-2")).toBe(MARINA)
    expect(resolveVoice(v4, undefined)).toBe(MARINA)
  })

  it("у OpenRouter-моделей voice_id ElevenLabs не проходит", () => {
    const mai = getVoiceModel("microsoft/mai-voice-2")!
    expect(resolveVoice(mai, MARINA)).toBe(mai.defaultVoice)
  })

  it("подпись: имя клиента (санитизированное), иначе из подборки", () => {
    expect(voiceLabel(v4, RINA, "  Rina\n ")).toBe("Rina")
    expect(voiceLabel(v4, MARINA)).toBe("Marina (жен.)")
    expect(voiceLabel(v4, RINA)).toBe("голос ElevenLabs")
    expect(voiceLabel(getVoiceModel("x-ai/grok-voice-tts-1.0")!, "Eve", "Hack")).toBe("Eve")
  })

  it("«русский проверен» — по модели; у v3 записей нет, проверка берётся от v4", () => {
    const voice = { ruVerified: true, ruModels: ["eleven_v4", "eleven_multilingual_sts_v2"] }
    expect(isRuVerifiedFor(voice, elevenLabsVerificationModel(v4))).toBe(true)
    expect(isRuVerifiedFor(voice, elevenLabsVerificationModel(v3))).toBe(true)
    expect(isRuVerifiedFor(voice, elevenLabsVerificationModel(v2))).toBe(false)
    expect(isRuVerifiedFor(voice)).toBe(true)
    // старый сохранённый голос без ruModels — по признаку STS
    expect(isRuVerifiedFor({ ruVerified: true }, "eleven_v4")).toBe(true)
    expect(elevenLabsVerificationModel(getVoiceModel("microsoft/mai-voice-2")!)).toBeUndefined()
  })
})

describe("ElevenLabs TTS — настройки под модель", () => {
  it("по умолчанию: 0.5 / 0.75 / 0 / вкл / 1×", () => {
    expect(DEFAULT_TTS_SETTINGS).toEqual({ stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 })
    expect(normalizeTtsSettings(null)).toEqual(DEFAULT_TTS_SETTINGS)
  })

  it("v4: style и speaker boost не уходят, скорость зажата в 0.7..1.2", () => {
    expect(
      sanitizeTtsSettings(v4, { stability: 2, similarity_boost: -1, style: 0.9, use_speaker_boost: false, speed: 3 }),
    ).toEqual({ stability: 1, similarity_boost: 0, speed: 1.2 })
    expect(sanitizeTtsSettings(v4, { speed: 0.1 }).speed).toBe(0.7)
  })

  it("Multilingual v2: все поля", () => {
    expect(
      sanitizeTtsSettings(v2, { stability: 0.333, similarity_boost: 0.8, style: 0.3, use_speaker_boost: false, speed: 1.1 }),
    ).toEqual({ stability: 0.33, similarity_boost: 0.8, style: 0.3, use_speaker_boost: false, speed: 1.1 })
  })

  it("мусор — значения по умолчанию", () => {
    expect(sanitizeTtsSettings(v2, { stability: "x", style: Number.NaN, use_speaker_boost: "yes" })).toEqual({
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true,
      speed: 1,
    })
    expect(sanitizeTtsSettings(v3, "garbage")).toEqual({ stability: 0.5, similarity_boost: 0.75, speed: 1 })
  })
})

describe("ElevenLabs TTS — запрос", () => {
  it("адрес с voice_id и mp3 44.1 кГц, JSON с моделью и настройками", () => {
    const { url, body } = buildTextToSpeechRequest({
      voiceId: MARINA,
      text: "[excited] Привет!",
      modelId: "eleven_v4",
      settings: sanitizeTtsSettings(v4, { stability: 0.4, speed: 1.1 }),
    })
    expect(url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${MARINA}?output_format=mp3_44100_128`)
    expect(body).toEqual({
      text: "[excited] Привет!",
      model_id: "eleven_v4",
      voice_settings: { stability: 0.4, similarity_boost: 0.75, speed: 1.1 },
    })
  })

  it("language_code и seed — только корректные", () => {
    const base = { voiceId: MARINA, text: "x", modelId: "eleven_v4", settings: { stability: 0.5, similarity_boost: 0.75 } }
    expect(buildTextToSpeechRequest({ ...base, languageCode: "ru", seed: 7 }).body).toMatchObject({
      language_code: "ru",
      seed: 7,
    })
    const bad = buildTextToSpeechRequest({ ...base, languageCode: "rus; DROP", seed: -1 }).body
    expect(bad).not.toHaveProperty("language_code")
    expect(bad).not.toHaveProperty("seed")
  })

  it("некорректный voice_id не уходит в адрес", () => {
    expect(() =>
      buildTextToSpeechRequest({ voiceId: "../v1/user", text: "x", modelId: "eleven_v4", settings: { stability: 0.5, similarity_boost: 0.75 } }),
    ).toThrow()
  })

  it("вызов: заголовок ключа, JSON-тело, байты mp3 в ответе", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } }))
    vi.stubGlobal("fetch", fetchMock)
    const out = await elevenLabsTextToSpeech("secret", {
      voiceId: MARINA,
      text: "Привет",
      modelId: "eleven_v4",
      settings: { stability: 0.5, similarity_boost: 0.75 },
    })
    expect([...out.buffer]).toEqual([1, 2, 3])
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("secret")
    expect(JSON.parse(init.body as string).model_id).toBe("eleven_v4")
  })

  it("адаптер озвучки: модель реестра → model_id, настройки зажаты под модель", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([5]), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const res = await getVoiceProvider("elevenlabs").synth(
      { model: "elevenlabs/eleven_v4_turbo", text: "Тест", voice: RINA, requestFormat: "mp3", settings: { style: 1, speed: 9 } },
      "k",
    )
    expect(res).toMatchObject({ contentType: "audio/mpeg", outputFormat: "mp3", generationId: null })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain(`/v1/text-to-speech/${RINA}`)
    expect(JSON.parse(init.body as string)).toMatchObject({
      model_id: "eleven_v4_turbo",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.2 },
    })
    expect(JSON.parse(init.body as string).voice_settings).not.toHaveProperty("style")
  })
})

describe("ElevenLabs TTS — ошибки по-русски", () => {
  it("ошибки ElevenLabs переводятся по коду, с подсказками для озвучки", () => {
    expect(humanizeVoiceError("ElevenLabs 401 quota_exceeded: This request exceeds your quota")).toMatch(/закончились кредиты/)
    expect(humanizeVoiceError("ElevenLabs 401 missing_permissions: lacks text_to_speech")).toMatch(/Text to Speech/)
    expect(humanizeVoiceError("ElevenLabs 400 text_too_long: too long")).toMatch(/Текст слишком длинный/)
    expect(humanizeVoiceError("ElevenLabs 404 voice_not_found: not found")).toMatch(/голос ElevenLabs недоступен/)
    expect(humanizeVoiceError("ElevenLabs 401 invalid_api_key: Invalid API key")).toMatch(/Ключ ElevenLabs недействителен/)
  })

  it("кредиты ElevenLabs не путаются с балансом OpenRouter, ошибки OpenRouter прежние", () => {
    expect(humanizeVoiceError("ElevenLabs 401 quota_exceeded: credits")).not.toMatch(/OpenRouter/)
    expect(humanizeVoiceError("insufficient credits")).toMatch(/OpenRouter/)
  })

  it("замена голоса сохраняет свои подсказки", () => {
    expect(humanizeVideoError("ElevenLabs 401 missing_permissions: x")).toMatch(/Voice Changer/)
    expect(humanizeVideoError("ElevenLabs 400 audio_too_long: Audio duration exceeds 300 seconds")).toMatch(/5-минутном/)
  })
})
