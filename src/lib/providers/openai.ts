import type { ImageProvider, GenerateRequest, GenerateResult, ModelInfo } from "./types"
import { calculateCost } from "../utils/cost-calculator"

const API_URL = "https://api.openai.com/v1/images/generations"
const MODELS_URL = "https://api.openai.com/v1/models"
const TIMEOUT = 120_000 // 2 минуты

export const openaiProvider: ImageProvider = {
  id: "openai",

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const { model, prompt, params, count, apiKey } = request

    const isGptImage = model.startsWith("gpt-image")

    const body: Record<string, unknown> = {
      model,
      prompt,
      n: count,
      size: params.size || "1024x1024",
      quality: params.quality || "medium",
    }

    // DALL-E модели требуют response_format, GPT Image — нет (b64_json по умолчанию)
    if (!isGptImage) {
      body.response_format = "b64_json"
    }

    if (params.output_format) body.output_format = params.output_format
    if (params.background) body.background = params.background
    if (params.moderation) body.moderation = params.moderation

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
          `OpenAI API ошибка: ${response.status}`
        )
      }

      const data = await response.json() as {
        data: Array<{ b64_json: string; revised_prompt?: string }>
      }

      const size = (params.size as string) || "1024x1024"
      const [widthStr, heightStr] = size.split("x")
      const width = parseInt(widthStr, 10)
      const height = parseInt(heightStr, 10)
      const format = (params.output_format as string) || "png"

      const images = data.data.map((item) => ({
        data: Buffer.from(item.b64_json, "base64"),
        format,
        width,
        height,
      }))

      const cost = calculateCost("openai", model, params, count)

      return {
        images,
        cost,
        revisedPrompt: data.data[0]?.revised_prompt,
        rawResponse: data,
      }
    } finally {
      clearTimeout(timeoutId)
    }
  },

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    const response = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) return []

    const data = await response.json() as {
      data: Array<{ id: string; owned_by: string }>
    }

    // Фильтруем только модели генерации изображений
    const imageModelPrefixes = ["gpt-image", "dall-e"]
    return data.data
      .filter((m) => imageModelPrefixes.some((p) => m.id.startsWith(p)))
      .map((m) => ({
        modelId: m.id,
        displayName: m.id,
      }))
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
