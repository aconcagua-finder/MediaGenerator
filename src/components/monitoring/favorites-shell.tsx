"use client"

import { useMemo, useState } from "react"
import {
  HeartIcon,
  ExternalLinkIcon,
  ImageIcon,
  SearchIcon,
  XIcon,
  EyeIcon,
  MessageSquareIcon,
  RepeatIcon,
  FlameIcon,
} from "lucide-react"
import Link from "next/link"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type {
  MonitoringItemEngagement,
  MonitoringMatchType,
} from "@/lib/db/schema/monitoring"
import { SourceBadge } from "./source-badge"

export interface FavoriteItem {
  id: string
  sourceId: string
  sourceType: string
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
  favoritedAt: string | null
  engagement: MonitoringItemEngagement
  engagementScore: number
  templateId: string
  templateTitle: string
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0"
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`
  return String(n)
}

/**
 * Дубль title в content: см. одноимённую функцию в run-detail.tsx. Дублирована,
 * чтобы избежать создания shared utility для одной строчки — обе страницы
 * рендерят items независимо.
 */
function titleDuplicatesContent(title: string, content: string): boolean {
  const normTitle = title.replace(/\s+/g, " ").trim().toLowerCase()
  if (!normTitle) return false
  const head = content.replace(/\s+/g, " ").trim().slice(0, normTitle.length).toLowerCase()
  return head === normTitle
}

interface FavoritesShellProps {
  initialItems: FavoriteItem[]
}

function formatRussian(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function FavoritesShell({ initialItems }: FavoritesShellProps) {
  const [items, setItems] = useState<FavoriteItem[]>(initialItems)
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const hay = `${it.title ?? ""} ${it.content} ${it.sourceLabel ?? ""} ${it.templateTitle}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, search])

  const handleUnfavorite = async (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id))
    try {
      await fetch(`/api/monitoring/items/${id}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: false }),
      })
    } catch {
      // если упало — данные перезагрузятся при следующем заходе на страницу
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-white/[0.06] bg-white/[0.01] text-center">
        <HeartIcon className="size-10 text-neutral-500" />
        <div className="text-sm text-neutral-400">
          Здесь будут посты, которые ты пометил сердечком в результатах прогонов.
        </div>
        <Link href="/monitoring" className="text-sm text-sky-300 hover:text-sky-200">
          ← К мониторингу
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
          <Input
            placeholder="Поиск по тексту, заголовку, источнику…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-neutral-400 hover:text-white"
          >
            <XIcon className="size-3" /> Сбросить
          </button>
        )}
        <span className="shrink-0 text-xs text-neutral-500">
          {filtered.length} из {items.length}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02]">
        <ul className="min-w-0 space-y-3 p-4">
          {filtered.map((item) => {
            const isExp = expanded === item.id
            return (
              <li
                key={item.id}
                className="min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02] p-3"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <SourceBadge type={item.sourceType} url={item.sourceUrl} compact />
                    <span className="truncate">{item.sourceLabel ?? item.sourceUrl}</span>
                    <span className="shrink-0 rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-neutral-400">
                      {item.templateTitle}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={item.publishedAt ? "" : "italic text-neutral-500"}>
                      {item.publishedAt
                        ? formatRussian(item.publishedAt)
                        : "дата неизвестна"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUnfavorite(item.id)}
                      className="text-rose-400 hover:text-rose-300"
                      title="Убрать из избранного"
                    >
                      <HeartIcon className="size-4 fill-rose-400" />
                    </button>
                  </div>
                </div>
                {item.title && !titleDuplicatesContent(item.title, item.content) && (
                  <h4 className="mt-2 break-words font-medium text-white">{item.title}</h4>
                )}
                <EngagementRow item={item} />
                {item.content && (
                  <p
                    className={cn(
                      "mt-1 whitespace-pre-line break-all text-sm text-neutral-200",
                      !isExp && "line-clamp-5",
                    )}
                  >
                    {item.content}
                  </p>
                )}
                {item.matchType && item.matchType !== "none" && item.matchReason && (
                  <div
                    className={cn(
                      "mt-2 rounded-md border px-2 py-1.5 text-xs",
                      item.matchType === "close"
                        ? "border-emerald-800/40 bg-emerald-900/15 text-emerald-200"
                        : "border-amber-800/40 bg-amber-900/15 text-amber-200",
                    )}
                  >
                    <div className="font-medium">
                      {item.matchTopicName ?? "Тема"} ·{" "}
                      {item.matchType === "close" ? "близкое" : "косвенное"}
                    </div>
                    <div className="mt-0.5 text-neutral-300">{item.matchReason}</div>
                  </div>
                )}
                {item.images.length > 0 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {item.images.slice(0, 6).map((img, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={idx}
                        src={img.url}
                        alt=""
                        className="h-24 w-auto shrink-0 rounded-md object-cover"
                        loading="lazy"
                      />
                    ))}
                    {item.images.length > 6 && (
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-xs text-neutral-400">
                        +{item.images.length - 6} <ImageIcon className="ml-1 size-3" />
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <a
                    href={item.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
                  >
                    <ExternalLinkIcon className="size-3.5" /> Открыть первоисточник
                  </a>
                  {item.content.length > 240 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(isExp ? null : item.id)}
                      className="text-xs text-neutral-400 hover:text-white"
                    >
                      {isExp ? "Свернуть" : "Показать полностью"}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </ScrollArea>
    </div>
  )
}

function EngagementRow({ item }: { item: FavoriteItem }) {
  const e = item.engagement ?? {}
  const views = e.views ?? 0
  const reactionsTotal = e.reactionsTotal ?? 0
  const comments = e.comments ?? 0
  const forwards = e.forwards ?? 0
  if (views === 0 && reactionsTotal === 0 && comments === 0 && forwards === 0) return null
  const isHot = (item.engagementScore ?? 0) >= 1500
  const topReactions = (e.reactions ?? [])
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400">
      {isHot && (
        <span className="inline-flex items-center gap-0.5 rounded-sm border border-orange-700/40 bg-orange-900/15 px-1 py-0.5 text-orange-300">
          <FlameIcon className="size-3" />
          горячее
        </span>
      )}
      {views > 0 && (
        <span className="inline-flex items-center gap-0.5" title="Просмотры">
          <EyeIcon className="size-3" />
          {formatCompact(views)}
        </span>
      )}
      {reactionsTotal > 0 && (
        <span className="inline-flex items-center gap-0.5" title="Реакции">
          <HeartIcon className="size-3" />
          {formatCompact(reactionsTotal)}
          {topReactions.length > 0 && (
            <span className="ml-0.5 text-[10px] leading-none">
              {topReactions.map((r) => r.emoji).join("")}
            </span>
          )}
        </span>
      )}
      {comments > 0 && (
        <span className="inline-flex items-center gap-0.5" title="Комментарии">
          <MessageSquareIcon className="size-3" />
          {formatCompact(comments)}
        </span>
      )}
      {forwards > 0 && (
        <span className="inline-flex items-center gap-0.5" title="Репосты">
          <RepeatIcon className="size-3" />
          {formatCompact(forwards)}
        </span>
      )}
    </div>
  )
}
