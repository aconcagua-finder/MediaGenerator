import type { ImageProvider, GenerateRequest, GenerateResult, ModelInfo, EditRequest } from "./types"
import { calculateCost } from "../utils/cost-calculator"

const API_URL = "https://api.openai.com/v1/images/generations"
const EDIT_URL = "https://api.openai.com/v1/images/edits"
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
    // GPT Image 2 не принимает background=transparent (отвечает 400).
    // Тихо игнорируем эту опцию для несовместимых моделей.
    if (params.background) {
      const allowTransparent = model !== "gpt-image-2"
      if (params.background !== "transparent" || allowTransparent) {
        body.background = params.background
      }
    }
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

  async edit(request: EditRequest): Promise<GenerateResult> {
    const { model, prompt, params, count, apiKey, image, imageMimeType, mask, maskMimeType } = request

    // OpenAI принимает multipart/form-data на /v1/images/edits.
    const form = new FormData()
    form.append("model", model)
    form.append("prompt", prompt)
    form.append("n", String(count))

    const size = (params.size as string) || "1024x1024"
    form.append("size", size)
    form.append("quality", (params.quality as string) || "medium")

    if (params.output_format) form.append("output_format", params.output_format as string)
    if (params.background) form.append("background", params.background as string)

    // Файл картинки — Blob с правильным MIME-типом, иначе OpenAI ругается.
    const imageBlob = new Blob([new Uint8Array(image)], { type: imageMimeType })
    const ext = imageMimeType.split("/")[1] || "png"
    form.append("image", imageBlob, `input.${ext}`)

    if (mask && maskMimeType) {
      const maskBlob = new Blob([new Uint8Array(mask)], { type: maskMimeType })
      const maskExt = maskMimeType.split("/")[1] || "png"
      form.append("mask", maskBlob, `mask.${maskExt}`)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT)

    try {
      const response = await fetch(EDIT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(
          (err as { error?: { message?: string } })?.error?.message ||
          `OpenAI edit ошибка: ${response.status}`
        )
      }

      const data = await response.json() as {
        data: Array<{ b64_json: string; revised_prompt?: string }>
      }

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

      // Редактирование тарифицируется как новая генерация по тем же тарифам качества/размера.
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
