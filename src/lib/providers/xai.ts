import type { ImageProvider, GenerateRequest, GenerateResult, ModelInfo } from "./types"
import { calculateCost } from "../utils/cost-calculator"

const API_URL = "https://api.x.ai/v1/images/generations"
const MODELS_URL = "https://api.x.ai/v1/models"
const TIMEOUT = 120_000

// Маппинг aspect_ratio → примерные размеры в пикселях
const ASPECT_RATIO_SIZES: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1344, height: 756 },
  "9:16": { width: 756, height: 1344 },
  "4:3": { width: 1184, height: 888 },
  "3:4": { width: 888, height: 1184 },
  "3:2": { width: 1254, height: 836 },
  "2:3": { width: 836, height: 1254 },
  "2:1": { width: 1448, height: 724 },
  "1:2": { width: 724, height: 1448 },
}

export const xaiProvider: ImageProvider = {
  id: "xai",

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const { model, prompt, params, count, apiKey } = request

    const body: Record<string, unknown> = {
      model,
      prompt,
      n: count,
      response_format: "b64_json",
    }

    if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio
    if (params.resolution) body.resolution = params.resolution

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT)

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(
          (error as { error?: { message?: string } })?.error?.message ||
          `xAI API ошибка: ${response.status}`
        )
      }

      const data = await response.json() as {
        data: Array<{ b64_json?: string; url?: string }>
      }

      const aspectRatio = (params.aspect_ratio as string) || "1:1"
      const dims = ASPECT_RATIO_SIZES[aspectRatio] || ASPECT_RATIO_SIZES["1:1"]
      // Удваиваем размеры для 2k разрешения
      const multiplier = params.resolution === "2k" ? 2 : 1

      const images = await Promise.all(
        data.data.map(async (item) => {
          let imageData: Buffer

          if (item.b64_json) {
            imageData = Buffer.from(item.b64_json, "base64")
          } else if (item.url) {
            const imgResponse = await fetch(item.url)
            const arrayBuffer = await imgResponse.arrayBuffer()
            imageData = Buffer.from(arrayBuffer)
          } else {
            throw new Error("xAI: нет данных изображения в ответе")
          }

          return {
            data: imageData,
            format: "png",
            width: dims.width * multiplier,
            height: dims.height * multiplier,
          }
        })
      )

      const cost = calculateCost("xai", model, params, count)

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
        data: Array<{ id: string; owned_by?: string }>
      }

      // Фильтруем модели генерации изображений xAI
      return data.data
        .filter((m) => m.id.includes("imagine") || m.id.includes("image"))
        .map((m) => ({
          modelId: m.id,
          displayName: m.id,
        }))
    } catch {
      return []
    }
  },

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(MODELS_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      return response.ok
    } catch {
      return false
    }
  },
}
