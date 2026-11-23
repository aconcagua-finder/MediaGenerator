import { describe, it, expect } from "vitest"
import { TEXT_MODELS, VENDOR_COLORS, getTextModel } from "@/lib/providers/text-models"

describe("реестр текстовых моделей", () => {
  it("id уникальны, у каждого вендора есть цвет", () => {
    const ids = TEXT_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of TEXT_MODELS) {
      expect(VENDOR_COLORS[m.vendor], `${m.id}: нет цвета вендора ${m.vendor}`).toBeDefined()
      expect(m.pricing.input).toBeGreaterThan(0)
      expect(m.pricing.output).toBeGreaterThan(0)
    }
  })

  it("свежие флагманы (октябрь 2026) на месте с ценами OpenRouter", () => {
    expect(getTextModel("openai/gpt-6.1-sol")?.pricing).toEqual({ input: 2.0, output: 10.0 })
    expect(getTextModel("openai/gpt-6.1-terra")?.pricing).toEqual({ input: 1.0, output: 5.0 })
    expect(getTextModel("openai/gpt-6-astra")?.pricing).toEqual({ input: 10.0, output: 50.0 })
    expect(getTextModel("openai/gpt-6-luna")?.pricing).toEqual({ input: 0.1, output: 0.5 })
    expect(getTextModel("anthropic/claude-fable-5.1")?.pricing).toEqual({ input: 10.0, output: 50.0 })
    expect(getTextModel("google/gemini-3.8-flash")?.pricing).toEqual({ input: 0.825, output: 4.125 })
    expect(getTextModel("google/gemini-4-argon")?.pricing).toEqual({ input: 2.0, output: 10.0 })
    expect(getTextModel("x-ai/grok-4.7")?.pricing).toEqual({ input: 2.0, output: 6.0 })
    expect(getTextModel("qwen/qwen3.8-max-0902")?.vendor).toBe("qwen")
  })

  it("новые модели W47 с ценами живого /models и vision", async () => {
    const { supportsVision } = await import("@/lib/capabilities")
    const expected: Record<string, { input: number; output: number }> = {
      "anthropic/claude-fable-5.2": { input: 8.0, output: 40.0 },
      "google/gemini-4-carbon": { input: 2.0, output: 10.0 },
      "google/gemini-4-hydrogen": { input: 1.5, output: 7.5 },
      "qwen/qwen4-max": { input: 1.425, output: 4.275 },
    }
    for (const [id, pricing] of Object.entries(expected)) {
      expect(getTextModel(id)?.pricing, id).toEqual(pricing)
      expect(supportsVision(id), id).toBe(true)
    }
  })

  it("новые модели W48 с ценами живого /models и vision", async () => {
    const { supportsVision } = await import("@/lib/capabilities")
    const expected: Record<string, { input: number; output: number }> = {
      "openai/gpt-6.2-sol": { input: 2.0, output: 10.0 },
      "openai/gpt-6.2-astra": { input: 8.0, output: 40.0 },
      "google/gemini-4-neon": { input: 3.0, output: 15.0 },
    }
    for (const [id, pricing] of Object.entries(expected)) {
      expect(getTextModel(id)?.pricing, id).toEqual(pricing)
      expect(supportsVision(id), id).toBe(true)
    }
  })
})
