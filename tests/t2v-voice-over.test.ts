import { describe, it, expect } from "vitest"
import {
  AUTO_VOICE_OVER_MODES,
  DEFAULT_VOICE_SETTINGS,
  defaultVoiceSettingsFor,
  estimateVoiceChangeCost,
  getVoiceEngine,
  parseVoiceOver,
  sanitizeVoiceSettings,
  supportsAutoVoiceOver,
  voiceSourceKindForMode,
} from "@/lib/providers/voice-change-models"
import { VIDEO_MODELS, estimateVideoCost, getVideoModel, modelProducesAudio } from "@/lib/providers/video-models"
import { requestedAutoVoiceOver } from "@/lib/video/voice-over"
import { estimateGenerationCost } from "@/lib/video/estimate"

const MARINA = "ymDCYd8puC7gYjxIamPt"

describe("автопереозвучка: настройки по умолчанию по режиму", () => {
  it("сгенерированный звук (t2v/i2v) — без чистки фона, остальное — эталон заказчика", () => {
    expect(defaultVoiceSettingsFor("generated")).toEqual({
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true,
      remove_background_noise: false,
    })
  })

  it("запись (v2v, ручная замена голоса) — с чисткой фона, как раньше", () => {
    expect(defaultVoiceSettingsFor("recording")).toEqual(DEFAULT_VOICE_SETTINGS)
    expect(defaultVoiceSettingsFor("recording").remove_background_noise).toBe(true)
  })

  it("умолчания не общий объект: правка одного не меняет другой", () => {
    const g = defaultVoiceSettingsFor("generated")
    g.stability = 0.1
    expect(defaultVoiceSettingsFor("generated").stability).toBe(0.5)
    expect(DEFAULT_VOICE_SETTINGS.stability).toBe(0.5)
  })

  it("режим → происхождение звука", () => {
    expect(voiceSourceKindForMode("v2v")).toBe("recording")
    expect(voiceSourceKindForMode("t2v")).toBe("generated")
    expect(voiceSourceKindForMode("i2v")).toBe("generated")
  })

  it("санитизация берёт умолчания режима для незаданных полей", () => {
    expect(sanitizeVoiceSettings({ stability: 0.3 }, defaultVoiceSettingsFor("generated"))).toMatchObject({
      stability: 0.3,
      remove_background_noise: false,
    })
    expect(sanitizeVoiceSettings({ stability: 0.3 }).remove_background_noise).toBe(true)
  })
})

describe("parseVoiceOver по режиму", () => {
  it("t2v/i2v без настроек — без чистки фона; явный выбор пользователя сохраняется", () => {
    expect(parseVoiceOver({ voice: MARINA }, "t2v")?.settings.remove_background_noise).toBe(false)
    expect(parseVoiceOver({ voice: MARINA }, "i2v")?.settings.remove_background_noise).toBe(false)
    expect(
      parseVoiceOver({ voice: MARINA, settings: { remove_background_noise: true } }, "t2v")?.settings.remove_background_noise,
    ).toBe(true)
  })

  it("v2v (и вызов без режима) — с чисткой фона", () => {
    expect(parseVoiceOver({ voice: MARINA }, "v2v")?.settings.remove_background_noise).toBe(true)
    expect(parseVoiceOver({ voice: MARINA })?.settings.remove_background_noise).toBe(true)
  })

  it("без запроса — исходный звук", () => {
    expect(parseVoiceOver(undefined, "t2v")).toBeNull()
  })
})

describe("finalize: когда запускать автопереозвучку", () => {
  const params = { duration: 8, generate_audio: true, voice_over: { engine: "elevenlabs", voice: MARINA, voice_name: "Marina" } }

  it("v2v, t2v и i2v с заказанной переозвучкой — да", () => {
    expect([...AUTO_VOICE_OVER_MODES]).toEqual(["v2v", "t2v", "i2v"])
    for (const mode of ["v2v", "t2v", "i2v"]) {
      expect(supportsAutoVoiceOver(mode)).toBe(true)
      expect(requestedAutoVoiceOver(mode, params)).toMatchObject({ voice: MARINA, voice_name: "Marina" })
    }
  })

  it("сама замена голоса и задачи без заказа — нет", () => {
    expect(supportsAutoVoiceOver("voice")).toBe(false)
    expect(requestedAutoVoiceOver("voice", params)).toBeNull()
    expect(requestedAutoVoiceOver("t2v", { duration: 8 })).toBeNull()
    expect(requestedAutoVoiceOver("t2v", null)).toBeNull()
  })
})

describe("у кого есть звук для переозвучки", () => {
  it("модель с переключателем — только при «Со звуком»", () => {
    const veo = getVideoModel("google/veo-3.1-fast")!
    expect(veo.supportsAudio).toBe(true)
    expect(modelProducesAudio(veo, true)).toBe(true)
    expect(modelProducesAudio(veo, false)).toBe(false)
  })

  it("модель со встроенным звуком — всегда, без звука — никогда", () => {
    const builtIn = VIDEO_MODELS.find((m) => !m.supportsAudio && m.builtInAudio)
    if (builtIn) expect(modelProducesAudio(builtIn, false)).toBe(true)
    const silent = VIDEO_MODELS.find((m) => !m.supportsAudio && !m.builtInAudio)!
    expect(modelProducesAudio(silent, true)).toBe(false)
  })
})

describe("оценка генерации с переозвучкой", () => {
  it("видео + замена голоса на заказанную длительность", () => {
    const veo = getVideoModel("google/veo-3.1-fast")!
    const video = estimateVideoCost(veo, { durationSeconds: 8, resolution: "720p", audio: true })
    const vo = estimateVoiceChangeCost(getVoiceEngine("elevenlabs")!, 8)
    const est = estimateGenerationCost(veo, { durationSeconds: 8, resolution: "720p", audio: true, voiceOver: true })
    expect(est.video).toBeCloseTo(video, 6)
    expect(est.voiceOver).toBeCloseTo(vo, 6)
    expect(est.voiceOver).toBeCloseTo(0.016, 6) // 8 сек × $0.12/мин
    expect(est.total).toBeCloseTo(video + vo, 6)
  })

  it("без переозвучки — только видео", () => {
    const veo = getVideoModel("google/veo-3.1-fast")!
    const est = estimateGenerationCost(veo, { durationSeconds: 8, resolution: "720p", audio: true, voiceOver: false })
    expect(est.voiceOver).toBe(0)
    expect(est.total).toBeCloseTo(est.video, 6)
  })
})
