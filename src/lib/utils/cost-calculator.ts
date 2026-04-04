/**
 * Расчёт стоимости генерации изображений.
 * Цены актуальны на апрель 2026.
 */

type OpenAIModel = "gpt-image-1.5" | "gpt-image-1" | "gpt-image-1-mini"
type OpenAIQuality = "low" | "medium" | "high"
type OpenAISize = "1024x1024" | "1536x1024" | "1024x1536" | "1792x1024" | "1024x1792"

// Цены OpenAI: model -> quality -> size category -> price
const OPENAI_PRICES: Record<OpenAIModel, Record<OpenAIQuality, { standard: number; wide: number }>> = {
  "gpt-image-1.5": {
    low:    { standard: 0.009, wide: 0.013 },
    medium: { standard: 0.034, wide: 0.050 },
    high:   { standard: 0.133, wide: 0.200 },
  },
  "gpt-image-1": {
    low:    { standard: 0.011, wide: 0.016 },
    medium: { standard: 0.042, wide: 0.063 },
    high:   { standard: 0.167, wide: 0.250 },
  },
  "gpt-image-1-mini": {
    low:    { standard: 0.005, wide: 0.006 },
    medium: { standard: 0.011, wide: 0.015 },
    high:   { standard: 0.036, wide: 0.052 },
  },
}

const XAI_PRICES: Record<string, number> = {
  "grok-imagine-image": 0.02,
  "grok-imagine-image-pro": 0.07,
}

/**
 * Рассчитать стоимость генерации
 */
export function calculateCost(
  provider: string,
  model: string,
  params: Record<string, unknown>,
  count: number
): number {
  let pricePerImage = 0

  switch (provider) {
    case "openai": {
      const quality = (params.quality as OpenAIQuality) || "medium"
      const size = (params.size as OpenAISize) || "1024x1024"
      const modelPrices = OPENAI_PRICES[model as OpenAIModel]
      if (!modelPrices) break

      const isWide = size !== "1024x1024"
      pricePerImage = isWide ? modelPrices[quality].wide : modelPrices[quality].standard
      break
    }

    case "xai": {
      pricePerImage = XAI_PRICES[model] || 0.02
      break
    }

    case "openrouter": {
      // FLUX per-megapixel
      if (model.includes("flux")) {
        const sizeKey = (params.image_size as string) || "1K"
        const sizeMP: Record<string, number> = { "0.5K": 0.25, "1K": 1, "2K": 4 }
        const mp = sizeMP[sizeKey] || 1

        if (model.includes("flux.2-pro")) {
          pricePerImage = 0.03 + Math.max(0, mp - 1) * 0.015
        } else if (model.includes("flux.2-max")) {
          pricePerImage = 0.07 + Math.max(0, mp - 1) * 0.03
        } else if (model.includes("flux.2-flex")) {
          pricePerImage = 0.06 * mp
        } else {
          pricePerImage = 0.03
        }
      } else if (model.includes("seedream")) {
        pricePerImage = 0.04
      } else if (model.includes("gpt-5-image-mini")) {
        pricePerImage = 0.04
      } else if (model.includes("gpt-5-image")) {
        pricePerImage = 0.10
      } else {
        // Gemini и прочие — примерная оценка
        pricePerImage = 0.04
      }
      break
    }
  }

  return pricePerImage * count
}
