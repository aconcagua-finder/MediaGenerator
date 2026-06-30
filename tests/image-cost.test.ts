import { describe, it, expect } from "vitest"
import { calculateCost } from "@/lib/utils/cost-calculator"

describe("cost-calculator — Nano Banana 2 / 2 Lite (openrouter)", () => {
  it("Nano Banana 2 (flash) — цена зависит от размера", () => {
    expect(calculateCost("openrouter", "google/gemini-3.1-flash-image", { image_size: "1K" }, 1)).toBeCloseTo(0.067, 6)
    expect(calculateCost("openrouter", "google/gemini-3.1-flash-image", { image_size: "4K" }, 1)).toBeCloseTo(0.151, 6)
    // дефолт без размера → 1K
    expect(calculateCost("openrouter", "google/gemini-3.1-flash-image", {}, 1)).toBeCloseTo(0.067, 6)
  })

  it("Nano Banana 2 Lite — примерно вдвое дешевле flash", () => {
    expect(calculateCost("openrouter", "google/gemini-3.1-flash-lite-image", { image_size: "1K" }, 1)).toBeCloseTo(0.034, 6)
    expect(calculateCost("openrouter", "google/gemini-3.1-flash-lite-image", { image_size: "4K" }, 1)).toBeCloseTo(0.076, 6)
  })

  it("Lite не перехватывается веткой flash (подстрока flash-image НЕ входит в flash-lite-image)", () => {
    const lite = calculateCost("openrouter", "google/gemini-3.1-flash-lite-image", { image_size: "1K" }, 1)
    const flash = calculateCost("openrouter", "google/gemini-3.1-flash-image", { image_size: "1K" }, 1)
    expect(lite).toBeLessThan(flash)
  })

  it("count умножает стоимость", () => {
    expect(calculateCost("openrouter", "google/gemini-3.1-flash-image", { image_size: "1K" }, 3)).toBeCloseTo(0.201, 6)
  })
})
