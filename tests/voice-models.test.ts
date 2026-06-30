import { describe, it, expect } from "vitest"
import {
  VOICE_MODELS,
  DEFAULT_VOICE_MODEL,
  getVoiceModel,
  isValidVoice,
  resolveVoice,
  clampSpeed,
  estimateVoiceCost,
} from "@/lib/providers/voice-models"

describe("voice-models — реестр", () => {
  it("у каждой модели дефолтный голос присутствует в списке голосов", () => {
    for (const m of VOICE_MODELS) {
      expect(m.voices.length, m.id).toBeGreaterThan(0)
      expect(isValidVoice(m, m.defaultVoice), `${m.id}: defaultVoice`).toBe(true)
    }
  })

  it("дефолтная модель существует и доступна", () => {
    const m = getVoiceModel(DEFAULT_VOICE_MODEL)
    expect(m).toBeTruthy()
    expect(m!.available).toBe(true)
  })

  it("id моделей уникальны", () => {
    const ids = VOICE_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("pcm-модели отдают wav, mp3-модели — mp3", () => {
    for (const m of VOICE_MODELS) {
      if (m.requestFormat === "pcm") expect(m.outputFormat, m.id).toBe("wav")
      else expect(m.outputFormat, m.id).toBe("mp3")
    }
  })

  it("Voxtral помечена недоступной", () => {
    expect(getVoiceModel("mistralai/voxtral-mini-tts-2603")!.available).toBe(false)
  })

  it("русскоязычные модели присутствуют (mai-voice-2, gemini, grok)", () => {
    const good = VOICE_MODELS.filter((m) => m.russianSpeech === "good").map((m) => m.id)
    expect(good).toContain("microsoft/mai-voice-2")
    expect(good).toContain("google/gemini-3.1-flash-tts-preview")
    expect(good).toContain("x-ai/grok-voice-tts-1.0")
  })
})

describe("voice-models — санитизация", () => {
  const mai = getVoiceModel("microsoft/mai-voice-2")!
  const kokoro = getVoiceModel("hexgrad/kokoro-82m")!

  it("resolveVoice возвращает дефолт для невалидного голоса", () => {
    expect(resolveVoice(mai, "несуществующий")).toBe(mai.defaultVoice)
    expect(resolveVoice(mai, "ru-RU-Lev:MAI-Voice-2")).toBe("ru-RU-Lev:MAI-Voice-2")
    expect(resolveVoice(mai, undefined)).toBe(mai.defaultVoice)
  })

  it("clampSpeed зажимает в диапазон, 1 для моделей без скорости", () => {
    expect(clampSpeed(mai, 5)).toBe(2) // верхняя граница
    expect(clampSpeed(mai, 0.1)).toBe(0.5) // нижняя граница
    expect(clampSpeed(mai, 1.25)).toBe(1.25)
    expect(clampSpeed(kokoro, 1.5)).toBe(1) // не поддерживает скорость
    expect(clampSpeed(mai, undefined)).toBe(1)
  })
})

describe("voice-models — оценка стоимости", () => {
  it("estimateVoiceCost = символы/1000 × ценаЗа1к", () => {
    const grok = getVoiceModel("x-ai/grok-voice-tts-1.0")! // 0.015 / 1к
    expect(estimateVoiceCost(grok, 1000)).toBeCloseTo(0.015, 6)
    expect(estimateVoiceCost(grok, 500)).toBeCloseTo(0.0075, 6)
    expect(estimateVoiceCost(grok, 0)).toBe(0)
  })

  it("отрицательные символы не дают отрицательную стоимость", () => {
    const grok = getVoiceModel("x-ai/grok-voice-tts-1.0")!
    expect(estimateVoiceCost(grok, -100)).toBe(0)
  })
})
