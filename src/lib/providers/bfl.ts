import type { ImageProvider, GenerateRequest, GenerateResult, ModelInfo } from "./types"

const API_BASE = "https://api.bfl.ai/v1"
const TIMEOUT = 180_000 // 3 минуты
const POLL_INTERVAL = 2_000 // 2 секунды

// Эндпоинты для каждой модели
const MODEL_ENDPOINTS: Record<string, string> = {
  "flux-2-pro": "flux-2-pro",
  "flux-2-max": "flux-2-max",
  "flux-2-flex": "flux-2-flex",
  "flux-2-klein-4b": "flux-2-klein-4b",
}

// Цены per megapixel (первый MP)
const MODEL_PRICING: Record<string, { firstMP: number; extraMP: number }> = {
  "flux-2-pro": { firstMP: 0.03, extraMP: 0.015 },
  "flux-2-max": { firstMP: 0.07, extraMP: 0.03 },
  "flux-2-flex": { firstMP: 0.06, extraMP: 0.06 },
  "flux-2-klein-4b": { firstMP: 0.014, extraMP: 0.014 },
}

export const bflProvider: ImageProvider = {
  id: "bfl",

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const { model, prompt, params, count, apiKey } = request

    const endpoint = MODEL_ENDPOINTS[model]
    if (!endpoint) {
      throw new Error(`BFL: неизвестная модель "${model}"`)
    }

    // Размеры из параметров
    const width = parseInt((params.width as string) || "1024", 10)
    const height = parseInt((params.height as string) || "1024", 10)
    const safetyTolerance = parseInt((params.safety_tolerance as string) || "5", 10)

    const allImages: GenerateResult["images"] = []
    let totalCost = 0

    // BFL не поддерживает n > 1, генерируем по одному
    for (let i = 0; i < Math.min(count, 4); i++) {
      const body: Record<string, unknown> = {
        prompt,
        width,
        height,
        safety_tolerance: safetyTolerance,
        output_format: (params.output_format as string) || "png",
      }

      if (params.seed) body.seed = parseInt(params.seed as string, 10)
      if (params.transparent_bg === "true") body.transparent_bg = true

      // 1. Submit task
      const submitRes = await fetch(`${API_BASE}/${endpoint}`, {
        method: "POST",
        headers: {
          "x-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!submitRes.ok) {
        const err = await submitRes.json().catch(() => ({}))
        throw new Error(
          (err as { detail?: string })?.detail ||
          `BFL API ошибка: ${submitRes.status}`
        )
      }

      const task = await submitRes.json() as {
        id: string
        polling_url?: string
      }

      // 2. Poll for result
      const startTime = Date.now()
      let result: { status: string; result?: { sample?: string }; detail?: string } | null = null

      while (Date.now() - startTime < TIMEOUT) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))

        const pollUrl = task.polling_url || `${API_BASE}/get_result?id=${task.id}`
        const pollRes = await fetch(pollUrl, {
          headers: { "x-key": apiKey },
        })

        if (!pollRes.ok) continue

        result = await pollRes.json()

        if (result?.status === "Ready") break
        if (result?.status === "Error") {
          throw new Error(`BFL: ошибка генерации — ${result.detail || "неизвестная"}`)
        }
        if (result?.status === "Request Moderated" || result?.status === "Content Moderated") {
          throw new Error("BFL: контент отклонён модерацией. Попробуйте изменить промпт или увеличить safety_tolerance.")
        }
      }

      if (!result || result.status !== "Ready") {
        throw new Error("BFL: таймаут генерации")
      }

      // 3. Скачать изображение
      const imageUrl = result.result?.sample
      if (!imageUrl) {
        throw new Error("BFL: нет URL изображения в ответе")
      }

      const imgResponse = await fetch(imageUrl)
      if (!imgResponse.ok) {
        throw new Error(`BFL: не удалось скачать изображение (${imgResponse.status})`)
      }

      const arrayBuffer = await imgResponse.arrayBuffer()
      const imageData = Buffer.from(arrayBuffer)

      const format = (params.output_format as string) || "png"

      allImages.push({
        data: imageData,
        format,
        width,
        height,
      })

      // Расчёт стоимости
      const mp = (width * height) / 1_000_000
      const pricing = MODEL_PRICING[model] || MODEL_PRICING["flux-2-pro"]
      totalCost += pricing.firstMP + Math.max(0, mp - 1) * pricing.extraMP
    }

    if (allImages.length === 0) {
      throw new Error("BFL: нет изображений")
    }

    return { images: allImages, cost: totalCost }
  },

  async listModels(_apiKey: string): Promise<ModelInfo[]> {
    // BFL не имеет endpoint для листинга моделей — возвращаем статический список
    return [
      { modelId: "flux-2-pro", displayName: "FLUX.2 Pro" },
      { modelId: "flux-2-max", displayName: "FLUX.2 Max" },
      { modelId: "flux-2-flex", displayName: "FLUX.2 Flex" },
      { modelId: "flux-2-klein-4b", displayName: "FLUX.2 Klein 4B" },
    ]
  },

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch("https://api.bfl.ai/v1/me", {
        headers: { "x-key": apiKey },
      })
      return response.ok
    } catch {
      return false
    }
  },
}
