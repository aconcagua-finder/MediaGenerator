import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import {
  VOICE_CHANGE_ENGINES,
  AUTO_VOICE_ENGINE,
  DEFAULT_VOICE_SETTINGS,
  getVoiceEngine,
  getVoiceEngineByEndpoint,
  parseVoiceOver,
  voicePresetTitle,
  voicePreviewUrl,
  voicePriceLabel,
  estimateVoiceChangeCost,
  isElevenLabsVoiceId,
  sanitizeVoiceName,
  sanitizeVoiceSettings,
  resolveVoice,
} from "@/lib/providers/voice-change-models"
import { readVoiceOver, voiceOverDto } from "@/lib/video/voice-over"

const MARINA = "ymDCYd8puC7gYjxIamPt"
const NIKOLAY = "3EuKHIEZbSzrHGNmdYsx"

describe("voice-change-models — реестр", () => {
  it("голоса по умолчанию есть в списке и нужного пола", () => {
    for (const e of VOICE_CHANGE_ENGINES) {
      const f = e.presets.find((p) => p.id === e.defaultFemale)
      const m = e.presets.find((p) => p.id === e.defaultMale)
      expect(f?.gender, `${e.id}: defaultFemale`).toBe("female")
      expect(m?.gender, `${e.id}: defaultMale`).toBe("male")
    }
  })

  it("id голосов уникальны внутри движка", () => {
    for (const e of VOICE_CHANGE_ENGINES) {
      const ids = e.presets.map((p) => p.id)
      expect(new Set(ids).size, e.id).toBe(ids.length)
    }
  })

  it("ElevenLabs — напрямую, eleven_multilingual_sts_v2, по умолчанию Marina / Nikolay", () => {
    const e = getVoiceEngine("elevenlabs")!
    expect(e.provider).toBe("elevenlabs")
    expect(e.endpoint).toBe("eleven_multilingual_sts_v2")
    expect(e.dynamicVoices).toBe(true)
    expect(e.defaultFemale).toBe(MARINA)
    expect(e.defaultMale).toBe(NIKOLAY)
    expect(e.presets.find((p) => p.id === MARINA)?.label).toBe("Marina")
    expect(e.presets.find((p) => p.id === NIKOLAY)?.label).toBe("Nikolay")
    // в подборке только настоящие voice_id
    expect(e.presets.every((p) => isElevenLabsVoiceId(p.id))).toBe(true)
  })

  it("Chatterbox остаётся на fal", () => {
    const e = getVoiceEngine("chatterbox")!
    expect(e.provider).toBe("fal")
    expect(e.endpoint).toBe("resemble-ai/chatterboxhd/speech-to-speech")
  })

  it("поиск движка по model, включая старый endpoint fal у прежних задач", () => {
    expect(getVoiceEngineByEndpoint("eleven_multilingual_sts_v2")?.id).toBe("elevenlabs")
    expect(getVoiceEngineByEndpoint("fal-ai/elevenlabs/voice-changer")?.id).toBe("elevenlabs")
    expect(getVoiceEngineByEndpoint("resemble-ai/chatterboxhd/speech-to-speech")?.id).toBe("chatterbox")
    expect(getVoiceEngineByEndpoint("nope")).toBeNull()
  })

  it("подпись пресета с полом", () => {
    const e = getVoiceEngine("chatterbox")!
    expect(voicePresetTitle(e.presets.find((p) => p.id === "Richard")!)).toBe("Richard (мужской)")
  })
})

