"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { Loader2, Scissors } from "lucide-react"
import { VideoJobCard, VideoJobCardSkeleton } from "./video-job-card"
import type { VideoJob } from "./video-job"

export interface VideoHistoryState {
  loaded: boolean
  loading: boolean
  hasMore: boolean
  offset: number
  /** Всего генераций в истории (без свежих задач вкладки, запущенных после загрузки) */
  total: number
  error: string | null
}

interface VideoHistorySectionProps {
  jobs: VideoJob[]
  history: VideoHistoryState
  onLoadMore: () => void
  onRepeat: (job: VideoJob) => void
  /** Готовые клипы этой вкладки — для «Склеить готовые» */
  composeIds: string[]
  onCompose: () => void
}

/**
 * «Мои генерации» на /video: свежие задачи вкладки и история из БД в одной
 * сетке (1 колонка на телефоне, 2-3 на десктопе). История догружается при
 * прокрутке (сторож с IntersectionObserver), кнопка «Показать ещё» — запасной путь.
 */
export function VideoHistorySection({
  jobs,
  history,
  onLoadMore,
  onRepeat,
  composeIds,
  onCompose,
}: VideoHistorySectionProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const canLoadMore = history.loaded && history.hasMore && !history.loading && !history.error

  // Догрузка, когда низ секции подходит к экрану
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !canLoadMore || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onLoadMore()
    }, { rootMargin: "400px" })
    io.observe(el)
    return () => io.disconnect()
  }, [canLoadMore, onLoadMore])

  const fresh = jobs.filter((j) => !j.fromHistory).length
  const count = history.loaded ? Math.max(jobs.length, history.total + fresh) : jobs.length

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-baseline gap-2 text-base font-bold text-white">
          Мои генерации
          {count > 0 && <span className="text-sm font-normal text-neutral-500">{count}</span>}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {composeIds.length >= 2 && (
            <button
              type="button"
              onClick={onCompose}
              className="flex h-8 items-center gap-1.5 rounded-full border border-x-blue/40 bg-x-blue/[0.1] px-3 text-xs font-medium text-x-blue transition-colors hover:bg-x-blue/[0.18]"
            >
              <Scissors className="size-3.5" />
              Склеить готовые ({composeIds.length})
            </button>
          )}
          <Link href="/library?tab=videos" className="text-xs text-x-blue hover:underline">
            Все видео в Библиотеке →
          </Link>
        </div>
      </div>

      {jobs.length === 0 && history.loaded && !history.error ? (
        <p className="rounded-lg border border-dashed border-white/[0.12] px-4 py-8 text-center text-xs text-neutral-500">
          Здесь появятся ваши видео-запросы: и готовые, и те, что ещё в работе или не удались.
        </p>
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <VideoJobCard key={job.id} job={job} onRepeat={onRepeat} />
          ))}
          {history.loading &&
            Array.from({ length: history.loaded ? 2 : 3 }, (_, i) => <VideoJobCardSkeleton key={`sk-${i}`} />)}
        </div>
      )}

      {history.error && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-neutral-500">
          <span>История не загрузилась: {history.error}</span>
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-full border border-white/[0.12] px-3 py-1 text-neutral-300 hover:text-white"
          >
            Повторить
          </button>
        </div>
      )}

      <div ref={sentinelRef} aria-hidden className="h-px" />
      {history.hasMore && !history.error && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={history.loading}
            onClick={onLoadMore}
            className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.02] px-4 text-xs text-neutral-300 transition-colors hover:text-white disabled:opacity-60"
          >
            {history.loading && <Loader2 className="size-3.5 animate-spin" />}
            Показать ещё
          </button>
        </div>
      )}
    </section>
  )
}
