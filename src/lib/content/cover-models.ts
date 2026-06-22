/**
 * Каталог моделей, доступных для генерации обложки. Используется
 * UI-селектором в CoverGallery и серверной маршрутизацией в cover-image.ts.
 *
 * id — composite ключ "provider:model_id", удобно положить в один select-value.
 */

export interface CoverModelOption {
  id: string
  provider: string
  model: string
  label: string
  hint?: string
  /** Хорошо ли модель рендерит русские буквы на картинке. */
  goodForCyrillic: boolean
  approxCost: string
}

export const COVER_MODELS: CoverModelOption[] = [
  {
    id: "openai:gpt-image-2",
    provider: "openai",
    model: "gpt-image-2",
    label: "OpenAI gpt-image-2",
    hint: "Новейшая, лучше всех с кириллицей и деталями. Дороже.",
    goodForCyrillic: true,
    approxCost: "~$0.04-0.13",
  },
  {
    id: "openai:gpt-image-1.5",
    provider: "openai",
    model: "gpt-image-1.5",
    label: "OpenAI gpt-image-1.5",
    hint: "Хорошо с кириллицей, чуть дешевле gpt-image-2.",
    goodForCyrillic: true,
    approxCost: "~$0.03-0.13",
  },
  {
    id: "openrouter:openai/gpt-5-image",
    provider: "openrouter",
    model: "openai/gpt-5-image",
    label: "GPT-5 Image (OpenRouter)",
    hint: "Через OpenRouter — если хочется использовать единый ключ.",
    goodForCyrillic: true,
    approxCost: "~$0.10",
  },
  {
    id: "openrouter:google/gemini-3-pro-image",
    provider: "openrouter",
    model: "google/gemini-3-pro-image",
    label: "Gemini 3 Pro Image",
    hint: "Сильная по фотографичности, средне — с текстом.",
    goodForCyrillic: false,
    approxCost: "~$0.08",
  },
  {
    id: "openrouter:google/gemini-3.1-flash-image",
    provider: "openrouter",
    model: "google/gemini-3.1-flash-image",
    label: "Gemini 3.1 Flash Image",
    hint: "Быстрая и дешёвая. С кириллицей — не очень.",
    goodForCyrillic: false,
    approxCost: "~$0.04",
  },
  {
    id: "openrouter:google/gemini-2.5-flash-image",
    provider: "openrouter",
    model: "google/gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    hint: "Самая дешёвая. Только для стилей без текста.",
    goodForCyrillic: false,
    approxCost: "~$0.04",
  },
  {
    id: "openrouter:black-forest-labs/flux.2-pro",
    provider: "openrouter",
    model: "black-forest-labs/flux.2-pro",
    label: "FLUX.2 Pro",
    hint: "Художественная, фотографичная. Слабо с кириллицей.",
    goodForCyrillic: false,
    approxCost: "~$0.03",
  },
]

export function getCoverModelById(id: string): CoverModelOption | null {
  return COVER_MODELS.find((m) => m.id === id) || null
}

/**
 * Дефолтная модель под стиль обложки. 3D с подписями — gpt-image-2
 * (лучше всех с кириллицей). Минимализм/фото — Gemini Flash/Pro (дешевле).
 */
export const DEFAULT_COVER_MODEL_BY_STYLE: Record<string, string> = {
  "3d_with_text": "openai:gpt-image-2",
  minimalist: "openrouter:google/gemini-3.1-flash-image",
  photo: "openrouter:google/gemini-3-pro-image",
}
