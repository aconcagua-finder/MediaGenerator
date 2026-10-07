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
    expect(getTextModel("openai/gpt-6-astra")?.pricing).toEqual({ input: 10.0, output: 50.0 })
    expect(getTextModel("openai/gpt-6-luna")?.pricing).toEqual({ input: 0.1, output: 0.5 })
    expect(getTextModel("anthropic/claude-fable-5.1")?.pricing).toEqual({ input: 10.0, output: 50.0 })
    expect(getTextModel("google/gemini-3.8-flash")?.pricing).toEqual({ input: 0.75, output: 3.75 })
    expect(getTextModel("x-ai/grok-4.7")?.pricing).toEqual({ input: 2.0, output: 6.0 })
    expect(getTextModel("qwen/qwen3.8-max-0902")?.vendor).toBe("qwen")
  })
})
