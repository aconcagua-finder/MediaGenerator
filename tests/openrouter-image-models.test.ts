import { describe, it, expect } from "vitest"
import { SEED_MODELS } from "@/lib/providers/seed-models"
import {
  OPENROUTER_IMAGE_SPECS,
  getOpenRouterImageSpec,
  openRouterImagePrice,
} from "@/lib/providers/openrouter-image-models"
import { supportsImageInput } from "@/lib/capabilities"
import { NEW_IMAGE_MODELS } from "@/lib/providers/registry"
import { calculateCost } from "@/lib/utils/cost-calculator"

describe("реестр image-моделей OpenRouter (Images API)", () => {
  it("id уникальны и не дублируют прямые провайдеры", () => {
    const ids = OPENROUTER_IMAGE_SPECS.map((s) => s.modelId)
    expect(new Set(ids).size).toBe(ids.length)
    // эти модели уже есть напрямую (openai / xai / bfl / recraft) — дублей на OpenRouter быть не должно
    for (const dup of [
      "openai/gpt-image-2",
      "openai/gpt-image-1",
      "openai/gpt-image-1-mini",
      "x-ai/grok-imagine-image-quality",
      "black-forest-labs/flux.2-klein-4b",
      "recraft/recraft-v3",
    ]) {
      expect(ids).not.toContain(dup)
    }
    expect(ids.filter((id) => id.endsWith("-preview") && !id.startsWith("tencent/"))).toEqual([])
    expect(ids.filter((id) => id.startsWith("openrouter/"))).toEqual([])
  })

  it("модели, требующие входную картинку, не добавлены (generate-only UI их не вызовет)", () => {
    const ids = OPENROUTER_IMAGE_SPECS.map((s) => s.modelId)
    expect(ids.filter((id) => /recraft-v4(-pro)?-styles|-styles-/.test(id))).toEqual([])
    expect(ids).not.toContain("inclusionai/ming-image-0.1-design-layer")
  })

  it("все новые модели попадают в SEED_MODELS с корректной схемой параметров", () => {
    for (const spec of OPENROUTER_IMAGE_SPECS) {
      const seed = SEED_MODELS.find((m) => m.provider === "openrouter" && m.modelId === spec.modelId)
      expect(seed, `${spec.modelId} нет в SEED_MODELS`).toBeDefined()
      const schema = seed!.paramsSchema as Record<string, { options: string[]; default: string }>
      for (const [key, def] of Object.entries(schema)) {
        expect(def.options, `${spec.modelId}.${key}`).toContain(def.default)
      }
      expect(Object.keys(schema).includes("aspect_ratio")).toBe(spec.aspects.length > 0)
      expect(Object.keys(schema).includes("image_size")).toBe(spec.sizes.length > 0)
    }
  })

  it("в SEED_MODELS нет дублей provider+modelId", () => {
    const keys = SEED_MODELS.map((m) => `${m.provider}:${m.modelId}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("цены неотрицательны, а у tier-цен покрыты все размеры", () => {
    for (const spec of OPENROUTER_IMAGE_SPECS) {
      if ("perImage" in spec.price) {
        expect(spec.price.perImage).toBeGreaterThanOrEqual(0)
      } else {
        for (const size of spec.sizes) {
          expect(spec.price.bySize[size], `${spec.modelId} нет цены для ${size}`).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it("правка: image-input моделям открыта, text-only (Flash, Ming Design) — нет", () => {
    expect(supportsImageInput("openrouter", "black-forest-labs/flux-3-image")).toBe(true)
    expect(supportsImageInput("openrouter", "bytedance-seed/seedream-5-0-lite")).toBe(true)
    expect(supportsImageInput("openrouter", "recraft/recraft-v4.1-flash")).toBe(false)
    expect(supportsImageInput("openrouter", "inclusionai/ming-image-0.1-design")).toBe(false)
  })

  it("новые модели помечены «Новинка»", () => {
    for (const spec of OPENROUTER_IMAGE_SPECS) {
      expect(NEW_IMAGE_MODELS.has(`openrouter:${spec.modelId}`)).toBe(true)
    }
  })
})

describe("стоимость новых image-моделей OpenRouter", () => {
  it("плоская цена за изображение и умножение на count", () => {
    expect(calculateCost("openrouter", "bytedance-seed/seedream-5-0-lite", { image_size: "2K" }, 1)).toBeCloseTo(0.035, 6)
    expect(calculateCost("openrouter", "bytedance-seed/seedream-5-0-flash", {}, 3)).toBeCloseTo(0.054, 6)
    expect(calculateCost("openrouter", "recraft/recraft-v4.1-flash", {}, 2)).toBeCloseTo(0.014, 6)
  })

  it("цена по tier разрешения (FLUX.3, Qwen Pro, Riverflow Pro)", () => {
    expect(calculateCost("openrouter", "black-forest-labs/flux-3-image", { image_size: "1K" }, 1)).toBeCloseTo(0.048, 6)
    expect(calculateCost("openrouter", "black-forest-labs/flux-3-image", { image_size: "4K" }, 1)).toBeCloseTo(0.607, 6)
    expect(calculateCost("openrouter", "qwen/qwen-image-3-pro", { image_size: "2K" }, 1)).toBeCloseTo(0.075, 6)
    expect(calculateCost("openrouter", "sourceful/riverflow-v2-pro", { image_size: "4K" }, 1)).toBeCloseTo(0.33, 6)
  })

  it("без размера берётся размер по умолчанию, а неизвестный tier — максимум (не занижаем)", () => {
    expect(openRouterImagePrice("black-forest-labs/flux-3-image")).toBeCloseTo(0.048, 6)
    expect(openRouterImagePrice("black-forest-labs/flux-3-image", "8K")).toBeCloseTo(0.607, 6)
  })

  it("бесплатная модель стоит 0", () => {
    expect(calculateCost("openrouter", "inclusionai/ming-image-0.1-design", {}, 4)).toBe(0)
  })

  it("FLUX.3 не перехватывается веткой «flux» старых FLUX.2", () => {
    expect(getOpenRouterImageSpec("black-forest-labs/flux-3-image")).not.toBeNull()
    expect(calculateCost("openrouter", "black-forest-labs/flux-3-image", { image_size: "2K" }, 1)).toBeCloseTo(0.1, 6)
    // старые модели считаются по-прежнему
    expect(calculateCost("openrouter", "black-forest-labs/flux.2-pro", { image_size: "1K" }, 1)).toBeCloseTo(0.03, 6)
  })
})
