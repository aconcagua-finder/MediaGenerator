"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TEXT_MODELS } from "@/lib/providers/text-models"
import type { MonitoringTopic } from "@/lib/db/schema/monitoring"
import type { TemplateCard } from "./types"

function generateTopicId(): string {
  return `topic-${Math.random().toString(36).slice(2, 10)}`
}

interface TemplateEditorProps {
  open: boolean
  template: TemplateCard | null
  onClose: () => void
  onSaved: (saved: TemplateCard) => void
}

// Для классификатора подходят все модели кроме reasoning-тяжёлых:
// быстрые и сбалансированные дают разумное время и стоимость,
// smart-модели можно выбрать только для самой точной классификации.
const CLASSIFIER_MODELS = TEXT_MODELS.filter((m) =>
  ["fast", "balanced", "smart"].includes(m.category),
)

export function TemplateEditor({ open, template, onClose, onSaved }: TemplateEditorProps) {
  const isEdit = template !== null
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<"feed" | "topics">("feed")
  const [defaultIntervalDays, setDefaultIntervalDays] = useState(1)
  const [tgMaxPages, setTgMaxPages] = useState(5)
  const [classifierModel, setClassifierModel] = useState("anthropic/claude-sonnet-4.6")
  const [keepNonMatches, setKeepNonMatches] = useState(false)
  const [topics, setTopics] = useState<MonitoringTopic[]>([])
  const [newTopicName, setNewTopicName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (template) {
      setTitle(template.title)
      setDescription(template.description)
      setMode(template.mode)
      setDefaultIntervalDays(template.defaultIntervalDays)
      setTgMaxPages(template.tgMaxPages)
      setClassifierModel(template.classifier?.model ?? "anthropic/claude-sonnet-4.6")
      setKeepNonMatches(template.classifier?.keepNonMatches ?? false)
      setTopics(template.topics)
    } else {
      setTitle("")
      setDescription("")
      setMode("feed")
      setDefaultIntervalDays(1)
      setTgMaxPages(5)
      setClassifierModel("anthropic/claude-sonnet-4.6")
      setKeepNonMatches(false)
      setTopics([])
    }
    setNewTopicName("")
  }, [open, template])

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Укажите название шаблона")
      return
    }
    setSaving(true)
    try {
      const body = {
        title,
        description,
        mode,
        defaultIntervalDays,
        tgMaxPages,
        classifier:
          mode === "topics"
            ? {
                model: classifierModel,
                batchSize: 8,
                keepNonMatches,
              }
            : null,
        sources: template?.sources ?? [],
        topics,
        schedule: template?.schedule ?? { enabled: false, intervalHours: 24, hourUtc: 6 },
      }
      const url = isEdit ? `/api/monitoring/templates/${template.id}` : "/api/monitoring/templates"
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? "Ошибка сохранения")
      }
      const data = (await res.json()) as { template: TemplateCard }
      onSaved(data.template)
      toast.success(isEdit ? "Шаблон обновлён" : "Шаблон создан — добавьте источники")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  const handleAddTopic = () => {
    const trimmed = newTopicName.trim()
    if (!trimmed) return
    setTopics((prev) => [...prev, { id: generateTopicId(), name: trimmed }])
    setNewTopicName("")
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Настройки шаблона" : "Новый шаблон мониторинга"}</DialogTitle>
          <DialogDescription>
            Основные параметры. Подробное редактирование источников, тем и расписания — на отдельных
            вкладках после сохранения.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-3">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="m-title">Название</Label>
              <Input
                id="m-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например, Налоги и бухгалтерия"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-desc">Описание</Label>
              <Textarea
                id="m-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Что собираем и для чего"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Режим</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("feed")}
                  className={`rounded-md border p-3 text-left transition-colors ${
                    mode === "feed"
                      ? "border-sky-700/60 bg-sky-700/10"
                      : "border-white/[0.08] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="font-medium text-sm">Сырая лента</div>
                  <div className="mt-1 text-xs text-neutral-400">
                    Все посты за период со всех источников. Без AI, дёшево и быстро.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("topics")}
                  className={`rounded-md border p-3 text-left transition-colors ${
                    mode === "topics"
                      ? "border-violet-700/60 bg-violet-700/10"
                      : "border-white/[0.08] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="font-medium text-sm">По темам (AI)</div>
                  <div className="mt-1 text-xs text-neutral-400">
                    Указываем темы — нейронка отмечает «близкое» / «косвенное» совпадение с обоснованием.
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-default-days">По умолчанию собирать за</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="m-default-days"
                  type="number"
                  min={1}
                  max={30}
                  value={defaultIntervalDays}
                  onChange={(e) => setDefaultIntervalDays(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-neutral-400">дней</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-tg-pages">Глубина Telegram-пагинации</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="m-tg-pages"
                  type="number"
                  min={1}
                  max={15}
                  value={tgMaxPages}
                  onChange={(e) => setTgMaxPages(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-neutral-400">страниц · ~{tgMaxPages * 20} постов max/канал</span>
              </div>
              <p className="text-xs text-neutral-500">
                Одна страница ≈ 20 постов. Для дневного интервала хватит 1-2, для месячного на активных каналах — 8-12.
                Чем больше — тем дольше и выше риск временного бана t.me.
              </p>
            </div>

            {mode === "topics" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="m-model">Модель классификатора</Label>
                  <Select
                    value={classifierModel}
                    onValueChange={(v) => v && setClassifierModel(v)}
                  >
                    <SelectTrigger id="m-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASSIFIER_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} · ${m.pricing.input}/${m.pricing.output} per 1M
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-neutral-500">
                    Через OpenRouter. Haiku 4.5 — оптимум по цене и качеству для коротких классификаций.
                  </p>
                </div>
                <label className="flex items-start gap-2 rounded-md border border-white/[0.08] p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={keepNonMatches}
                    onChange={(e) => setKeepNonMatches(e.target.checked)}
                  />
                  <div>
                    <div className="font-medium">Сохранять «нет совпадения»</div>
                    <div className="text-xs text-neutral-400">
                      По умолчанию посты без совпадения отбрасываются. Включите, если хотите видеть всё
                      — например, чтобы проверить решение модели.
                    </div>
                  </div>
                </label>

                {/* Темы — обязательны для topics-режима. Сразу даём добавить хотя бы одну */}
                <div className="space-y-1.5">
                  <Label>Темы для классификации</Label>
                  <p className="text-xs text-neutral-500">
                    Нейронка ищет совпадения с этими темами. Минимум одна тема. Подробные описания
                    можно добавить позже на вкладке «Темы».
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Например, «Изменения в УСН с 2026»"
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleAddTopic()
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={handleAddTopic}>
                      <PlusIcon className="mr-1 size-4" /> Добавить
                    </Button>
                  </div>
                  {topics.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {topics.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-sm"
                        >
                          <span className="truncate">{t.name}</span>
                          <button
                            type="button"
                            onClick={() => setTopics((prev) => prev.filter((x) => x.id !== t.id))}
                            className="text-rose-400 transition-colors hover:text-rose-300"
                          >
                            <Trash2Icon className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            {isEdit ? "Сохранить" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
