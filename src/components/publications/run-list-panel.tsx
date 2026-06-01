"use client"

import { useMemo } from "react"
import { Loader2, AlertCircle, CheckCircle2, Trash2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { STAGE_LABELS } from "./types"
import type { ChannelCardData, RubricCardData, RunListItem } from "./types"
import { buildRunTitle } from "./run-title"

interface RunListPanelProps {
  runs: RunListItem[]
  rubrics: RubricCardData[]
  channels: ChannelCardData[]
  selectedRunId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

const ACTIVE = new Set(["pending", "perplexity", "reddit", "topic", "compression", "writing"])

function formatTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function StatusIcon({ status }: { status: RunListItem["status"] }) {
  if (status === "done") return <CheckCircle2 className="size-3.5 text-emerald-400" />
  if (status === "error") return <AlertCircle className="size-3.5 text-rose-400" />
  if (ACTIVE.has(status)) return <Loader2 className="size-3.5 animate-spin text-sky-400" />
  return <Loader2 className="size-3.5 text-neutral-500" />
}

export function RunListPanel({
  runs,
  rubrics,
  channels,
  selectedRunId,
  onSelect,
  onDelete,
}: RunListPanelProps) {
  const titlesById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildRunTitle>>()
    for (const run of runs) {
      map.set(run.id, buildRunTitle({ rubricSlug: run.rubricSlug, rubrics, channels }))
    }
    return map
  }, [runs, rubrics, channels])

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-lg border border-white/[0.08] bg-white/[0.02]">
      <div className="border-b border-white/[0.06] px-3 py-2 text-xs uppercase tracking-wide text-neutral-400">
        История запусков ({runs.length})
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {runs.length === 0 ? (
          <div className="p-4 text-sm text-neutral-500">
            Пока нет запусков. Создайте первый пост — кнопка справа сверху.
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {runs.map((run) => {
              const titleInfo = titlesById.get(run.id)
              const isSelected = run.id === selectedRunId
              const cost = typeof run.totalCost === "number" ? run.totalCost : null
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(run.id)}
                    className={cn(
                      "group flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]",
                      isSelected && "bg-white/[0.05]",
                    )}
                  >
                    <span className="mt-1 shrink-0">
                      <StatusIcon status={run.status} />
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-medium text-white">
                          {titleInfo?.channelIcon && (
                            <span aria-hidden>{titleInfo.channelIcon}</span>
                          )}
                          <span className="truncate">
                            {titleInfo?.title || run.rubricSlug}
                          </span>
                          {titleInfo?.subtitle && titleInfo.title === "Свободный пост" && (
                            <span className="truncate text-[11px] font-normal text-neutral-500">
                              · {titleInfo.subtitle}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(run.id)
                          }}
                          className="invisible shrink-0 text-neutral-500 transition-colors hover:text-rose-400 group-hover:visible"
                          aria-label="Удалить запуск"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                        <span>{formatTime(run.createdAt)}</span>
                        <span>·</span>
                        <span
                          className={cn(
                            run.status === "error" && "text-rose-400",
                            run.status === "done" && "text-emerald-400",
                            ACTIVE.has(run.status) && "text-sky-300",
                          )}
                        >
                          {STAGE_LABELS[run.stage] || run.stage}
                        </span>
                        {cost !== null && (
                          <>
                            <span>·</span>
                            <span>${cost.toFixed(4)}</span>
                          </>
                        )}
                      </div>
                      {run.status === "error" && run.errorMessage && (
                        <div className="truncate text-xs text-rose-400/80">
                          {run.errorMessage}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </aside>
  )
}
