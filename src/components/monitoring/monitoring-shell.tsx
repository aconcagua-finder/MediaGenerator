"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import {
  PlusIcon,
  PlayIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
  RadarIcon,
  AlertTriangleIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  HeartIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import type { TemplateCard, RunCard } from "./types"
import { TemplateEditor } from "./template-editor"
import { RunList } from "./run-list"
import { RunDetail } from "./run-detail"
import { SourcesPanel } from "./sources-panel"
import { TopicsPanel } from "./topics-panel"
import { SchedulePanel } from "./schedule-panel"

interface MonitoringShellProps {
  initialTemplates: TemplateCard[]
  initialRuns: RunCard[]
  hasOpenRouterKey: boolean
}

const INTERVAL_PRESETS: Array<{ days: number; label: string }> = [
  { days: 1, label: "За день" },
  { days: 3, label: "3 дня" },
  { days: 7, label: "Неделя" },
  { days: 14, label: "2 недели" },
  { days: 30, label: "Месяц" },
]

export function MonitoringShell({
  initialTemplates,
  initialRuns,
  hasOpenRouterKey,
}: MonitoringShellProps) {
  const [templates, setTemplates] = useState<TemplateCard[]>(initialTemplates)
  const [runs, setRuns] = useState<RunCard[]>(initialRuns)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplates[0]?.id ?? null,
  )
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TemplateCard | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<TemplateCard | null>(null)
  const [intervalDays, setIntervalDays] = useState<number>(1)
  const [customInterval, setCustomInterval] = useState<string>("")
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [isLaunching, startLaunch] = useTransition()

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  )

  // Применяем дефолт периода при смене шаблона.
  // Также сбрасываем selectedRunId — иначе в правой панели остаётся
  // прошлый запуск из другого шаблона.
  useEffect(() => {
    if (!selectedTemplate) return
    setIntervalDays(selectedTemplate.defaultIntervalDays)
    setCustomInterval("")
    setSelectedRunId(null)
  }, [selectedTemplate?.id, selectedTemplate?.defaultIntervalDays])

  const filteredRuns = useMemo(
    () => runs.filter((r) => r.templateId === selectedTemplateId),
    [runs, selectedTemplateId],
  )

  // Авто-обновление runs пока есть активные (pending/fetching/classifying)
  useEffect(() => {
    if (!selectedTemplateId) return
    const hasActive = filteredRuns.some((r) =>
      r.status === "pending" || r.status === "fetching" || r.status === "classifying",
    )
    if (!hasActive) return
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/monitoring/runs?templateId=${selectedTemplateId}&limit=20`)
        if (!res.ok) return
        const data = (await res.json()) as { runs: RunCard[] }
        if (Array.isArray(data.runs)) {
          setRuns((prev) => {
            const others = prev.filter((r) => r.templateId !== selectedTemplateId)
            return [...others, ...data.runs].sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            )
          })
        }
      } catch {
        // молча
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [filteredRuns, selectedTemplateId])

  const handleLaunch = useCallback(() => {
    if (!selectedTemplate) return
    if (selectedTemplate.mode === "topics" && !hasOpenRouterKey) {
      toast.error("Нужен API-ключ OpenRouter — добавьте его в настройках")
      return
    }
    const days =
      customInterval && Number(customInterval) > 0
        ? Math.min(30, Math.max(1, Number(customInterval)))
        : intervalDays

    startLaunch(async () => {
      try {
        const res = await fetch("/api/monitoring/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId: selectedTemplate.id, intervalDays: days }),
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({ error: "Ошибка запуска" }))) as { error?: string }
          throw new Error(err.error ?? "Ошибка запуска")
        }
        const data = (await res.json()) as { run: RunCard }
        setRuns((prev) => [data.run, ...prev])
        setSelectedRunId(data.run.id)
        toast.success("Запуск стартовал — сбор постов идёт")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ошибка запуска")
      }
    })
  }, [selectedTemplate, hasOpenRouterKey, customInterval, intervalDays])

  const refreshTemplates = useCallback(async () => {
    const res = await fetch("/api/monitoring/templates")
    if (!res.ok) return
    const data = (await res.json()) as { templates: TemplateCard[] }
    setTemplates(data.templates ?? [])
  }, [])

  const handleSaveTemplate = useCallback(
    async (saved: TemplateCard) => {
      setTemplates((prev) => {
        const exists = prev.some((t) => t.id === saved.id)
        if (exists) return prev.map((t) => (t.id === saved.id ? saved : t))
        return [...prev, saved]
      })
      setSelectedTemplateId(saved.id)
      setEditorOpen(false)
      setEditingTemplate(null)
    },
    [],
  )

  const handleDeleteTemplate = useCallback(async () => {
    if (!deleteCandidate) return
    const id = deleteCandidate.id
    setDeleteCandidate(null)
    try {
      const res = await fetch(`/api/monitoring/templates/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({ error: "Не удалось удалить" }))) as {
          error?: string
        }
        throw new Error(data.error ?? "Не удалось удалить")
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      if (selectedTemplateId === id) {
        setSelectedTemplateId(templates.find((t) => t.id !== id)?.id ?? null)
      }
      toast.success("Шаблон удалён")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка удаления")
    }
  }, [deleteCandidate, selectedTemplateId, templates])

  const handleRunDeleted = useCallback((id: string) => {
    setRuns((prev) => prev.filter((r) => r.id !== id))
    if (selectedRunId === id) setSelectedRunId(null)
  }, [selectedRunId])

  if (templates.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-20 text-center">
        <RadarIcon className="size-12 text-neutral-500" />
        <h2 className="text-xl font-semibold">Мониторинг пуст</h2>
        <p className="text-sm text-neutral-400">
          Создайте первый шаблон — задайте источники (Telegram-каналы и сайты),
          выберите режим и запустите сбор постов.
        </p>
        <Button
          onClick={() => {
            setEditingTemplate(null)
            setEditorOpen(true)
          }}
        >
          <PlusIcon className="mr-2 size-4" /> Создать шаблон
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col gap-3 overflow-x-hidden">
      {/*
        Единая шапка: заголовок + табы шаблонов + действия в одной строке.
        Главное правило: внешний контейнер ограничен по ширине (w-full),
        а блок с табами получает `min-w-0 basis-0 grow` + явный
        `overflow-x-auto` — это позволяет ему сжиматься меньше intrinsic-size
        и скроллиться горизонтально, не растягивая родителя за пределы viewport.
      */}
      <div
        className="grid items-center gap-2 border-b border-white/[0.06] pb-2"
        style={{
          gridTemplateColumns: "auto auto minmax(0, 1fr) auto auto",
        }}
      >
        <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <RadarIcon className="size-4 text-sky-400" />
          <span>Мониторинг</span>
        </div>
        <div className="h-5 w-px bg-white/[0.06]" />
        <div
          className="flex min-w-0 items-center gap-1.5 overflow-x-auto"
          style={{ scrollbarWidth: "thin" }}
        >
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTemplateId(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors",
                t.id === selectedTemplateId
                  ? "border-white/[0.18] bg-white/[0.06] text-white"
                  : "border-white/[0.06] text-neutral-400 hover:bg-white/[0.04] hover:text-white",
              )}
            >
              <span className="font-medium">{t.title}</span>
              {t.isBuiltin && (
                <Badge variant="outline" className="border-cyan-700/40 px-1 py-0 text-[10px] text-cyan-300">
                  базовый
                </Badge>
              )}
              {!t.isActive && (
                <Badge variant="outline" className="border-neutral-700 px-1 py-0 text-[10px] text-neutral-400">
                  выкл
                </Badge>
              )}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingTemplate(null)
            setEditorOpen(true)
          }}
        >
          <PlusIcon className="mr-1 size-4" /> Новый
        </Button>
        <Link
          href="/monitoring/favorites"
          className="flex items-center gap-1 rounded-md border border-white/[0.08] px-2.5 py-1 text-sm text-neutral-300 transition-colors hover:bg-white/[0.04] hover:text-white"
          title="Избранные посты"
        >
          <HeartIcon className="size-3.5 text-rose-400" />
          <span className="hidden sm:inline">Избранное</span>
        </Link>
      </div>

      {selectedTemplate ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* Свёрнутая шапка — только название и кнопка-развернуть */}
          {headerCollapsed && (
            <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-sm">
              <h2 className="truncate font-semibold text-white">{selectedTemplate.title}</h2>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 px-1.5 py-0 text-[10px]",
                  selectedTemplate.mode === "topics"
                    ? "border-violet-700/40 text-violet-300"
                    : "border-sky-700/40 text-sky-300",
                )}
              >
                {selectedTemplate.mode === "topics" ? "по темам" : "лента"}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7"
                onClick={handleLaunch}
                disabled={isLaunching || !selectedTemplate.isActive}
              >
                {isLaunching ? (
                  <Loader2Icon className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <PlayIcon className="mr-1 size-3.5" />
                )}
                Запуск
              </Button>
              <button
                type="button"
                onClick={() => setHeaderCollapsed(false)}
                className="rounded p-1 text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                title="Развернуть настройки"
              >
                <ChevronDownIcon className="size-4" />
              </button>
            </div>
          )}
          {/* Полная шапка */}
          {!headerCollapsed && (
          <div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex min-w-0 max-w-full items-center gap-2">
                <h2 className="truncate text-base font-semibold text-white">
                  {selectedTemplate.title}
                </h2>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 px-1.5 py-0 text-[10px]",
                    selectedTemplate.mode === "topics"
                      ? "border-violet-700/40 text-violet-300"
                      : "border-sky-700/40 text-sky-300",
                  )}
                >
                  {selectedTemplate.mode === "topics" ? "по темам (AI)" : "сырая лента"}
                </Badge>
                {selectedTemplate.schedule.enabled && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-700/40 px-1.5 py-0 text-[10px] text-amber-300"
                  >
                    авто: {selectedTemplate.schedule.intervalHours}ч
                  </Badge>
                )}
                <span className="shrink-0 text-xs text-neutral-500">
                  {selectedTemplate.sources.filter((s) => !s.disabled).length} ист.
                  {selectedTemplate.mode === "topics" && ` · ${selectedTemplate.topics.length} тем`}
                </span>
              </div>

              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {INTERVAL_PRESETS.map((p) => (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => {
                        setIntervalDays(p.days)
                        setCustomInterval("")
                      }}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs transition-colors",
                        intervalDays === p.days && !customInterval
                          ? "border-sky-700/50 bg-sky-700/15 text-sky-200"
                          : "border-white/[0.08] text-neutral-300 hover:bg-white/[0.04]",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={30}
                    placeholder="свой"
                    value={customInterval}
                    onChange={(e) => setCustomInterval(e.target.value)}
                    className="h-7 w-16 rounded-md border border-white/[0.08] bg-transparent px-2 text-xs text-neutral-100 focus:border-sky-700/60 focus:outline-none"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleLaunch}
                  disabled={isLaunching || !selectedTemplate.isActive}
                >
                  {isLaunching ? (
                    <Loader2Icon className="mr-1 size-3.5 animate-spin" />
                  ) : (
                    <PlayIcon className="mr-1 size-3.5" />
                  )}
                  Запустить
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingTemplate(selectedTemplate)
                    setEditorOpen(true)
                  }}
                  title="Настроить шаблон"
                >
                  <PencilIcon className="size-3.5" />
                </Button>
                {!selectedTemplate.isBuiltin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteCandidate(selectedTemplate)}
                    title="Удалить шаблон"
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
            {selectedTemplate.description && (
              <p className="mt-2 line-clamp-2 text-xs text-neutral-400">
                {selectedTemplate.description}
              </p>
            )}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setHeaderCollapsed(true)}
                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white"
                title="Свернуть настройки чтобы больше места под результаты"
              >
                <ChevronUpIcon className="size-3.5" /> Свернуть
              </button>
            </div>
          </div>
          )}

          {selectedTemplate.mode === "topics" && !hasOpenRouterKey && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-800/40 bg-amber-900/15 p-3 text-sm text-amber-200">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              <div>
                В режиме «по темам» нужен API-ключ OpenRouter (модель {selectedTemplate.classifier?.model ?? "Haiku"}).
                Добавьте ключ в настройках провайдеров.
              </div>
            </div>
          )}

          <Tabs defaultValue="runs" className="flex min-h-0 flex-1 flex-col">
            <TabsList>
              <TabsTrigger value="runs">Запуски</TabsTrigger>
              <TabsTrigger value="sources">
                Источники ({selectedTemplate.sources.length})
              </TabsTrigger>
              {selectedTemplate.mode === "topics" && (
                <TabsTrigger value="topics">
                  Темы ({selectedTemplate.topics.length})
                </TabsTrigger>
              )}
              <TabsTrigger value="schedule">Расписание</TabsTrigger>
            </TabsList>
            <TabsContent value="runs" className="mt-3 min-h-0 flex-1">
              <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]">
                <div className="flex min-h-0 min-w-0 flex-col">
                  <RunList
                    runs={filteredRuns}
                    selectedRunId={selectedRunId}
                    onSelect={(id) => setSelectedRunId(id)}
                    onDelete={handleRunDeleted}
                  />
                </div>
                <div className="flex min-h-0 min-w-0 flex-col">
                  <RunDetail
                    runId={selectedRunId}
                    onRunUpdated={(updated) => {
                      setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
                    }}
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="sources" className="mt-3 min-h-0 flex-1 overflow-auto">
              <SourcesPanel template={selectedTemplate} onSaved={refreshTemplates} />
            </TabsContent>
            {selectedTemplate.mode === "topics" && (
              <TabsContent value="topics" className="mt-3 min-h-0 flex-1 overflow-auto">
                <TopicsPanel template={selectedTemplate} onSaved={refreshTemplates} />
              </TabsContent>
            )}
            <TabsContent value="schedule" className="mt-3 min-h-0 flex-1 overflow-auto">
              <SchedulePanel template={selectedTemplate} onSaved={refreshTemplates} />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="p-8 text-center text-sm text-neutral-500">Выберите шаблон</div>
      )}

      <TemplateEditor
        open={editorOpen}
        template={editingTemplate}
        onClose={() => {
          setEditorOpen(false)
          setEditingTemplate(null)
        }}
        onSaved={handleSaveTemplate}
      />

      <AlertDialog
        open={deleteCandidate !== null}
        onOpenChange={(open) => !open && setDeleteCandidate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить шаблон?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleteCandidate?.title}» и вся история запусков будут удалены безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
