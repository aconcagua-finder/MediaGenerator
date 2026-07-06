import { describe, it, expect } from "vitest"
import {
  VIDEO_MODELS,
  getVideoModel,
  estimateVideoCost,
  videoPricePerSecond,
  videoPriceFrom,
} from "@/lib/providers/video-models"

/**
 * Оценка стоимости видео должна учитывать разрешение и звук.
 * Опорные значения сверены с фактическими списаниями OpenRouter (`usage.cost`):
 *   Seedance 2.0, 4с, 1080p → $1.3608  (реальная генерация)
 *   Seedance 2.0, 4с, 720p  → $0.6048  (реальная генерация)
 */
describe("оценка стоимости видео", () => {
  const seedance = getVideoModel("bytedance/seedance-2.0")!

  it("Seedance 2.0 — совпадает с фактическим списанием OpenRouter", () => {
    expect(
      estimateVideoCost(seedance, { durationSeconds: 4, resolution: "1080p", audio: true })
    ).toBeCloseTo(1.3608, 4)
    expect(
      estimateVideoCost(seedance, { durationSeconds: 4, resolution: "720p", audio: true })
    ).toBeCloseTo(0.6048, 4)
  })

  it("разрешение реально масштабирует цену (1080p ≈ 5× от 480p)", () => {
    const at480 = videoPricePerSecond(seedance, "480p")
    const at1080 = videoPricePerSecond(seedance, "1080p")
    expect(at1080 / at480).toBeCloseTo(5.06, 1)
  })

  it("у Seedance 2.0 звук бесплатный — цена не меняется", () => {
    const withAudio = estimateVideoCost(seedance, { durationSeconds: 4, resolution: "1080p", audio: true })
    const noAudio = estimateVideoCost(seedance, { durationSeconds: 4, resolution: "1080p", audio: false })
    expect(withAudio).toBeCloseTo(noAudio, 4)
  })

  it("Veo 3.1 — звук почти удваивает цену", () => {
    const veo = getVideoModel("google/veo-3.1")!
    const withAudio = estimateVideoCost(veo, { durationSeconds: 8, resolution: "1080p", audio: true })
    const noAudio = estimateVideoCost(veo, { durationSeconds: 8, resolution: "1080p", audio: false })
    expect(withAudio).toBeCloseTo(3.2, 4) // 0.40 × 8
    expect(noAudio).toBeCloseTo(1.6, 4) // 0.20 × 8
  })

  it("Kling 3.0 Pro — звук +50%, разрешение не влияет", () => {
    const kling = getVideoModel("kwaivgi/kling-v3.0-pro")!
    expect(estimateVideoCost(kling, { durationSeconds: 5, resolution: "720p", audio: true })).toBeCloseTo(0.84, 4)
    expect(estimateVideoCost(kling, { durationSeconds: 5, resolution: "720p", audio: false })).toBeCloseTo(0.56, 4)
  })

  it("videoPriceFrom — минимальная цена среди разрешений (для «от $X/сек»)", () => {
    expect(videoPriceFrom(seedance)).toBeCloseTo(0.0673, 4) // 480p — самое дешёвое
  })

  it("без разрешения оценка консервативна (берёт максимум, не занижает)", () => {
    const perSec = videoPricePerSecond(seedance) // без resolution
    expect(perSec).toBeCloseTo(1.3608, 4) // 4K — самый дорогой тариф
  })

  it("каждая модель: у каждого поддерживаемого разрешения есть цена", () => {
    for (const m of VIDEO_MODELS) {
      for (const res of m.resolutions) {
        expect(m.price.perSecond[res], `${m.id} нет цены для ${res}`).toBeGreaterThan(0)
      }
      // если у модели есть звук-таблица, она покрывает те же разрешения
      if (m.price.perSecondAudio) {
        for (const res of m.resolutions) {
          expect(m.price.perSecondAudio[res], `${m.id} нет звук-цены для ${res}`).toBeGreaterThan(0)
        }
      }
    }
  })
})
