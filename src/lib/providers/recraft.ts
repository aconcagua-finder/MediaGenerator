import type { ImageProvider, GenerateRequest, GenerateResult, ModelInfo } from "./types"

/**
 * Recraft — прямой API. Главная фишка: настоящая ВЕКТОРНАЯ генерация (SVG)
 * через style="vector_illustration". SVG масштабируется без потерь —
 * идеально для логотипов, иконок, веб-графики.
 *
 * OpenRouter растрирует Recraft в PNG (теряется вектор), поэтому ходим напрямую.
 * API OpenAI-совместимый: POST /v1/images/generations → { data: [{ url }] }.
 */

const API_URL = "https://external.api.recraft.ai/v1/images/generations"
const ME_URL = "https://external.api.recraft.ai/v1/users/me"
const TIMEOUT = 120_000

interface RecraftConf {
  model: string
  style: string
  format: string
  perImage: number
}

const MODEL_MAP: Record<string, RecraftConf> = {
  "recraft-v3-vector": { model: "recraftv3", style: "vector_illustration", format: "svg", perImage: 0.08 },
  "recraft-v3": { model: "recraftv3", style: "realistic_image", format: "png", perImage: 0.04 },
}

export const recraftProvider: ImageProvider = {
  id: "recraft",

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const { model, prompt, params, count, apiKey } = request
    const conf = MODEL_MAP[model] || MODEL_MAP["recraft-v3-vector"]
    const size = (params.size as string) || "1024x1024"
    const substyle = (params.substyle as string) || ""

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT)

    try {
      const images: GenerateResult["images"] = []

      for (let i = 0; i < count; i++) {
        const body: Record<string, unknown> = {
          prompt,
          model: conf.model,
          style: conf.style,
          size,
        }
        if (substyle && substyle !== "none") body.substyle = substyle

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
          const err = await response.json().catch(() => ({}))
          const msg =
            (err as { message?: string; code?: string })?.message ||
            `Recraft API ошибка: ${response.status}`
          throw new Error(msg)
        }

        const data = (await response.json()) as {
          data?: Array<{ url?: string; b64_json?: string }>
        }
        const item = data.data?.[0]
        if (!item?.url && !item?.b64_json) {
          throw new Error("Recraft не вернул изображение")
        }

        let buf: Buffer
        let format = conf.format
        if (item.b64_json) {
          buf = Buffer.from(item.b64_json, "base64")
        } else {
          const fileResp = await fetch(item.url!, { signal: controller.signal })
          if (!fileResp.ok) {
            throw new Error(`Не удалось скачать результат Recraft (${fileResp.status})`)
          }
          buf = Buffer.from(await fileResp.arrayBuffer())
          const ct = fileResp.headers.get("content-type") || ""
          if (ct.includes("svg")) format = "svg"
          else if (ct.includes("png")) format = "png"
          else if (ct.includes("webp")) format = "webp"
          else if (ct.includes("jpeg") || ct.includes("jpg")) format = "jpeg"
        }

        const [w, h] = size.split("x").map((s) => parseInt(s, 10))
        images.push({ data: buf, format, width: w || 1024, height: h || 1024 })
      }

      return { images, cost: conf.perImage * count }
    } finally {
      clearTimeout(timeoutId)
    }
  },

  async listModels(): Promise<ModelInfo[]> {
    // Список фиксированный (seed-models); авто-обнаружение не нужно.
    return []
  },

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const r = await fetch(ME_URL, { headers: { Authorization: `Bearer ${apiKey}` } })
      // 401/403 — точно неверный ключ. Прочее (включая 404 при неточном
      // endpoint) считаем валидным, чтобы не блокировать сохранение ключа.
      return r.status !== 401 && r.status !== 403
    } catch {
      return true
    }
  },
}
