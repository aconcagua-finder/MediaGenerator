import type { ImageProvider, GenerateRequest, GenerateResult, ModelInfo } from "./types"

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
const TIMEOUT = 180_000

// Модели с поддержкой генерации изображений
// Маппинг коротких лейблов → API значений
const SAFETY_MAP: Record<string, string> = {
  "off": "BLOCK_NONE",
  "low": "BLOCK_ONLY_HIGH",
  "medium": "BLOCK_MEDIUM_AND_ABOVE",
  "strict": "BLOCK_LOW_AND_ABOVE",
}

const IMAGE_MODELS = [
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
]

export const googleProvider: ImageProvider = {
  id: "google",

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const { model, prompt, params, count, apiKey } = request

    const allImages: GenerateResult["images"] = []
    let totalCost = 0

    // Google не поддерживает n > 1, генерируем по одному
    for (let i = 0; i < Math.min(count, 4); i++) {
      const body: Record<string, unknown> = {
        contents: [{
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {} as Record<string, string>,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: SAFETY_MAP[(params.safety as string) || "off"] || "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: SAFETY_MAP[(params.safety as string) || "off"] || "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: SAFETY_MAP[(params.safety as string) || "off"] || "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: SAFETY_MAP[(params.safety as string) || "off"] || "BLOCK_NONE" },
        ],
      }

      const imageConfig = (body.generationConfig as Record<string, unknown>).imageConfig as Record<string, string>
      if (params.aspect_ratio) imageConfig.aspectRatio = params.aspect_ratio as string
      if (params.image_size) imageConfig.imageSize = params.image_size as string

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT)

      try {
        const response = await fetch(
          `${API_BASE}/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          const msg = (err as { error?: { message?: string } })?.error?.message
            || `Google API ошибка: ${response.status}`
          throw new Error(msg)
        }

        const data = await response.json() as {
          candidates?: Array<{
            content?: {
              parts?: Array<{
                text?: string
                inlineData?: { mimeType: string; data: string }
              }>
            }
            finishReason?: string
          }>
          promptFeedback?: { blockReason?: string }
        }

        // Проверяем блокировку
        if (data.promptFeedback?.blockReason) {
          throw new Error(`Google: промпт заблокирован — ${data.promptFeedback.blockReason}`)
        }

        // Извлекаем изображения из ответа
        for (const candidate of (data.candidates || [])) {
          if (candidate.finishReason === "SAFETY") {
            throw new Error("Google: контент заблокирован фильтрами безопасности. Измените промпт или ослабьте настройки модерации.")
          }

          for (const part of (candidate.content?.parts || [])) {
            if (part.inlineData?.data) {
              const imageData = Buffer.from(part.inlineData.data, "base64")
              const mimeType = part.inlineData.mimeType || "image/png"
              const format = mimeType.split("/")[1] || "png"

              // Размеры из image_size + aspect_ratio
              const sizeMap: Record<string, number> = { "512": 512, "0.5K": 512, "1K": 1024, "2K": 2048, "4K": 4096 }
              const baseDim = sizeMap[(params.image_size as string) || "1K"] || 1024
              const ar = (params.aspect_ratio as string) || "1:1"
              const [arW, arH] = ar.split(":").map(Number)
              let width = baseDim
              let height = baseDim
              if (arW && arH) {
                if (arW > arH) {
                  width = baseDim
                  height = Math.round(baseDim * (arH / arW))
                } else {
                  height = baseDim
                  width = Math.round(baseDim * (arW / arH))
                }
              }

              allImages.push({
                data: imageData,
                format,
                width,
                height,
              })
            }
          }
        }
      } finally {
        clearTimeout(timeoutId)
      }
    }

    if (allImages.length === 0) {
      throw new Error("Google: модель не вернула изображений. Попробуйте другой промпт.")
    }

    // Расчёт стоимости
    const imageSize = (params.image_size as string) || "1K"
    const priceMap: Record<string, Record<string, number>> = {
      "gemini-3.1-flash-image-preview": { "512": 0.045, "0.5K": 0.045, "1K": 0.067, "2K": 0.101, "4K": 0.151 },
      "gemini-3-pro-image-preview": { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
      "gemini-2.5-flash-image": { "1K": 0.039, "2K": 0.039, "4K": 0.039 },
    }
    const modelPrices = priceMap[model] || priceMap["gemini-2.5-flash-image"]
    totalCost = (modelPrices[imageSize] || modelPrices["1K"] || 0.04) * allImages.length

    return { images: allImages, cost: totalCost }
  },

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    try {
      const response = await fetch(
        `${API_BASE}?key=${apiKey}`,
        { headers: { "Content-Type": "application/json" } }
      )
      if (!response.ok) return []

      const data = await response.json() as {
        models: Array<{
          name: string
          displayName: string
          description?: string
          supportedGenerationMethods?: string[]
        }>
      }

      return (data.models || [])
        .filter((m) => {
          const id = m.name.replace("models/", "")
          return id.includes("image") || IMAGE_MODELS.includes(id)
        })
        .map((m) => ({
          modelId: m.name.replace("models/", ""),
          displayName: m.displayName || m.name,
          description: m.description,
        }))
    } catch {
      return []
    }
  },

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${API_BASE}?key=${apiKey}`,
      )
      return response.ok
    } catch {
      return false
    }
  },
}
