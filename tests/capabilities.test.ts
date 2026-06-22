import { describe, it, expect } from "vitest"
import {
  supportsVision,
  supportsImageInput,
  resolveEditTarget,
  VISION_TEXT_MODELS,
  IMAGE_INPUT_MODELS,
} from "@/lib/capabilities"
import { TEXT_MODELS } from "@/lib/providers/text-models"

describe("capabilities — vision", () => {
  it("supportsVision возвращает true для известных vision-моделей", () => {
    expect(supportsVision("anthropic/claude-sonnet-4.6")).toBe(true)
    expect(supportsVision("openai/gpt-5.4")).toBe(true)
    expect(supportsVision("google/gemini-3-flash-preview")).toBe(true)
    expect(supportsVision("x-ai/grok-4.3")).toBe(true)
  })

  it("supportsVision возвращает false для моделей без vision", () => {
    expect(supportsVision("deepseek/deepseek-v4-pro")).toBe(false)
    expect(supportsVision("nonexistent/model")).toBe(false)
  })

  it("VISION_TEXT_MODELS синхронизирован с supportsVision-флагом в TEXT_MODELS", () => {
    // Если модель помечена в TEXT_MODELS как supportsVision: true,
    // она должна быть и в наборе capability-карты — иначе UI и backend
    // разойдутся по поводу что показывать и что разрешать.
    for (const model of TEXT_MODELS) {
      if (model.supportsVision) {
        expect(
          VISION_TEXT_MODELS.has(model.id),
          `model ${model.id} marked supportsVision but not in VISION_TEXT_MODELS`
        ).toBe(true)
      }
    }
    // Обратная проверка: всё, что в карте, должно быть в TEXT_MODELS
    for (const id of VISION_TEXT_MODELS) {
      const m = TEXT_MODELS.find((x) => x.id === id)
      expect(m, `${id} в VISION_TEXT_MODELS, но нет в TEXT_MODELS`).toBeDefined()
      expect(m?.supportsVision, `${id} в карте, но supportsVision не выставлен`).toBe(true)
    }
  })
})

describe("capabilities — image input", () => {
  it("supportsImageInput работает для OpenAI gpt-image-*", () => {
    expect(supportsImageInput("openai", "gpt-image-2")).toBe(true)
    expect(supportsImageInput("openai", "gpt-image-1.5")).toBe(true)
    expect(supportsImageInput("openai", "gpt-image-1-mini")).toBe(true)
  })

  it("supportsImageInput работает для OpenRouter Nano Banana и GPT-image", () => {
    expect(supportsImageInput("openrouter", "google/gemini-3.1-flash-image")).toBe(true)
    expect(supportsImageInput("openrouter", "openai/gpt-5-image")).toBe(true)
  })

  it("supportsImageInput false для моделей без image-input", () => {
    expect(supportsImageInput("xai", "grok-imagine-image")).toBe(false)
    expect(supportsImageInput("bfl", "flux-pro-1.1")).toBe(false)
    expect(supportsImageInput("nonexistent", "model")).toBe(false)
  })

  it("resolveEditTarget возвращает provider/model или null", () => {
    expect(resolveEditTarget("openai", "gpt-image-2")).toEqual({
      provider: "openai",
      model: "gpt-image-2",
    })
    expect(resolveEditTarget("xai", "grok-imagine-image")).toBeNull()
  })

  it("IMAGE_INPUT_MODELS не имеет пустых провайдеров", () => {
    for (const [provider, list] of Object.entries(IMAGE_INPUT_MODELS)) {
      expect(list.length, `${provider} имеет пустой список`).toBeGreaterThan(0)
    }
  })
})
