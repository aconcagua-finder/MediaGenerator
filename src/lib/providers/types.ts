/**
 * Общие типы для адаптеров провайдеров генерации изображений
 */

export interface GenerateRequest {
  model: string
  prompt: string
  params: Record<string, unknown>
  count: number
  apiKey: string
}

export interface GeneratedImage {
  data: Buffer
  format: string  // png, jpeg, webp
  width: number
  height: number
}

export interface GenerateResult {
  images: GeneratedImage[]
  cost: number
  revisedPrompt?: string
  rawResponse?: unknown
}

export interface ModelInfo {
  modelId: string
  displayName: string
  description?: string
}

export interface ImageProvider {
  /** Идентификатор провайдера */
  id: string

  /** Генерация изображений */
  generate(request: GenerateRequest): Promise<GenerateResult>

  /** Список доступных моделей (для проверки обновлений) */
  listModels(apiKey: string): Promise<ModelInfo[]>

  /** Проверка валидности API ключа */
  validateKey(apiKey: string): Promise<boolean>
}
