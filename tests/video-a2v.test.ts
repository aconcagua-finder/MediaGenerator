import { describe, it, expect } from "vitest"
import { estimateVideoCost, getVideoModel, modelsForMode } from "@/lib/providers/video-models"
import { A2V_MAX_AUDIO_SECONDS, A2V_MIN_AUDIO_SECONDS, a2vDurationSeconds } from "@/lib/video/source-limits"

describe("режим «картинка + звук → видео»", () => {
  it("длина видео по дорожке: вверх до целых, в рамках модели", () => {
    expect(a2vDurationSeconds(5)).toBe(5)
    expect(a2vDurationSeconds(5.038)).toBe(5)
    expect(a2vDurationSeconds(5.4)).toBe(6)
    expect(a2vDurationSeconds(1.97)).toBe(A2V_MIN_AUDIO_SECONDS)
    expect(a2vDurationSeconds(15.04)).toBe(A2V_MAX_AUDIO_SECONDS)
  })

  it("каждая возможная длина есть среди длительностей модели", () => {
    const m = getVideoModel("fal-ai/wan/v2.7/image-to-video")!
    for (let s = A2V_MIN_AUDIO_SECONDS; s <= A2V_MAX_AUDIO_SECONDS; s++) expect(m.durations).toContain(s)
  })

  it("цена по разрешению за секунду результата", () => {
    const m = getVideoModel("fal-ai/wan/v2.7/image-to-video")!
    expect(estimateVideoCost(m, { durationSeconds: 6, resolution: "720p" })).toBeCloseTo(0.6)
    expect(estimateVideoCost(m, { durationSeconds: 6, resolution: "1080p" })).toBeCloseTo(0.9)
  })

  it("модель видна только в своём режиме и только с ключом fal", () => {
    const id = "fal-ai/wan/v2.7/image-to-video"
    expect(modelsForMode("a2v", { hasFalKey: true }).map((m) => m.id)).toEqual([id])
    expect(modelsForMode("a2v", { hasFalKey: false })).toEqual([])
    expect(modelsForMode("generate", { hasFalKey: true }).some((m) => m.id === id)).toBe(false)
    expect(modelsForMode("v2v", { hasFalKey: true }).some((m) => m.id === id)).toBe(false)
  })
})
