"use client"

import { Scissors } from "lucide-react"
import { HistoryFeedSection, feedCount } from "@/components/history-feed/history-feed-section"
import type { HistoryFeedState } from "@/components/history-feed/use-history-feed"
import { VideoJobCard, VideoJobCardSkeleton } from "./video-job-card"
import type { VideoJob } from "./video-job"

interface VideoHistorySectionProps {
  jobs: VideoJob[]
  history: HistoryFeedState
  onLoadMore: () => void
  onRepeat: (job: VideoJob) => void
  /** Готовые клипы этой вкладки — для «Склеить готовые» */
  composeIds: string[]
  onCompose: () => void
}

/**
 * «Мои генерации» на /video: свежие задачи вкладки и история из БД в одной
 * сетке (общая оболочка лент, см. history-feed).
 */
export function VideoHistorySection({ jobs, history, onLoadMore, onRepeat, composeIds, onCompose }: VideoHistorySectionProps) {
  return (
    <HistoryFeedSection
      title="Мои генерации"
      count={feedCount(history, jobs)}
      state={history}
      onLoadMore={onLoadMore}
      libraryHref="/library?tab=videos"
      libraryLabel="Все видео в Библиотеке →"
      headerExtra={
        composeIds.length >= 2 ? (
          <button
            type="button"
            onClick={onCompose}
            className="flex h-8 items-center gap-1.5 rounded-full border border-x-blue/40 bg-x-blue/[0.1] px-3 text-xs font-medium text-x-blue transition-colors hover:bg-x-blue/[0.18]"
          >
            <Scissors className="size-3.5" />
            Склеить готовые ({composeIds.length})
          </button>
        ) : null
      }
      emptyText="Здесь появятся ваши видео-запросы: и готовые, и те, что ещё в работе или не удались."
      hasItems={jobs.length > 0}
      skeleton={<VideoJobCardSkeleton />}
    >
      {jobs.map((job) => (
        <VideoJobCard key={job.id} job={job} onRepeat={onRepeat} />
      ))}
    </HistoryFeedSection>
  )
}
