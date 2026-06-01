"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Loader2Icon,
  ExternalLinkIcon,
  ImageIcon,
  AlertCircleIcon,
  ChevronRightIcon,
  SearchIcon,
  FilterIcon,
  HeartIcon,
  XIcon,
  ArrowDownUpIcon,
  EyeIcon,
  MessageSquareIcon,
  RepeatIcon,
  FlameIcon,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { ItemCard, RunCard } from "./types"
import { SourceBadge } from "./source-badge"
import { categorizeSource } from "@/lib/monitoring/categorize-source"

interface RunDetailProps {
  runId: string | null
  onRunUpdated: (run: RunCard) => void
}

interface FetchResponse {
  run: RunCard
  items: ItemCard[]
}

const ACTIVE_STATUSES = new Set(["pending", "fetching", "classifying"])

type SortMode = "newest" | "oldest" | "hottest" | "source"

const SORT_OPTIONS: Array<{ id: SortMode; label: string; hint: string }> = [
  { id: "newest", label: "Сначала новые", hint: "по дате публикации" },
  { id: "oldest", label: "Сначала старые", hint: "по дате публикации" },
  { id: "hottest", label: "Сначала горячие", hint: "views + реакции + комменты" },
  { id: "source", label: "По источникам", hint: "сгруппировано" },
]

