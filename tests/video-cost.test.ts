import { describe, it, expect } from "vitest"
import {
  VIDEO_MODELS,
  getVideoModel,
  estimateVideoCost,
  videoPricePerSecond,
  videoPriceFrom,
  defaultVideoParams,
} from "@/lib/providers/video-models"

/**
 * Оценка стоимости видео должна учитывать разрешение и звук.
 * Опорные значения выведены из живых `pricing_skus` OpenRouter (сверка усилий = W34):
 *   Seedance 2.0, 4с, 720p  → $0.6048  (video_tokens $0.000007, база не менялась)
 *   Seedance 2.0, 4с, 1080p → $1.4968  (W34: поресольюшн-тариф 1080p $0.0000077)
 *   Seedance 2.0, 4с, 4K    → $3.1104  (W34: 4K $0.000004 — подешевел почти вдвое)
 */
describe("оценка стоимости видео", () => {
  const seedance = getVideoModel("bytedance/seedance-2.0")!

  it("Seedance 2.0 — совпадает с фактическим списанием OpenRouter", () => {
    expect(
      estimateVideoCost(seedance, { durationSeconds: 4, resolution: "1080p", audio: true })
    ).toBeCloseTo(1.4968, 4)
    expect(
      estimateVideoCost(seedance, { durationSeconds: 4, resolution: "720p", audio: true })
    ).toBeCloseTo(0.6048, 4)
  })

  it("разрешение реально масштабирует цену (1080p ≈ 5.5× от 480p)", () => {
    const at480 = videoPricePerSecond(seedance, "480p")
    const at1080 = videoPricePerSecond(seedance, "1080p")
    expect(at1080 / at480).toBeCloseTo(5.56, 1)
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
    expect(perSec).toBeCloseTo(0.7776, 4) // 4K — самый дорогой тариф (W34: $0.000004/токен)
  })

  /**
   * Grok Imagine Video 1.5 — первая i2v-ONLY модель в реестре и первая с пустым
   * списком aspectRatios (OpenRouter отдаёт supported_aspect_ratios: null —
   * формат наследуется от стартового кадра). Пустой список должен приводить к
   * тому, что aspect_ratio вообще НЕ уходит в API, а не к undefined-строке.
   */
  it("Grok Imagine Video 1.5 — i2v-only, aspect_ratio не отправляется", () => {
    const grok15 = getVideoModel("x-ai/grok-imagine-video-1.5")!
    expect(grok15.modes).toEqual(["i2v"])
    expect(grok15.modes).not.toContain("t2v")
    expect(grok15.aspectRatios).toEqual([])

    const params = defaultVideoParams(grok15)
    expect(params.aspect_ratio).toBeUndefined()
    // адаптер шлёт поле только если оно truthy — проверяем именно это условие
    expect(Boolean(params.aspect_ratio)).toBe(false)
    expect(params.generate_audio).toBe(false)

    // цена по SKU OpenRouter: 720p $0.14/сек
    expect(estimateVideoCost(grok15, { durationSeconds: 5, resolution: "720p" })).toBeCloseTo(0.7, 4)
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
