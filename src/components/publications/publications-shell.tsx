"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ListChecks, Loader2, Plus, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RunListPanel } from "./run-list-panel"
import { RunDetailPanel } from "./run-detail-panel"
import { RubricBadges } from "./rubric-badges"
import { Input } from "@/components/ui/input"
import {
  FREE_POST_RUBRIC_ID,
  type ChannelCardData,
  type RubricCardData,
  type RunListItem,
  type RunDetail,
} from "./types"

interface PublicationsShellProps {
  channels: ChannelCardData[]
  rubrics: RubricCardData[]
  runs: RunListItem[]
  hasOpenRouterKey: boolean
  hasPerplexityKey: boolean
  hasOpenAiKey: boolean
}

const ACTIVE_STATUSES = new Set(["pending", "perplexity", "reddit", "topic", "compression", "writing"])

export function PublicationsShell({
  channels,
  rubrics,
  runs: initialRuns,
  hasOpenRouterKey,
  hasPerplexityKey,
  hasOpenAiKey,
}: PublicationsShellProps) {
  const router = useRouter()
  const [runs, setRuns] = useState<RunListItem[]>(initialRuns)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    initialRuns[0]?.id || null,
  )
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [starting, setStarting] = useState(false)
  const [rubricId, setRubricId] = useState<string>(
    rubrics.find((r) => r.isActive)?.id || rubrics[0]?.id || "",
  )
  // Опциональная подсказка темы — что искать в Perplexity для этого запуска.
  // Если пусто — pipeline идёт по общему промпту рубрики.
  const [topicHint, setTopicHint] = useState("")
  // Режим pipeline для запуска. По умолчанию инициализируется из рубрики
  // в эффекте ниже — пользователь видит реальный текущий выбор и может
  // переключить на лету.
  const [pipelineMode, setPipelineMode] = useState<"express" | "full">("express")

  const activeRubrics = useMemo(() => rubrics.filter((r) => r.isActive), [rubrics])
  const activeChannels = useMemo(() => channels.filter((c) => c.isActive), [channels])
  /** Группируем активные рубрики по каналу — селектор будет с разделами. */
  const channelGroups = useMemo(() => {
    const channelMap = new Map<string, ChannelCardData>(
      activeChannels.map((c) => [c.id, c]),
    )
    type Group = { channel: ChannelCardData | null; rubrics: RubricCardData[] }
    const grouped = new Map<string, Group>()
    // Изначально кладём все активные каналы — даже если в них нет рубрик
    // (для свободного поста они всё равно нужны).
    for (const c of activeChannels) {
      grouped.set(c.id, { channel: c, rubrics: [] })
    }
    grouped.set("__none__", { channel: null, rubrics: [] })
    for (const r of activeRubrics) {
      const key = r.channelId && channelMap.has(r.channelId) ? r.channelId : "__none__"
      const slot = grouped.get(key)
      if (slot) slot.rubrics.push(r)
    }
    // Удаляем «без канала», если он пуст
    const noneSlot = grouped.get("__none__")
    if (noneSlot && noneSlot.rubrics.length === 0) grouped.delete("__none__")
    return Array.from(grouped.values()).sort((a, b) => {
      if (!a.channel) return 1
      if (!b.channel) return -1
      return a.channel.title.localeCompare(b.channel.title, "ru")
    })
  }, [activeRubrics, activeChannels])

  const selectedRubric = useMemo(() => {
    if (!rubricId || rubricId.startsWith(FREE_POST_RUBRIC_ID)) return null
    return rubrics.find((r) => r.id === rubricId) || null
  }, [rubrics, rubricId])

  /** Если выбран свободный пост — это channel id, извлечь его. */
  const freePostChannelId = useMemo(() => {
    if (!rubricId?.startsWith(FREE_POST_RUBRIC_ID)) return null
    return rubricId.slice(FREE_POST_RUBRIC_ID.length + 1) || null
  }, [rubricId])
  const redditNeedsOpenAi = !!selectedRubric?.settings.redditEnabled && !hasOpenAiKey

  // При смене рубрики подтягиваем её дефолтный режим pipeline. Пользователь
  // может его переключить — следующая смена рубрики снова возьмёт её дефолт.
  useEffect(() => {
    if (selectedRubric?.settings.pipelineMode) {
      setPipelineMode(selectedRubric.settings.pipelineMode)
    }
  }, [selectedRubric?.id, selectedRubric?.settings.pipelineMode])

  const refetchDetail = useCallback(
    async (id: string): Promise<RunDetail | null> => {
      const response = await fetch(`/api/content/runs/${id}`, { cache: "no-store" })
      if (!response.ok) return null
      const data = (await response.json()) as { run?: RunDetail }
      return data.run || null
    },
    [],
  )

  // Polling детального состояния выбранного запуска, пока он в работе
  useEffect(() => {
    if (!selectedRunId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoadingDetail(true)
    refetchDetail(selectedRunId).then((r) => {
      if (!cancelled) {
        setDetail(r)
        setLoadingDetail(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [selectedRunId, refetchDetail])

  useEffect(() => {
    if (!detail) return
    if (!ACTIVE_STATUSES.has(detail.status)) return
    const interval = setInterval(async () => {
      const fresh = await refetchDetail(detail.id)
      if (!fresh) return
      setDetail(fresh)
      setRuns((prev) =>
        prev.map((r) =>
          r.id === fresh.id
            ? {
                ...r,
                status: fresh.status,
                stage: fresh.stage,
                postText: fresh.postText,
                errorStage: fresh.errorStage,
                errorMessage: fresh.errorMessage,
                totalCost: typeof fresh.costs?.total === "number" ? fresh.costs.total : r.totalCost,
                finishedAt: fresh.finishedAt,
              }
            : r,
        ),
      )
      if (!ACTIVE_STATUSES.has(fresh.status)) {
        clearInterval(interval)
      }
    }, 2500)
    return () => clearInterval(interval)
  }, [detail, refetchDetail])

  // Параллельный polling всех активных запусков в списке (а не только выбранного):
  // когда несколько пайплайнов крутятся одновременно, спиннеры на не-выбранных
  // тоже должны меняться на «Готово» без перезагрузки страницы.
  useEffect(() => {
    const activeIds = runs.filter((r) => ACTIVE_STATUSES.has(r.status)).map((r) => r.id)
    if (activeIds.length === 0) return
    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/content/runs/status?ids=${activeIds.join(",")}`,
          { cache: "no-store" },
        )
        if (!response.ok) return
        const data = (await response.json()) as {
          runs?: Array<{
            id: string
            status: RunListItem["status"]
            stage: RunListItem["stage"]
            errorStage: RunListItem["errorStage"]
            errorMessage: RunListItem["errorMessage"]
            postText: string | null
            totalCost: number | null
            finishedAt: string | null
          }>
        }
        if (!data.runs?.length) return
        setRuns((prev) =>
          prev.map((r) => {
            const fresh = data.runs!.find((f) => f.id === r.id)
            if (!fresh) return r
            return {
              ...r,
              status: fresh.status,
              stage: fresh.stage,
              errorStage: fresh.errorStage,
              errorMessage: fresh.errorMessage,
              postText: fresh.postText,
              totalCost: fresh.totalCost ?? r.totalCost,
              finishedAt: fresh.finishedAt,
            }
          }),
        )
      } catch {
        // молча — следующий тик попробует ещё раз
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [runs])

  const handleStart = useCallback(async () => {
    if (!rubricId) {
      toast.error("Выберите рубрику или канал")
      return
    }
    if (freePostChannelId && !topicHint.trim()) {
      toast.error('Для «Свободного поста» укажи тему в поле ниже')
      return
    }
    if (!hasOpenRouterKey) {
      toast.error("Не настроен ключ OpenRouter. Добавьте его в Настройках.")
      return
    }
    if (!hasPerplexityKey) {
      toast.error("Не настроен ключ Perplexity. Добавьте его в Настройках.")
      return
    }
    if (redditNeedsOpenAi) {
      toast.error(
        "Reddit-поиск включён в этой рубрике, но нет ключа OpenAI. Добавьте его или отключите Reddit в рубрике.",
      )
      return
    }
    setStarting(true)
    try {
      const response = await fetch("/api/content/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rubricId: freePostChannelId ? undefined : rubricId,
          channelId: freePostChannelId || undefined,
          topicHint: topicHint.trim() || undefined,
          pipelineMode,
        }),
      })
      const data = (await response.json()) as
        | { runId?: string; rubricSlug?: string; error?: string }
        | null
      if (!response.ok || !data?.runId) {
        toast.error(data?.error || "Не удалось запустить генерацию")
        return
      }
      // Добавляем новую запись в начало списка
      setRuns((prev) => [
        {
          id: data.runId!,
          rubricSlug: data.rubricSlug || selectedRubric?.slug || "",
          status: "pending",
          stage: "pending",
          errorStage: null,
          errorMessage: null,
          postText: null,
          totalCost: null,
          createdAt: new Date().toISOString(),
          finishedAt: null,
        },
        ...prev,
      ])
      setSelectedRunId(data.runId)
      setTopicHint("") // очищаем поле после старта
      toast.success("Запуск создан", {
        description: "Pipeline крутится в фоне — статус обновляется автоматически.",
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось запустить")
    } finally {
      setStarting(false)
    }
  }, [
    rubricId,
    topicHint,
    pipelineMode,
    hasOpenRouterKey,
    hasPerplexityKey,
    redditNeedsOpenAi,
    selectedRubric,
    freePostChannelId,
  ])

  const handleDelete = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/content/runs/${id}`, { method: "DELETE" })
      if (!response.ok) {
        toast.error("Не удалось удалить запуск")
        return
      }
      setRuns((prev) => prev.filter((r) => r.id !== id))
      if (selectedRunId === id) {
        setSelectedRunId(null)
        setDetail(null)
      }
    },
    [selectedRunId],
  )

  const handlePublishedChanged = useCallback(() => {
    router.refresh()
  }, [router])

  const handleCostUpdated = useCallback((runId: string, newTotalCost: number) => {
    setRuns((prev) =>
      prev.map((r) => (r.id === runId ? { ...r, totalCost: newTotalCost } : r)),
    )
  }, [])

  const keysWarning = useMemo(() => {
    const missing: string[] = []
    if (!hasOpenRouterKey) missing.push("OpenRouter")
    if (!hasPerplexityKey) missing.push("Perplexity")
    if (redditNeedsOpenAi) missing.push("OpenAI (для Reddit)")
    return missing
  }, [hasOpenRouterKey, hasPerplexityKey, redditNeedsOpenAi])

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden pt-4">
      <header className="flex flex-col gap-3 border-b border-white/[0.08] pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Публикации</h1>
          <p className="text-sm text-neutral-400">
            Сбор свежего контекста, выбор темы и генерация поста для Telegram.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={rubricId}
            onValueChange={(v) => v && setRubricId(v)}
            disabled={!activeRubrics.length}
          >
            <SelectTrigger className="min-w-[320px]">
              <SelectValue placeholder="Выберите канал и рубрику">
                {freePostChannelId ? (
                  <span className="inline-flex items-center gap-2 truncate">
                    <span className="truncate">
                      ✍️ Свободный пост ·{" "}
                      {activeChannels.find((c) => c.id === freePostChannelId)?.title || ""}
                    </span>
                  </span>
                ) : selectedRubric ? (
                  <span className="inline-flex items-center gap-2 truncate">
                    {(() => {
                      const ch = activeChannels.find((c) => c.id === selectedRubric.channelId)
                      return ch?.icon ? <span>{ch.icon}</span> : null
                    })()}
                    <span className="truncate">{selectedRubric.title}</span>
                  </span>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              alignItemWithTrigger={false}
              align="end"
              className="w-[480px] max-w-[calc(100vw-2rem)]"
            >
              {channelGroups.map(({ channel, rubrics: items }) => {
                const label = channel
                  ? `${channel.icon ? channel.icon + " " : ""}${channel.title}`
                  : "Без канала"
                return (
                  <SelectGroup key={channel?.id || "__none__"}>
                    <SelectLabel className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
                      {label}
                    </SelectLabel>
                    {channel && (
                      <SelectItem
                        value={`${FREE_POST_RUBRIC_ID}:${channel.id}`}
                        className="items-start py-2"
                      >
                        <span className="flex w-full min-w-0 flex-col items-start gap-0.5">
                          <span className="text-sm font-medium text-sky-200">
                            ✍️ Свободный пост
                          </span>
                          <span className="whitespace-normal break-words text-[11px] leading-snug text-neutral-500">
                            Задаёшь свою тему в поле ниже — pipeline идёт по дефолтам канала.
                          </span>
                        </span>
                      </SelectItem>
                    )}
                    {items.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="items-start py-2">
                        <span className="flex w-full min-w-0 flex-col items-start gap-1">
                          <span className="text-sm font-medium text-neutral-100">
                            {r.title}
                          </span>
                          {r.description && (
                            <span className="whitespace-normal break-words text-[11px] leading-snug text-neutral-500">
                              {r.description}
                            </span>
                          )}
                          <RubricBadges settings={r.settings} size="xs" />
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )
              })}
            </SelectContent>
          </Select>
          {/* Переключатель режима pipeline для этого запуска */}
          <ModeToggle value={pipelineMode} onChange={setPipelineMode} />
          <Button onClick={handleStart} disabled={starting || !activeRubrics.length}>
            {starting ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 size-4" />
            )}
            Создать пост
          </Button>
          <Button variant="outline" render={<Link href="/publications/topics" />}>
            <ListChecks className="mr-1.5 size-4" />
            Темы
          </Button>
          <Button variant="outline" render={<Link href="/publications/rubrics" />}>
            <Settings2 className="mr-1.5 size-4" />
            Рубрики
          </Button>
        </div>
      </header>

      {/* Поле «Тема поста» — опциональная подсказка для текущего запуска.
          Enter здесь = клик по «Создать пост». */}
      <div className="flex flex-col gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
        <label
          htmlFor="topic-hint"
          className="shrink-0 text-xs uppercase tracking-wide text-neutral-400"
        >
          Тема поста
        </label>
        <Input
          id="topic-hint"
          value={topicHint}
          onChange={(e) => setTopicHint(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              if (!starting && activeRubrics.length) void handleStart()
            }
          }}
          placeholder='Опционально: "Минфин повысил ставку НДС до 22%", "разбор кейса Вокфорс"… Enter — запуск'
          className="h-7 flex-1 border-white/[0.08] bg-white/[0.02] text-sm placeholder:text-neutral-600"
        />
        <span className="shrink-0 text-[11px] text-neutral-500 sm:max-w-[260px]">
          Пусто — pipeline сам выберет тему по рубрике.
        </span>
      </div>

      {keysWarning.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          <span className="font-medium">Не настроены ключи:</span>{" "}
          {keysWarning.map((p) => (
            <Badge key={p} variant="outline" className="mr-1.5 border-amber-500/30 text-amber-100">
              {p}
            </Badge>
          ))}
          — добавьте в{" "}
          <Link href="/settings" className="underline hover:text-amber-100">
            Настройках
          </Link>
          , иначе pipeline остановится на соответствующем шаге.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <RunListPanel
          runs={runs}
          rubrics={rubrics}
          channels={channels}
          selectedRunId={selectedRunId}
          onSelect={setSelectedRunId}
          onDelete={handleDelete}
        />
        <RunDetailPanel
          key={detail?.id || "empty"}
          rubric={detail ? rubrics.find((r) => r.id === detail.rubricId) || null : null}
          run={detail}
          loading={loadingDetail && !detail}
          onPublishedChanged={handlePublishedChanged}
          onCostUpdated={handleCostUpdated}
        />
      </div>
    </div>
  )
}

/**
 * Сегментированный Express / Full. Дефолт инициализируется из рубрики
 * (см. эффект в shell), пользователь может перевключить на лету —
 * это override на конкретный запуск, настройки рубрики не трогаются.
 */
function ModeToggle({
  value,
  onChange,
}: {
  value: "full" | "express"
  onChange: (v: "full" | "express") => void
}) {
  const options: Array<{ id: "full" | "express"; label: string; hint: string }> = [
    {
      id: "express",
      label: "Express",
      hint: "Perplexity + writer. Быстрее и дешевле для коротких постов.",
    },
    {
      id: "full",
      label: "Full",
      hint: "4 шага. Лучше для длинных лонгридов.",
    },
  ]
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5"
      title="Режим pipeline для этого запуска. Дефолт берётся из рубрики."
    >
      {options.map((opt) => {
        const isActive = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            title={opt.hint}
            className={
              isActive
                ? "rounded-md bg-sky-500/20 px-2 py-1 text-xs font-medium text-sky-100"
                : "rounded-md px-2 py-1 text-xs text-neutral-400 hover:text-white"
            }
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
