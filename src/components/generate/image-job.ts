import type { FeedStatus } from "@/lib/history/merge"
import type { ImageHistoryImage, ImageHistoryItem } from "@/lib/images/history"

/**
 * Генерация картинок на /generate: свежая (запущена в этой вкладке) или из
 * истории в БД. Одна модель для карточек и «Повторить».
 */
export interface ImageJob {
  id: string
  status: FeedStatus
  provider: string
  model: string
  prompt: string
  params: Record<string, string>
  imagesCount: number
  images: ImageHistoryImage[]
  error?: string
  cost?: number | null
  isEdit: boolean
  parentImageId: string | null
  /** Время запуска (мс) — сортировка и слияние с историей */
  startedAt: number
  fromHistory?: boolean
}

export function imageJobFromHistory(item: ImageHistoryItem): ImageJob {
  return {
    id: item.id,
    status: item.status,
    provider: item.provider,
    model: item.model,
    prompt: item.prompt,
    params: item.params,
    imagesCount: item.imagesCount,
    images: item.images,
    error: item.error,
    cost: item.cost,
    isEdit: item.isEdit,
    parentImageId: item.parentImageId,
    startedAt: new Date(item.createdAt).getTime(),
    fromHistory: true,
  }
}