describe("оценка стоимости по режиму биллинга", () => {
  const eleven = getVoiceEngine("elevenlabs")!
  const chatter = getVoiceEngine("chatterbox")!

  it("ElevenLabs: $0.12/мин пропорционально длине", () => {
    expect(eleven.billing).toBe("prorated")
    expect(estimateVoiceChangeCost(eleven, 60)).toBeCloseTo(0.12, 6)
    expect(estimateVoiceChangeCost(eleven, 30)).toBeCloseTo(0.06, 6)
    expect(estimateVoiceChangeCost(eleven, 7)).toBeCloseTo(0.014, 6)
    expect(estimateVoiceChangeCost(eleven, 90)).toBeCloseTo(0.18, 6)
  })

  it("Chatterbox: $0.02 за каждую начатую минуту", () => {
    expect(chatter.billing).toBe("per_started_minute")
    expect(estimateVoiceChangeCost(chatter, 7)).toBeCloseTo(0.02, 6)
    expect(estimateVoiceChangeCost(chatter, 60)).toBeCloseTo(0.02, 6)
    expect(estimateVoiceChangeCost(chatter, 61)).toBeCloseTo(0.04, 6)
  })

  it("нулевая/битая длительность — 0", () => {
    expect(estimateVoiceChangeCost(eleven, 0)).toBe(0)
    expect(estimateVoiceChangeCost(chatter, Number.NaN)).toBe(0)
  })

  it("подписи цен", () => {
    expect(voicePriceLabel(eleven)).toBe("$0.12 за минуту")
    expect(voicePriceLabel(chatter)).toBe("$0.02 за начатую минуту")
  })
})

describe("голос: id, имя, настройки", () => {
  const eleven = getVoiceEngine("elevenlabs")!
  const chatter = getVoiceEngine("chatterbox")!

  it("voice_id ElevenLabs — ровно 20 латинских букв и цифр", () => {
    expect(isElevenLabsVoiceId(MARINA)).toBe(true)
    expect(isElevenLabsVoiceId("Jessica")).toBe(false)
    expect(isElevenLabsVoiceId(`${MARINA}x`)).toBe(false)
    expect(isElevenLabsVoiceId("ymDCYd8puC7gYjxIam/t")).toBe(false)
    expect(isElevenLabsVoiceId("../../../v1/user1234")).toBe(false)
    expect(isElevenLabsVoiceId(123)).toBe(false)
  })

  it("имя: без управляющих символов, пробелы схлопнуты, не длиннее 80", () => {
    expect(sanitizeVoiceName("  Marina\n\t Soft  ")).toBe("Marina Soft")
    expect(sanitizeVoiceName("a\u0000b​c")).toBe("a b c")
    expect(sanitizeVoiceName("x".repeat(200))).toHaveLength(80)
    expect(sanitizeVoiceName(42)).toBe("")
  })

  it("ElevenLabs: любой корректный voice_id с именем клиента", () => {
    expect(resolveVoice(eleven, "AbCdEfGhIjKlMnOpQrSt", "  Ivan ")).toEqual({ id: "AbCdEfGhIjKlMnOpQrSt", name: "Ivan" })
  })

  it("ElevenLabs: без имени — из подборки или общая подпись", () => {
    expect(resolveVoice(eleven, NIKOLAY).name).toBe("Nikolay")
    expect(resolveVoice(eleven, "AbCdEfGhIjKlMnOpQrSt").name).toBe("голос ElevenLabs")
  })

  it("ElevenLabs: старый пресет fal или мусор — Marina", () => {
    expect(resolveVoice(eleven, "Jessica")).toEqual({ id: MARINA, name: "Marina" })
    expect(resolveVoice(eleven, undefined, "Hack")).toEqual({ id: MARINA, name: "Marina" })
  })

  it("Chatterbox: только пресеты", () => {
    expect(resolveVoice(chatter, "Vicky")).toEqual({ id: "Vicky", name: "Vicky" })
    expect(resolveVoice(chatter, MARINA).id).toBe(chatter.presets[0].id)
  })

  it("настройки: по умолчанию при пустом вводе", () => {
    expect(sanitizeVoiceSettings(undefined)).toEqual(DEFAULT_VOICE_SETTINGS)
    expect(DEFAULT_VOICE_SETTINGS).toEqual({
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true,
      remove_background_noise: true,
    })
  })

  it("настройки: числа зажаты в [0,1] и округлены, мусор — по умолчанию", () => {
    expect(
      sanitizeVoiceSettings({
        stability: 1.7,
        similarity_boost: -3,
        style: 0.333333,
        use_speaker_boost: false,
        remove_background_noise: "yes",
        extra: "x",
      }),
    ).toEqual({
      stability: 1,
      similarity_boost: 0,
      style: 0.33,
      use_speaker_boost: false,
      remove_background_noise: true,
    })
    expect(sanitizeVoiceSettings({ stability: "0.9", style: Number.NaN })).toMatchObject({ stability: 0.5, style: 0 })
  })
})

