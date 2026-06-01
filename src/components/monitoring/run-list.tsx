"use client"

import { toast } from "sonner"
import {
  Loader2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
  ClockIcon,
  Trash2Icon,
  CalendarIcon,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { RunCard } from "./types"

interface RunListProps {
  runs: RunCard[]
  selectedRunId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

const ACTIVE_STATUSES = new Set(["pending", "fetching", "classifying"])

const STATUS_LABEL: Record<string, string> = {
  pending: "Старт…",
  fetching: "Сбор постов",
  classifying: "Классификация",
  done: "Готово",
  error: "Ошибка",
}

function StatusIcon({ status }: { status: RunCard["status"] }) {
  if (status === "done") return <CheckCircle2Icon className="size-4 text-emerald-400" />
  if (status === "error") return <AlertCircleIcon className="size-4 text-rose-400" />
  if (ACTIVE_STATUSES.has(status))
    return <Loader2Icon className="size-4 animate-spin text-sky-400" />
  return <ClockIcon className="size-4 text-neutral-500" />
}

function formatRussian(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatPeriod(from: string, to: string): string {
  const a = new Date(from)
  const b = new Date(to)
  const days = Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
  if (days === 1) return "за день"
  if (days === 7) return "за неделю"
  if (days === 30) return "за месяц"
  return `за ${days} дн.`
}

export function RunList({ runs, selectedRunId, onSelect, onDelete }: RunListProps) {
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm("Удалить запуск и все найденные посты?")) return
    try {
      const res = await fetch(`/api/monitoring/runs/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Не удалось удалить")
      onDelete(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка удаления")
    }
  }

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-lg border border-white/[0.08] bg-white/[0.02]">
      <div className="border-b border-white/[0.06] px-3 py-2 text-xs uppercase tracking-wide text-neutral-400">
        Запуски ({runs.length})
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {runs.length === 0 ? (
          <div className="p-4 text-sm text-neutral-500">
            Запусков ещё нет. Нажмите «Запустить сейчас» — соберём посты за выбранный период.
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {runs.map((run) => {
              const isSelected = run.id === selectedRunId
              const unread = !run.viewedAt && run.status === "done"
              const matchedSummary =
                run.mode === "topics"
                  ? `${run.itemsMatched} совп. из ${run.itemsFound}`
                  : `${run.itemsFound} постов`
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
                    <StatusIcon status={run.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-white">
                          {STATUS_LABEL[run.status] ?? run.status}
                        </span>
                        {unread && (
                          <span className="rounded-full bg-sky-500/20 px-1.5 text-[10px] uppercase tracking-wide text-sky-300">
                            новое
                          </span>
                        )}
                        {run.trigger === "scheduled" && (
                          <span className="text-[10px] text-amber-400" title="Автоматический запуск">
                            <CalendarIcon className="size-3" />
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-400">
                        {matchedSummary} · {formatPeriod(run.periodFrom, run.periodTo)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-neutral-500">
                        {formatRussian(run.createdAt)}
                        {run.cost && Number(run.cost) > 0
                          ? ` · $${Number(run.cost).toFixed(4)}`
                          : ""}
                      </div>
                      {run.errorMessage && (
                        <div className="mt-1 truncate text-[11px] text-rose-400" title={run.errorMessage}>
                          {run.errorMessage}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, run.id)}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Удалить запуск"
                    >
                      <Trash2Icon className="size-3.5 text-neutral-500 hover:text-rose-400" />
                    </button>
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
