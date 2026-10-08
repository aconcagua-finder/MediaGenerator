import { describe, it, expect } from "vitest"
import {
  VOICE_CHANGE_ENGINES,
  AUTO_VOICE_ENGINE,
  getVoiceEngine,
  parseVoiceOver,
  voicePresetTitle,
  buildVoiceChangeInput,
} from "@/lib/providers/voice-change-models"
import { readVoiceOver, voiceOverDto } from "@/lib/video/voice-over"

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

  it("у ElevenLabs полный набор голосов fal (21)", () => {
    expect(getVoiceEngine("elevenlabs")!.presets).toHaveLength(21)
  })

  it("подпись голоса с полом", () => {
    const e = getVoiceEngine("elevenlabs")!
    expect(voicePresetTitle(e.presets.find((p) => p.id === "Brian")!)).toBe("Brian (мужской)")
  })
})

describe("parseVoiceOver", () => {
  it("без запроса — исходный звук", () => {
    expect(parseVoiceOver(undefined)).toBeNull()
    expect(parseVoiceOver(null)).toBeNull()
    expect(parseVoiceOver("Brian")).toBeNull()
  })

  it("валидный голос проходит, движок всегда ElevenLabs", () => {
    expect(parseVoiceOver({ voice: "Brian" })).toEqual({ engine: AUTO_VOICE_ENGINE, voice: "Brian" })
  })

  it("неизвестный голос — женский по умолчанию", () => {
    const e = getVoiceEngine(AUTO_VOICE_ENGINE)!
    expect(parseVoiceOver({ voice: "Nope" })).toEqual({ engine: e.id, voice: e.defaultFemale })
    expect(parseVoiceOver({})).toEqual({ engine: e.id, voice: e.defaultFemale })
  })

  it("голос уходит в тело запроса fal", () => {
    const e = getVoiceEngine("elevenlabs")!
    const input = buildVoiceChangeInput({ engine: e, audioUrl: "https://x.test/a.mp3", presetId: "Jessica" })
    expect(input.voice).toBe("Jessica")
  })
})

describe("voice_over в params — запись/чтение", () => {
  it("заказанная, но ещё не запущенная — pending", () => {
    const params = { duration: 7, voice_over: { engine: "elevenlabs", voice: "Brian" } }
    expect(voiceOverDto(readVoiceOver(params))).toEqual({ voice: "Brian" })
  })

  it("запущенная читается по snake_case ключу generation_id", () => {
    const params = { voice_over: { engine: "elevenlabs", voice: "Brian", generation_id: "g1" } }
    expect(voiceOverDto(readVoiceOver(params))).toEqual({ voice: "Brian", generationId: "g1", error: undefined })
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
