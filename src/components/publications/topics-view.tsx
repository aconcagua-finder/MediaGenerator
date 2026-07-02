"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Circle, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { deleteTopic, setTopicPublished } from "@/lib/actions/content"

interface TopicItem {
  id: string
  topic: string
  angle: string
  rubricSlug: string
  published: boolean
  publishedAt: string | null
  createdAt: string
  runId: string
}

type Filter = "all" | "published" | "draft"

export function TopicsView({ topics: initial }: { topics: TopicItem[] }) {
  const [topics, setTopics] = useState<TopicItem[]>(initial)
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [pendingId, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return topics.filter((t) => {
      if (filter === "published" && !t.published) return false
      if (filter === "draft" && t.published) return false
      if (s && !t.topic.toLowerCase().includes(s) && !t.rubricSlug.toLowerCase().includes(s))
        return false
      return true
    })
  }, [topics, filter, search])

  const handleToggle = (topic: TopicItem) => {
    setBusyId(topic.id)
    startTransition(async () => {
      try {
        await setTopicPublished(topic.id, !topic.published)
        setTopics((prev) =>
          prev.map((t) =>
            t.id === topic.id
              ? {
                  ...t,
                  published: !t.published,
                  publishedAt: !t.published ? new Date().toISOString() : null,
                }
              : t,
          ),
        )
        toast.success(
          topic.published
            ? "Тема снята с публикации — может снова появиться в запусках"
            : "Тема помечена опубликованной",
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Не удалось")
      } finally {
        setBusyId(null)
      }
    })
  }

  const handleDelete = (topic: TopicItem) => {
    if (!window.confirm("Удалить тему из истории безвозвратно?")) return
    setBusyId(topic.id)
    startTransition(async () => {
      try {
        await deleteTopic(topic.id)
        setTopics((prev) => prev.filter((t) => t.id !== topic.id))
        toast.success("Тема удалена")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Не удалось")
      } finally {
        setBusyId(null)
      }
    })
  }

  const counts = useMemo(() => {
    return {
      all: topics.length,
      published: topics.filter((t) => t.published).length,
      draft: topics.filter((t) => !t.published).length,
    }
  }, [topics])

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden pt-4">
      <header className="space-y-2 border-b border-white/[0.08] pb-3">
        <Button variant="ghost" size="sm" className="-ml-2" render={<Link href="/publications" />}>
          <ArrowLeft className="mr-1.5 size-3.5" />К списку запусков
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">История тем</h1>
          <p className="text-sm text-neutral-400">
            Что pipeline уже разбирал. Опубликованные темы участвуют в topic guard —
            модель их не повторяет. Сними отметку или удали — тема снова станет доступна.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
          {(
            [
              { id: "all", label: `Все · ${counts.all}` },
              { id: "published", label: `Опубликовано · ${counts.published}` },
              { id: "draft", label: `Черновики · ${counts.draft}` },
            ] as Array<{ id: Filter; label: string }>
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={
                filter === opt.id
                  ? "rounded-md bg-sky-500/20 px-2.5 py-1 text-xs font-medium text-sky-100"
                  : "rounded-md px-2.5 py-1 text-xs text-neutral-400 hover:text-white"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по теме или рубрике…"
          className="h-8 max-w-[320px]"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
        <ScrollArea className="min-h-0">
          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-neutral-500">Нет тем по этому фильтру.</div>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {filtered.map((topic) => {
                const isBusy = pendingId && busyId === topic.id
                return (
                  <li
                    key={topic.id}
                    className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggle(topic)}
                      disabled={!!isBusy}
                      className={cn(
                        "mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full transition-colors",
                        topic.published
                          ? "text-emerald-400 hover:text-emerald-300"
                          : "text-neutral-500 hover:text-neutral-300",
                      )}
                      title={
                        topic.published
                          ? "Снять отметку «опубликовано» — тема снова доступна"
                          : "Пометить опубликованной — заблокирует тему в topic guard"
                      }
                    >
                      {isBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : topic.published ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <Circle className="size-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span
                          className={cn(
                            "truncate text-sm font-medium",
                            topic.published ? "text-white" : "text-neutral-200",
                          )}
                        >
                          {topic.topic}
                        </span>
                        <span className="text-[11px] text-neutral-500">
                          · {topic.rubricSlug}
                        </span>
                      </div>
                      {topic.angle && (
                        <div className="line-clamp-1 text-[11px] text-neutral-500">
                          {topic.angle}
                        </div>
                      )}
                      <div className="text-[11px] text-neutral-600">
                        {new Date(topic.createdAt).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {topic.published && topic.publishedAt && (
                          <> · опубликовано {new Date(topic.publishedAt).toLocaleDateString("ru-RU")}</>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(topic)}
                      disabled={!!isBusy}
                      className="shrink-0 text-neutral-500 transition-colors hover:text-rose-400 disabled:opacity-50"
                      title="Удалить тему из истории"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
