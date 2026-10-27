"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import type { HistoryFeedState } from "./use-history-feed"

interface HistoryFeedSectionProps {
  title: string
  /** Сколько всего (история + свежие задачи вкладки) */
  count: number
  state: HistoryFeedState
  onLoadMore: () => void
  /** Ссылка в Библиотеку: «Все … в Библиотеке →» */
  libraryHref: string
  libraryLabel: string
  /** Доп. кнопки в шапке (например, «Склеить готовые») */
  headerExtra?: React.ReactNode
  emptyText: string
  /** Есть ли что показать (свежие задачи или история) */
  hasItems: boolean
  /** Заглушка карточки на время загрузки страницы */
  skeleton: React.ReactNode
  /** Классы сетки (колонки зависят от раздела) */
  gridClassName?: string
  children: React.ReactNode
}

/**
 * Оболочка ленты истории под формой раздела: шапка с числом и ссылкой в
 * Библиотеку, сетка карточек (свежие задачи и история вместе), скелетоны,
 * догрузка при прокрутке (сторож с IntersectionObserver) и «Показать ещё» —
 * запасной путь.
 */
export function HistoryFeedSection({
  title,
  count,
  state,
  onLoadMore,
  libraryHref,
  libraryLabel,
  headerExtra,
  emptyText,
  hasItems,
  skeleton,
  gridClassName = "grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3",
  children,
}: HistoryFeedSectionProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const canLoadMore = state.loaded && state.hasMore && !state.loading && !state.error

  // Догрузка, когда низ ленты подходит к экрану
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !canLoadMore) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore()
      },
      { rootMargin: "400px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [canLoadMore, onLoadMore])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-baseline gap-2 text-base font-bold text-white">
          {title}
          {count > 0 && <span className="text-sm font-normal text-neutral-500">{count}</span>}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {headerExtra}
          <Link href={libraryHref} className="text-xs text-x-blue hover:underline">
            {libraryLabel}
          </Link>
        </div>
      </div>

      {!hasItems && state.loaded && !state.error && !state.loading ? (
        <p className="rounded-lg border border-dashed border-white/[0.12] px-4 py-8 text-center text-xs text-neutral-500">
          {emptyText}
        </p>
      ) : (
        <div className={gridClassName}>
          {children}
          {state.loading &&
            Array.from({ length: state.loaded ? 2 : 3 }, (_, i) => <div key={`sk-${i}`}>{skeleton}</div>)}
        </div>
      )}

      {state.error && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-neutral-500">
          <span>История не загрузилась: {state.error}</span>
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
      {state.hasMore && !state.error && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={state.loading}
            onClick={onLoadMore}
            className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.02] px-4 text-xs text-neutral-300 transition-colors hover:text-white disabled:opacity-60"
          >
            {state.loading && <Loader2 className="size-3.5 animate-spin" />}
            Показать ещё
          </button>
        </div>
      )}
    </section>
  )
}

/** Число в шапке: история + свежие задачи вкладки, которых в ней нет */
export function feedCount(state: HistoryFeedState, jobs: { fromHistory?: boolean }[]): number {
  const fresh = jobs.filter((j) => !j.fromHistory).length
  return state.loaded ? Math.max(jobs.length, state.total + fresh) : jobs.length
}