describe("parseVoiceOver", () => {
  it("без запроса — исходный звук", () => {
    expect(parseVoiceOver(undefined)).toBeNull()
    expect(parseVoiceOver(null)).toBeNull()
    expect(parseVoiceOver("Brian")).toBeNull()
  })

  it("голос каталога с именем и настройками, движок всегда ElevenLabs", () => {
    expect(
      parseVoiceOver({ voice: NIKOLAY, voiceName: "Nikolay", settings: { stability: 0.3, remove_background_noise: false } }),
    ).toEqual({
      engine: AUTO_VOICE_ENGINE,
      voice: NIKOLAY,
      voice_name: "Nikolay",
      settings: { ...DEFAULT_VOICE_SETTINGS, stability: 0.3, remove_background_noise: false },
    })
  })

  it("неизвестный голос (в т.ч. старый «Jessica») — женский по умолчанию", () => {
    const e = getVoiceEngine(AUTO_VOICE_ENGINE)!
    expect(parseVoiceOver({ voice: "Jessica" })).toMatchObject({ engine: e.id, voice: e.defaultFemale, voice_name: "Marina" })
    expect(parseVoiceOver({})).toMatchObject({ voice: e.defaultFemale, settings: DEFAULT_VOICE_SETTINGS })
  })
})

describe("voice_over в params — запись/чтение", () => {
  it("заказанная, но ещё не запущенная — pending", () => {
    const params = { duration: 7, voice_over: { engine: "elevenlabs", voice: NIKOLAY, voice_name: "Nikolay" } }
    expect(voiceOverDto(readVoiceOver(params))).toEqual({ voice: NIKOLAY, voiceName: "Nikolay" })
  })

  it("запущенная читается по snake_case ключу generation_id", () => {
    const params = { voice_over: { engine: "elevenlabs", voice: NIKOLAY, voice_name: "Nikolay", generation_id: "g1" } }
    expect(voiceOverDto(readVoiceOver(params))).toEqual({
      voice: NIKOLAY,
      voiceName: "Nikolay",
      generationId: "g1",
      error: undefined,
    })
  })

  it("старая запись без voice_name — подпись = voice", () => {
    const params = { voice_over: { engine: "elevenlabs", voice: "Brian", generation_id: "g1" } }
    expect(voiceOverDto(readVoiceOver(params))?.voiceName).toBe("Brian")
  })

  it("ошибка запуска отдаётся клиенту", () => {
    const params = { voice_over: { engine: "elevenlabs", voice: "Brian", error: "нет ключа" } }
    expect(voiceOverDto(readVoiceOver(params))?.error).toBe("нет ключа")
  })

  it("без voice_over — undefined", () => {
    expect(voiceOverDto(readVoiceOver({ duration: 5 }))).toBeUndefined()
    expect(voiceOverDto(readVoiceOver(null))).toBeUndefined()
  })
})

describe("voicePreviewUrl", () => {
  it("у пресета с preview есть файл, у остальных null", () => {
    for (const engine of VOICE_CHANGE_ENGINES) {
      for (const preset of engine.presets) {
        const url = voicePreviewUrl(engine, preset.id)
        if (preset.preview) {
          expect(url, preset.id).not.toBeNull()
          expect(existsSync(join("public", url!)), url!).toBe(true)
        } else {
          expect(url, preset.id).toBeNull()
        }
      }
    }
  })

  it("у ElevenLabs статических превью нет (их отдаёт каталог), у Chatterbox есть у голосов по умолчанию", () => {
    const eleven = getVoiceEngine("elevenlabs")!
    expect(eleven.presets.some((p) => p.preview)).toBe(false)
    const chatter = getVoiceEngine("chatterbox")!
    expect(voicePreviewUrl(chatter, chatter.defaultFemale)).not.toBeNull()
    expect(voicePreviewUrl(chatter, chatter.defaultMale)).not.toBeNull()
  })

  it("в public нет файлов превью без пресета", () => {
    const expected = new Set(
      VOICE_CHANGE_ENGINES.flatMap((e) => e.presets.map((p) => voicePreviewUrl(e, p.id))).filter(Boolean),
    )
    for (const f of readdirSync(join("public", "voice-previews"))) {
      expect(expected.has(`/voice-previews/${f}`), f).toBe(true)
    }
  })
})