function formatRussian(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Сравнивает посты по выбранному режиму сортировки. Стабильна:
 * при равенстве основного ключа сваливается к publishedAt DESC.
 */
function compareItems(a: ItemCard, b: ItemCard, mode: SortMode): number {
  const aTs = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
  const bTs = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
  switch (mode) {
    case "newest":
      return bTs - aTs
    case "oldest":
      return aTs - bTs
    case "hottest": {
      const diff = (b.engagementScore ?? 0) - (a.engagementScore ?? 0)
      if (diff !== 0) return diff
      return bTs - aTs
    }
    case "source": {
      const aSrc = (a.sourceLabel ?? a.sourceUrl).toLowerCase()
      const bSrc = (b.sourceLabel ?? b.sourceUrl).toLowerCase()
      const cmp = aSrc.localeCompare(bSrc, "ru")
      if (cmp !== 0) return cmp
      return bTs - aTs
    }
  }
}

/**
 * Возвращает true, если заголовок уже виден в начале контента (т.е. в карточке
 * будет визуальный дубль). Сравниваем нормализованные строки: trim, схлоп
 * пробелов, обрезка по длине title.
 *
 * Случаи, которые покрывает:
 *  - TG-парсер раньше ставил title = первая строка content (теперь не ставит,
 *    но в БД остались записи);
 *  - RSS-посты, где description начинается с заголовка статьи (типичный
 *    кейс для glavkniga, garant.ru — `<title>` повторён в начале текста).
 */
function titleDuplicatesContent(title: string, content: string): boolean {
  const normTitle = title.replace(/\s+/g, " ").trim().toLowerCase()
  if (!normTitle) return false
  const head = content.replace(/\s+/g, " ").trim().slice(0, normTitle.length).toLowerCase()
  return head === normTitle
}

/** Форматирует «1234» → «1.2K», «12345» → «12K», «1234567» → «1.2M». */
function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0"
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`
  return String(n)
}

export function RunDetail({ runId, onRunUpdated }: RunDetailProps) {
  const [run, setRun] = useState<RunCard | null>(null)
  const [items, setItems] = useState<ItemCard[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>("newest")

  const reload = useCallback(async () => {
    if (!runId) {
      setRun(null)
      setItems([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/monitoring/runs/${runId}`)
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Не удалось загрузить запуск")
      }
      const data = (await res.json()) as FetchResponse
      setRun(data.run)
      setItems(data.items)
      onRunUpdated(data.run)
      // Помечаем просмотренным (один раз, только когда done)
      if (data.run.status === "done" && !data.run.viewedAt) {
        await fetch(`/api/monitoring/runs/${runId}/view`, { method: "POST" })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }, [runId, onRunUpdated])

  useEffect(() => {
    void reload()
  }, [reload])

  // Поллим если запуск активен
  useEffect(() => {
    if (!run || !ACTIVE_STATUSES.has(run.status)) return
    const t = setInterval(() => void reload(), 3000)
    return () => clearInterval(t)
  }, [run?.status, reload])

  /**
   * Уникальные источники из items, сгруппированные по категории — для
   * фильтра-чекбоксов. Внутри категории сортируем по числу постов.
   */
  const availableSources = useMemo(() => {
    const map = new Map<string, { label: string; count: number; type: string; url: string }>()
    for (const item of items) {
      const key = item.sourceId
      const label = item.sourceLabel ?? item.sourceUrl
      const existing = map.get(key)
      map.set(key, {
        label,
        count: (existing?.count ?? 0) + 1,
        type: item.sourceType,
        url: item.sourceUrl,
      })
    }
    const flat = Array.from(map.entries()).map(([id, info]) => ({
      id,
      ...info,
      category: categorizeSource({ type: info.type as "telegram" | "website", url: info.url })
        .category,
    }))
    // Группируем по категории: messenger → social → site
    const order: Array<"messenger" | "social" | "site"> = ["messenger", "social", "site"]
    const labels = { messenger: "Мессенджеры", social: "Соцсети", site: "Сайты" }
    return order
      .map((cat) => ({
        category: cat,
        label: labels[cat],
        items: flat.filter((s) => s.category === cat).sort((a, b) => b.count - a.count),
      }))
      .filter((g) => g.items.length > 0)
  }, [items])

  /** Items после применения поиска + фильтра по источникам + только избранное. */
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = items.filter((it) => {
      if (selectedSources.size > 0 && !selectedSources.has(it.sourceId)) return false
      if (favoritesOnly && !it.isFavorite) return false
      if (query) {
        const hay = `${it.title ?? ""} ${it.content} ${it.sourceLabel ?? ""}`.toLowerCase()
        if (!hay.includes(query)) return false
      }
      return true
    })
    // Сортировка применяется глобально к feed-режиму и внутри групп для topics.
    // Сортируем ВСЁ — а группировка ниже сохранит порядок благодаря стабильности.
    return [...filtered].sort((a, b) => compareItems(a, b, sortMode))
  }, [items, search, selectedSources, favoritesOnly, sortMode])

  const grouped = useMemo(() => {
    const close: ItemCard[] = []
    const indirect: ItemCard[] = []
    const others: ItemCard[] = []
    for (const item of filteredItems) {
      if (item.matchType === "close") close.push(item)
      else if (item.matchType === "indirect") indirect.push(item)
      else others.push(item)
    }
    return { close, indirect, others }
  }, [filteredItems])

  /**
   * Для sortMode="source" группируем по источнику. Возвращаем массив групп,
   * каждая — { sourceId, label, items }. Используется только в feed-режиме;
   * в topics-режиме приоритет за match-группировкой.
   */
  const groupedBySource = useMemo(() => {
    if (sortMode !== "source") return null
    const map = new Map<string, { label: string; type: string; url: string; items: ItemCard[] }>()
    for (const item of filteredItems) {
      const key = item.sourceId
      const existing = map.get(key)
      if (existing) {
        existing.items.push(item)
      } else {
        map.set(key, {
          label: item.sourceLabel ?? item.sourceUrl,
          type: item.sourceType,
          url: item.sourceUrl,
          items: [item],
        })
      }
    }
    return Array.from(map.entries()).map(([sourceId, info]) => ({ sourceId, ...info }))
  }, [filteredItems, sortMode])

  const handleToggleFavorite = useCallback(async (id: string) => {
    const target = items.find((x) => x.id === id)
    if (!target) return
    const next = !target.isFavorite
    // Оптимистичный апдейт
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, isFavorite: next } : it)))
    try {
      const res = await fetch(`/api/monitoring/items/${id}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      })
      if (!res.ok) throw new Error("Ошибка сохранения")
    } catch {
      // Откатить
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, isFavorite: !next } : it)))
    }
  }, [items])

  const toggleSource = useCallback((sourceId: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }, [])

  const clearFilters = useCallback(() => {
    setSearch("")
    setSelectedSources(new Set())
    setFavoritesOnly(false)
  }, [])

  const hasActiveFilters = search || selectedSources.size > 0 || favoritesOnly
  const sortLabel = SORT_OPTIONS.find((o) => o.id === sortMode)?.label ?? ""

  if (!runId) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-white/[0.06] bg-white/[0.01] text-sm text-neutral-500">
        Выберите запуск слева, чтобы посмотреть найденные посты.
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-white/[0.08] bg-white/[0.02]">
      {error && (
        <div className="flex items-start gap-2 border-b border-rose-800/30 bg-rose-950/30 px-4 py-2 text-sm text-rose-300">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <div>{error}</div>
        </div>
      )}
      {loading && !run && (
        <div className="flex items-center justify-center p-10 text-sm text-neutral-500">
          <Loader2Icon className="mr-2 size-4 animate-spin" /> Загрузка…
        </div>
      )}
      {run && (
        <>
          <div className="border-b border-white/[0.06] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-white">Запуск от {formatRussian(run.createdAt)}</span>
              <Badge variant="outline" className="border-white/[0.1] text-neutral-300">
                {run.mode === "topics" ? "по темам" : "сырая лента"}
              </Badge>
              {run.artifacts.reusedFromRunId && (
                <Badge
                  variant="outline"
                  className="border-cyan-700/40 text-cyan-300"
                  title="Использован кэш недавнего прогона — источники не дёргались повторно"
                >
                  кэш
                </Badge>
              )}
              {run.status === "done" && (
                <span className="text-xs text-neutral-400">
                  {run.itemsFound} постов
                  {run.mode === "topics" && ` · ${run.itemsMatched} совпадений`}
                  {Number(run.cost) > 0 && ` · $${Number(run.cost).toFixed(4)}`}
                </span>
              )}
              {ACTIVE_STATUSES.has(run.status) && (
                <ProgressBadge run={run} />
              )}
              {run.status === "error" && run.errorMessage && (
                <span className="text-xs text-rose-300">{run.errorMessage}</span>
              )}
            </div>
            {run.artifacts.sourceLog && run.artifacts.sourceLog.length > 0 && (
              <SourceLogPreview log={run.artifacts.sourceLog} />
            )}
          </div>

          {/* Панель фильтров — поиск, источники, избранное */}
          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
                <Input
                  placeholder="Поиск по тексту, заголовку, источнику…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className={cn(
                        "flex h-8 shrink-0 items-center gap-1 rounded-md border border-white/[0.08] px-2 text-xs transition-colors hover:bg-white/[0.04]",
                        selectedSources.size > 0 && "border-sky-700/50 bg-sky-700/15 text-sky-200",
                      )}
                    />
                  }
                >
                  <FilterIcon className="size-3.5" />
                  <span>
                    Источники
                    {selectedSources.size > 0 && ` · ${selectedSources.size}`}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80">
                  {availableSources.map((group, gIdx) => (
                    <DropdownMenuGroup key={group.category}>
                      {gIdx > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                      {group.items.map((s) => (
                        <DropdownMenuCheckboxItem
                          key={s.id}
                          checked={selectedSources.has(s.id)}
                          onCheckedChange={() => toggleSource(s.id)}
                        >
                          <span className="flex w-full items-center gap-2">
                            <SourceBadge type={s.type} url={s.url} compact />
                            <span className="min-w-0 flex-1 truncate">{s.label}</span>
                            <span className="shrink-0 text-xs text-neutral-500">{s.count}</span>
                          </span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuGroup>
                  ))}
                  {selectedSources.size > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <button
                        type="button"
                        onClick={() => setSelectedSources(new Set())}
                        className="w-full px-2 py-1.5 text-left text-xs text-neutral-400 hover:bg-white/[0.04] hover:text-white"
                      >
                        Сбросить
                      </button>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className={cn(
                        "flex h-8 shrink-0 items-center gap-1 rounded-md border border-white/[0.08] px-2 text-xs transition-colors hover:bg-white/[0.04]",
                        sortMode !== "newest" && "border-amber-700/50 bg-amber-700/15 text-amber-200",
                      )}
                      title={`Сортировка: ${sortLabel}`}
                    />
                  }
                >
                  <ArrowDownUpIcon className="size-3.5" />
                  <span className="hidden truncate sm:inline">{sortLabel}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64">
                  {/* Label идёт ПОЛНОЦЕННЫМ заголовком меню, поэтому
                      вне любой группы. Чтобы не словить Base UI #31
                      (MenuGroupRootContext missing) — оборачиваем в
                      Group явно, даже если он один. */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Сортировка</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuRadioGroup
                    value={sortMode}
                    onValueChange={(v) => setSortMode(v as SortMode)}
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <DropdownMenuRadioItem key={opt.id} value={opt.id}>
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          <span className="text-[10px] text-neutral-500">{opt.hint}</span>
                        </div>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                onClick={() => setFavoritesOnly((v) => !v)}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1 rounded-md border border-white/[0.08] px-2 text-xs transition-colors hover:bg-white/[0.04]",
                  favoritesOnly && "border-rose-700/50 bg-rose-700/15 text-rose-200",
                )}
                title="Только избранное"
              >
                <HeartIcon className={cn("size-3.5", favoritesOnly && "fill-rose-400 text-rose-400")} />
                <span className="hidden sm:inline">Избранное</span>
              </button>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-neutral-400 hover:text-white"
                >
                  <XIcon className="size-3" /> Сбросить
                </button>
              )}
              <span className="shrink-0 text-xs text-neutral-500">
                {filteredItems.length} из {items.length}
              </span>
            </div>
          )}

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-6 p-4">
              {run.mode === "topics" && grouped.close.length > 0 && (
                <ItemGroup
                  label="Близкое совпадение"
                  color="emerald"
                  items={grouped.close}
                  expandedItemId={expandedItemId}
                  onExpand={setExpandedItemId}
                  onToggleFavorite={handleToggleFavorite}
                />
              )}
              {run.mode === "topics" && grouped.indirect.length > 0 && (
                <ItemGroup
                  label="Косвенное совпадение"
                  color="amber"
                  items={grouped.indirect}
                  expandedItemId={expandedItemId}
                  onExpand={setExpandedItemId}
                  onToggleFavorite={handleToggleFavorite}
                />
              )}
              {run.mode === "feed" && groupedBySource && (
                <div className="space-y-6">
                  {groupedBySource.map((g) => (
                    <ItemGroup
                      key={g.sourceId}
                      label={g.label}
                      color="neutral"
                      items={g.items}
                      expandedItemId={expandedItemId}
                      onExpand={setExpandedItemId}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              )}
              {(run.mode === "feed" || grouped.others.length > 0) &&
                !(run.mode === "feed" && groupedBySource) && (
                  <ItemGroup
                    label={run.mode === "feed" ? "Все посты" : "Без совпадения"}
                    color="neutral"
                    items={run.mode === "feed" ? filteredItems : grouped.others}
                    expandedItemId={expandedItemId}
                    onExpand={setExpandedItemId}
                    onToggleFavorite={handleToggleFavorite}
                  />
                )}
              {!loading && items.length === 0 && run.status === "done" && (
                <div className="rounded-md border border-dashed border-white/[0.06] p-6 text-center text-sm text-neutral-500">
                  За этот период ничего подходящего не нашлось.
                  {run.sourcesFailed > 0 && (
                    <div className="mt-1 text-xs text-rose-400">
                      Часть источников вернула ошибки ({run.sourcesFailed} из {run.sourcesTotal}).
                      Смотрите журнал выше.
                    </div>
                  )}
                </div>
              )}
              {items.length > 0 && filteredItems.length === 0 && (
                <div className="rounded-md border border-dashed border-white/[0.06] p-6 text-center text-sm text-neutral-500">
                  Ничего не подходит под фильтр. Попробуйте сбросить.
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  )
}

function ProgressBadge({ run }: { run: RunCard }) {
  const log = run.artifacts.classifierLog
  const done = log?.batchesProcessed ?? 0
  const total = log?.batchesTotal ?? 0
  const avgMs = log?.avgBatchMs ?? 0

  if (run.status === "fetching") {
    return (
      <span className="flex items-center gap-1 text-xs text-sky-400">
        <Loader2Icon className="size-3 animate-spin" />
        Собираю посты со {run.sourcesTotal || "всех"} источников…
      </span>
    )
  }
  if (run.status === "classifying") {
    const remainingBatches = Math.max(0, total - done)
    const remainingMs = remainingBatches * avgMs
    const remainingMin = Math.ceil(remainingMs / 60_000)
    const remainingText =
      total > 0 && avgMs > 0
        ? remainingMin <= 1
          ? "осталось <1 мин"
          : `осталось ~${remainingMin} мин`
        : "оцениваю время…"
    const percent = total > 0 ? Math.round((done / total) * 100) : 0
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs text-sky-400">
        <Loader2Icon className="size-3 animate-spin" />
        <span>
          Классификация: {done} из {total} батчей
          {total > 0 && <span className="text-neutral-500"> · {percent}%</span>}
          {avgMs > 0 && (
            <span className="text-neutral-500"> · {remainingText}</span>
          )}
        </span>
        {total > 0 && (
          <span className="block h-1 w-32 overflow-hidden rounded-full bg-white/[0.06]">
            <span
              className="block h-full bg-sky-500/70 transition-all"
              style={{ width: `${percent}%` }}
            />
          </span>
        )}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-sky-400">
      <Loader2Icon className="size-3 animate-spin" />
      Старт
    </span>
  )
}

function SourceLogPreview({
  log,
}: {
  log: NonNullable<RunCard["artifacts"]["sourceLog"]>
}) {
  const failed = log.filter((l) => l.status === "error")
  const empty = log.filter((l) => l.status === "empty")
  const ok = log.filter((l) => l.status === "ok")
  return (
    <Collapsible className="mt-2">
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="group flex items-center gap-1 text-xs text-neutral-400 hover:text-white"
          />
        }
      >
        <ChevronRightIcon className="size-3 transition-transform group-data-[panel-open]:rotate-90" />
        Журнал источников: <span className="text-emerald-400">{ok.length} ok</span>
        {empty.length > 0 && (
          <>
            · <span className="text-neutral-500">{empty.length} пусто</span>
          </>
        )}
        {failed.length > 0 && (
          <>
            · <span className="text-rose-400">{failed.length} ошибок</span>
          </>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 max-h-48 space-y-1 overflow-auto pr-2 text-xs">
        {log.map((entry) => (
          <div
            key={`${entry.sourceId}-${entry.url}`}
            className="flex items-start gap-2 rounded border border-white/[0.04] bg-white/[0.02] px-2 py-1"
          >
            <span className="mt-0.5">
              <SourceBadge type={entry.type} url={entry.url} compact />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-neutral-200">{entry.label ?? entry.url}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "px-1 py-0 text-[10px]",
                    entry.status === "ok" && "border-emerald-700/40 text-emerald-300",
                    entry.status === "empty" && "border-neutral-700 text-neutral-400",
                    entry.status === "error" && "border-rose-700/40 text-rose-300",
                  )}
                >
                  {entry.status === "ok"
                    ? `${entry.itemsCount} шт.`
                    : entry.status === "empty"
                      ? "пусто"
                      : "ошибка"}
                </Badge>
              </div>
              {entry.errorMessage && (
                <div className="mt-0.5 text-rose-300">{entry.errorMessage}</div>
              )}
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

interface ItemGroupProps {
  label: string
  color: "emerald" | "amber" | "neutral"
  items: ItemCard[]
  expandedItemId: string | null
  onExpand: (id: string | null) => void
  onToggleFavorite: (id: string) => void
}

const COLOR_BADGE: Record<ItemGroupProps["color"], string> = {
  emerald: "border-emerald-700/40 bg-emerald-900/20 text-emerald-300",
  amber: "border-amber-700/40 bg-amber-900/20 text-amber-300",
  neutral: "border-white/[0.08] bg-white/[0.04] text-neutral-300",
}

function ItemGroup({
  label,
  color,
  items,
  expandedItemId,
  onExpand,
  onToggleFavorite,
}: ItemGroupProps) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
            COLOR_BADGE[color],
          )}
        >
          {label}
        </span>
        <span className="text-xs text-neutral-500">{items.length}</span>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <ItemCardView
            key={item.id}
            item={item}
            expanded={expandedItemId === item.id}
            onToggle={() => onExpand(expandedItemId === item.id ? null : item.id)}
            onToggleFavorite={() => onToggleFavorite(item.id)}
          />
        ))}
      </ul>
    </section>
  )
}

/**
 * Компактная полоска метрик: иконка + число для views/reactions/comments/forwards.
 * Скрывается полностью, если данных нет (например, у RSS-новости).
 */
function EngagementBadges({ item }: { item: ItemCard }) {
  const e = item.engagement ?? {}
  const views = e.views ?? 0
  const reactionsTotal = e.reactionsTotal ?? 0
  const comments = e.comments ?? 0
  const forwards = e.forwards ?? 0
  const hasAny = views > 0 || reactionsTotal > 0 || comments > 0 || forwards > 0
  if (!hasAny) return null

  // «Горячий» — score сильно выше среднего. Порог 1500 ≈ 100 просмотров и 100 реакций
  // или 200 реакций без просмотров. Эмпирически — выделяет ~10-15% постов в типичной выдаче.
  const isHot = (item.engagementScore ?? 0) >= 1500

  // Топ-3 эмодзи в реакциях — для подсказки «что зашло».
  const topReactions = (e.reactions ?? [])
    .slice() // не мутируем
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400">
      {isHot && (
        <span
          className="inline-flex items-center gap-0.5 rounded-sm border border-orange-700/40 bg-orange-900/15 px-1 py-0.5 text-orange-300"
          title="Высокая вовлечённость"
        >
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

function ItemCardView({
  item,
  expanded,
  onToggle,
  onToggleFavorite,
}: {
  item: ItemCard
  expanded: boolean
  onToggle: () => void
  onToggleFavorite: () => void
}) {
  return (
    <li className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
        <div className="flex min-w-0 items-center gap-1.5">
          <SourceBadge type={item.sourceType} url={item.sourceUrl} compact />
          <span className="truncate">{item.sourceLabel ?? item.sourceUrl}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={item.publishedAt ? "" : "italic text-neutral-500"}>
            {item.publishedAt ? formatRussian(item.publishedAt) : "дата неизвестна"}
          </span>
          <button
            type="button"
            onClick={onToggleFavorite}
            className={cn(
              "transition-colors",
              item.isFavorite
                ? "text-rose-400 hover:text-rose-300"
                : "text-neutral-500 hover:text-rose-400",
            )}
            title={item.isFavorite ? "Убрать из избранного" : "В избранное"}
          >
            <HeartIcon
              className={cn("size-4", item.isFavorite && "fill-rose-400")}
            />
          </button>
        </div>
      </div>
      {item.title && !titleDuplicatesContent(item.title, item.content) && (
        <h4 className="mt-2 break-words font-medium text-white">{item.title}</h4>
      )}
      <EngagementBadges item={item} />
      {item.content && (
        <p
          className={cn(
            "mt-1 whitespace-pre-line break-all text-sm text-neutral-200",
            !expanded && "line-clamp-5",
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
            {item.matchTopicName ?? "Тема"} · {item.matchType === "close" ? "близкое" : "косвенное"}
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
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onToggle}>
            {expanded ? "Свернуть" : "Показать полностью"}
          </Button>
        )}
      </div>
    </li>
  )
}
