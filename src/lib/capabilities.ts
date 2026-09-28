/**
 * Где модели принимают картинку на вход — единая правда для backend и UI.
 *
 * Делим на две группы:
 * - vision: текстовые модели в чате, которые понимают image_url в контенте
 * - imageInput: image-генерирующие модели, которые могут принимать
 *   референс/исходник и редактировать его (наш edit-флоу)
 *
 * Эти карты намеренно консервативные — лучше показать пользователю
 * "модель не поддерживает картинку" и попросить переключиться, чем
 * отправить запрос, который провайдер отвергнет с малопонятной ошибкой.
 */

/** Текстовые модели в чате, которые понимают image_url (через OpenRouter). */
export const VISION_TEXT_MODELS = new Set<string>([
  // Anthropic — все Claude 4.x и 5.x понимают изображения
  "anthropic/claude-opus-5.5",
  "anthropic/claude-opus-5",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-opus-4.8",
  "anthropic/claude-haiku-4.5",
  // OpenAI — GPT-5 семейство мультимодальное
  "openai/gpt-5.4",
  "openai/gpt-5.5",
  "openai/gpt-5-mini",
  // Google — Gemini 3.x все принимают картинки
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.5-flash",
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-flash-lite",
  // xAI — Grok 4.x с vision
  "x-ai/grok-4.20",
  "x-ai/grok-4.20-multi-agent",
  "x-ai/grok-4.3",
])

/**
 * Image-моделей, которые принимают исходную картинку как референс/edit-source.
 *
 * Соответствует EDIT_CAPABLE_MODELS в /api/edit/route.ts — синхронизация
 * через единственный источник правды (этот файл).
 */
export const IMAGE_INPUT_MODELS: Record<string, string[]> = {
  // Через OpenAI Images API (/v1/images/edits)
  openai: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"],
  // Через OpenRouter chat completions с image input
  openrouter: [
    "google/gemini-3.1-flash-image",
    "google/gemini-3.1-flash-lite-image",
    "google/gemini-3-pro-image",
    "google/gemini-2.5-flash-image",
    "openai/gpt-5-image",
    "openai/gpt-5-image-mini",
    "openai/gpt-5.4-image-2",
  ],
}

export function supportsVision(modelId: string): boolean {
  return VISION_TEXT_MODELS.has(modelId)
}

export function supportsImageInput(provider: string, modelId: string): boolean {
  return IMAGE_INPUT_MODELS[provider]?.includes(modelId) ?? false
}

/**
 * Соответствие image-input модели (где принимаем картинку) и её
 * "edit-mode" провайдера — используется для маршрутизации в /api/generate.
 *
 * Возвращаем null, если модель не принимает картинку.
 */
export function resolveEditTarget(
  provider: string,
  modelId: string
): { provider: string; model: string } | null {
  if (!supportsImageInput(provider, modelId)) return null
  return { provider, model: modelId }
}
