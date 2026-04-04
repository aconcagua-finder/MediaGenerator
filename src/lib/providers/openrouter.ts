import type { ImageProvider, GenerateRequest, GenerateResult, ModelInfo } from "./types"
import { calculateCost } from "../utils/cost-calculator"

const API_URL = "https://openrouter.ai/api/v1/chat/completions"
const MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=image"
const TIMEOUT = 180_000 // 3 минуты (OpenRouter может быть медленнее)

// Маппинг aspect_ratio → примерные размеры
const ASPECT_RATIO_SIZES: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "2:3": { width: 832, height: 1248 },
  "3:2": { width: 1248, height: 832 },
  "3:4": { width: 896, height: 1152 },
  "4:3": { width: 1152, height: 896 },
  "4:5": { width: 928, height: 1160 },
  "5:4": { width: 1160, height: 928 },
  "9:16": { width: 768, height: 1344 },
  "16:9": { width: 1344, height: 768 },
  "21:9": { width: 1568, height: 672 },
}

// Множитель размера по image_size
const SIZE_MULTIPLIER: Record<string, number> = {
  "0.5K": 0.5,
  "1K": 1,
  "2K": 2,
  "4K": 4,
}

export const openrouterProvider: ImageProvider = {
  id: "openrouter",

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const { model, prompt, params, count, apiKey } = request

    // OpenRouter использует chat completions формат
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image"],
      n: count,
    }

    // image_config — специфичные параметры для изображений
    const imageConfig: Record<string, unknown> = {}
    if (params.aspect_ratio) imageConfig.aspect_ratio = params.aspect_ratio
    if (params.image_size) imageConfig.image_size = params.image_size
    if (Object.keys(imageConfig).length > 0) {
      body.image_config = imageConfig
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT)

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-Title": "MediaGenerator",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(
          (error as { error?: { message?: string } })?.error?.message ||
          `OpenRouter API ошибка: ${response.status}`
        )
      }

      const data = await response.json() as {
        choices: Array<{
          message: {
            content: Array<{
              type: string
              image_url?: { url: string }
              text?: string
            }> | string
          }
        }>
      }

      const aspectRatio = (params.aspect_ratio as string) || "1:1"
      const imageSize = (params.image_size as string) || "1K"
      const baseDims = ASPECT_RATIO_SIZES[aspectRatio] || ASPECT_RATIO_SIZES["1:1"]
      const multiplier = SIZE_MULTIPLIER[imageSize] || 1

      const images: GenerateResult["images"] = []

      for (const choice of data.choices) {
        const content = choice.message.content
        if (typeof content === "string") continue

        for (const part of content) {
          if (part.type === "image_url" && part.image_url?.url) {
            let imageData: Buffer

            if (part.image_url.url.startsWith("data:")) {
              // data:image/png;base64,...
              const base64 = part.image_url.url.split(",")[1]
              imageData = Buffer.from(base64, "base64")
            } else {
              // URL — скачиваем
              const imgResponse = await fetch(part.image_url.url)
              const arrayBuffer = await imgResponse.arrayBuffer()
              imageData = Buffer.from(arrayBuffer)
            }

            // Определяем формат из data URL или по умолчанию png
            let format = "png"
            const mimeMatch = part.image_url.url.match(/data:image\/(\w+);/)
            if (mimeMatch) format = mimeMatch[1]

            images.push({
              data: imageData,
              format,
              width: Math.round(baseDims.width * multiplier),
              height: Math.round(baseDims.height * multiplier),
            })
          }
        }
      }

      if (images.length === 0) {
        throw new Error("OpenRouter: нет изображений в ответе")
      }

      const cost = calculateCost("openrouter", model, params, count)

      return { images, cost, rawResponse: data }
    } finally {
      clearTimeout(timeoutId)
    }
  },

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    try {
      const response = await fetch(MODELS_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!response.ok) return []

      const data = await response.json() as {
        data: Array<{
          id: string
          name: string
          description?: string
          architecture?: { output_modalities?: string[] }
        }>
      }

      return data.data
        .filter((m) =>
          m.architecture?.output_modalities?.includes("image")
        )
        .map((m) => ({
          modelId: m.id,
          displayName: m.name || m.id,
          description: m.description,
        }))
    } catch {
      return []
    }
  },

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      return response.ok
    } catch {
      return false
    }
  },
}
