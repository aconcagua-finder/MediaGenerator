import type {
  ContentRubricSettings,
  ContentRunArtifacts,
  ContentRunCosts,
  ContentRunStatus,
} from "@/lib/db/schema"

export interface RubricCardData {
  id: string
  slug: string
  title: string
  description: string
  collection: string | null
  channelId: string | null
  isActive: boolean
  isBuiltin: boolean
  settings: ContentRubricSettings
}

export interface ChannelCardData {
  id: string
  slug: string
  title: string
  description: string
  icon: string | null
  isActive: boolean
}

export const FREE_POST_RUBRIC_ID = "__free_post__"

export interface RunListItem {
  id: string
  rubricSlug: string
  status: ContentRunStatus
  stage: ContentRunStatus
  errorStage: ContentRunStatus | null
  errorMessage: string | null
  postText: string | null
  totalCost: number | null
  createdAt: string
  finishedAt: string | null
}

export interface RunDetail extends RunListItem {
  rubricId: string
  settings: ContentRubricSettings
  artifacts: ContentRunArtifacts
  costs: ContentRunCosts
  /** Помечено ли пользователем как опубликованное (учитывается в topic guard). */
  isPublished?: boolean
}

export const STAGE_LABELS: Record<ContentRunStatus, string> = {
  pending: "Подготовка",
  perplexity: "Веб-поиск",
  reddit: "Reddit",
  topic: "Выбор темы",
  compression: "Сжатие контекста",
  writing: "Написание поста",
  done: "Готово",
  error: "Ошибка",
}

/** Порядок шагов в прогресс-степпере. */
export const STAGE_ORDER: ContentRunStatus[] = [
  "perplexity",
  "reddit",
  "topic",
  "compression",
  "writing",
]
