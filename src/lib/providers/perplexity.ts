import type { ImageProvider, ModelInfo } from "./types"

/**
 * Perplexity — не для генерации картинок, а для Deep Research (рубрика «Публикации»).
 * Интерфейс ImageProvider реализован минимально, чтобы можно было
 * единообразно сохранять/валидировать ключ через существующий API ключей.
 * Реальная логика поиска живёт в `src/lib/content/perplexity-search.ts`.
 */
export const perplexityProvider: ImageProvider = {
  id: "perplexity",

  async generate() {
    throw new Error("Perplexity не используется для генерации изображений")
  },

  async listModels(): Promise<ModelInfo[]> {
    return [
      { modelId: "sonar-deep-research", displayName: "Sonar Deep Research" },
      { modelId: "sonar-pro", displayName: "Sonar Pro" },
      { modelId: "sonar", displayName: "Sonar" },
    ]
  },

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      })
      // 401/403 — ключ нерабочий. Всё остальное (200/4xx) — ключ ОК,
      // даже если запрос отбился по другой причине (rate limit, неподдерживаемая модель).
      return response.status !== 401 && response.status !== 403
    } catch {
      return false
    }
  },
}
