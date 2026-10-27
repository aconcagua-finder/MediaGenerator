"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { Copy, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import type { FeedStatus } from "@/lib/history/merge"

/**
 * Кирпичики карточек лент истории (/video, /voice, /generate): время, статус,
 * промпт в 2 строки с «ещё», кнопки действий, «рядом с экраном» для ленивых медиа.
 */

export function formatWhen(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  if (d.toDateString() === now.toDateString()) return `сегодня, ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `вчера, ${time}`
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, ${time}`
}

export function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}с`
  if (sec < 3600) return `${Math.floor(sec / 60)} мин ${sec % 60}с`
  return `${Math.floor(sec / 3600)} ч ${Math.floor((sec % 3600) / 60)} мин`
}

/** Текущее время, обновляемое раз в секунду (счётчик «в работе» тикает в своей карточке) */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/**
 * true, когда элемент подошёл к экрану на `rootMargin` (и дальше не сбрасывается):
 * медиа монтируются только тогда, оффскрин-карточки ничего не качают.
 */
export function useNearViewport<T extends Element>(rootMargin = "200px"): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near, rootMargin])
  return [ref, near]
}

/** Текст в `lines` строки с «ещё» (если он длинный) */
export function ClampedText({ text, className, lines = 2 }: { text: string; className?: string; lines?: 2 | 3 }) {
  const [open, setOpen] = useState(false)
  const long = text.length > (lines === 3 ? 140 : 90) || text.includes("\n")
  return (
    <p className={`text-xs leading-snug break-words ${className ?? "text-neutral-300"}`}>
      <span className={open ? "whitespace-pre-wrap" : lines === 3 ? "line-clamp-3" : "line-clamp-2"}>{text}</span>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 text-[11px] text-neutral-500 hover:text-white"
        >
          {open ? "свернуть" : "ещё"}
        </button>
      )}
    </p>
  )
}

const STATUS_CHIP: Record<FeedStatus, { label: string; cls: string }> = {
  processing: { label: "в работе", cls: "bg-x-blue/[0.12] text-x-blue" },
  error: { label: "ошибка", cls: "bg-red-500/[0.12] text-red-400" },
  done: { label: "готово", cls: "bg-emerald-500/[0.12] text-emerald-300" },
}

export function StatusChip({ status }: { status: FeedStatus }) {
  const chip = STATUS_CHIP[status]
  return <span className={`rounded-full px-1.5 py-px ${chip.cls}`}>{chip.label}</span>
}

/** Мелкий чип-метка (режим, вендор) */
export function MetaChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/[0.06] px-1.5 py-px text-neutral-400">{children}</span>
}

/** Класс компактной кнопки действия карточки */
export const ACTION_CLASS =
  "flex h-7 items-center gap-1 rounded-md border border-white/[0.1] bg-white/[0.02] px-2 text-[11px] text-neutral-300 transition-colors hover:border-x-blue/40 hover:text-white"

export function RepeatButton({ onClick, title = "Повторить с этим промптом" }: { onClick: () => void; title?: string }) {
  return (
    <button type="button" onClick={onClick} className={ACTION_CLASS} title={title}>
      <RotateCcw className="size-3" />
      Повторить
    </button>
  )
}

export function CopyTextButton({ text, label = "Текст", toastText = "Скопировано" }: { text: string; label?: string; toastText?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => toast.success(toastText),
          () => toast.error("Не удалось скопировать"),
        )
      }}
      className={ACTION_CLASS}
      title="Скопировать"
    >
      <Copy className="size-3" />
      {label}
    </button>
  )
}

/** Шапка карточки: статус, метки, модель и время справа */
export function CardMeta({
  status,
  chips,
  model,
  startedAt,
}: {
  status: FeedStatus
  chips?: React.ReactNode
  model: string
  startedAt: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-neutral-500">
      <StatusChip status={status} />
      {chips}
      <span className="min-w-0 truncate text-neutral-300">{model}</span>
      <span className="ml-auto shrink-0">{formatWhen(startedAt)}</span>
    </div>
  )
}
