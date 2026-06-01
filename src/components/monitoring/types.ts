import type {
  MonitoringClassifier,
  MonitoringItemEngagement,
  MonitoringMatchType,
  MonitoringRunArtifacts,
  MonitoringRunStatus,
  MonitoringRunTrigger,
  MonitoringSchedule,
  MonitoringSource,
  MonitoringTopic,
} from "@/lib/db/schema/monitoring"

export interface TemplateCard {
  id: string
  slug: string | null
  title: string
  description: string
  isBuiltin: boolean
  isActive: boolean
  mode: "feed" | "topics"
  sources: MonitoringSource[]
  topics: MonitoringTopic[]
  classifier: MonitoringClassifier | null
  defaultIntervalDays: number
  tgMaxPages: number
  schedule: MonitoringSchedule
  lastRunAt: string | null
  nextRunAt: string | null
}

export interface RunCard {
  id: string
  templateId: string
  trigger: MonitoringRunTrigger
  status: MonitoringRunStatus
  mode: "feed" | "topics"
  periodFrom: string
  periodTo: string
  sourcesTotal: number
  sourcesSucceeded: number
  sourcesFailed: number
  itemsFound: number
  itemsMatched: number
  cost: string
  errorMessage: string | null
  artifacts: MonitoringRunArtifacts
  viewedAt: string | null
  createdAt: string
  finishedAt: string | null
}

export interface ItemCard {
  id: string
  sourceId: string
  sourceType: "telegram" | "website" | string
  sourceUrl: string
  sourceLabel: string | null
  postUrl: string
  publishedAt: string | null
  title: string | null
  content: string
  excerpt: string
  images: Array<{ url: string; width?: number; height?: number }>
  matchType: MonitoringMatchType | null
  matchTopicName: string | null
  matchReason: string | null
  isFavorite: boolean
  engagement: MonitoringItemEngagement
  engagementScore: number
}
