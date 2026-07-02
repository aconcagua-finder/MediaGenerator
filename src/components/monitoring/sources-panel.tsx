"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { SourceBadge } from "./source-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { MonitoringSource } from "@/lib/db/schema/monitoring"
import type { TemplateCard } from "./types"

interface SourcesPanelProps {
  template: TemplateCard
  onSaved: () => void | Promise<void>
}

function generateId(): string {
  return `src-${Math.random().toString(36).slice(2, 10)}`
}

export function SourcesPanel({ template, onSaved }: SourcesPanelProps) {
  const [sources, setSources] = useState<MonitoringSource[]>(template.sources)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [newType, setNewType] = useState<"telegram" | "website">("telegram")
  const [newUrl, setNewUrl] = useState("")
  const [newLabel, setNewLabel] = useState("")

  useEffect(() => {
    setSources(template.sources)
    setDirty(false)
  }, [template.id, template.sources])

  const handleAdd = () => {
    if (!newUrl.trim()) {
      toast.error("Укажите адрес")
      return
    }
    setSources((prev) => [
      ...prev,
      {
        id: generateId(),
        type: newType,
        url: newUrl.trim(),
        label: newLabel.trim() || undefined,
        disabled: false,
      },
    ])
    setNewUrl("")
    setNewLabel("")
    setDirty(true)
  }

  const handleRemove = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id))
    setDirty(true)
  }

  const handleToggle = (id: string) => {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, disabled: !s.disabled } : s)),
    )
    setDirty(true)
  }

  const handleUpdate = (id: string, patch: Partial<MonitoringSource>) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/monitoring/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Не удалось сохранить")
      }
      await onSaved()
      setDirty(false)
      toast.success("Источники сохранены")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
        <h3 className="text-sm font-medium">Добавить источник</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_1fr_auto]">
          <Select
            value={newType}
            onValueChange={(v) => v && setNewType(v as "telegram" | "website")}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="telegram">Telegram-канал</SelectItem>
              <SelectItem value="website">Сайт / RSS</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder={
              newType === "telegram" ? "@channel или t.me/channel" : "https://example.com/news"
            }
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
          />
          <Input
            placeholder="Подпись (опц.)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <Button onClick={handleAdd}>
            <PlusIcon className="mr-1 size-4" /> Добавить
          </Button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Для сайтов автоматически ищется RSS/Atom feed. Если у сайта нет ленты — в журнале запуска
          будет сообщение.
        </p>
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02]">
        <div className="border-b border-white/[0.06] px-4 py-2 text-xs uppercase tracking-wide text-neutral-400">
          Список источников ({sources.length})
        </div>
        {sources.length === 0 ? (
          <div className="p-6 text-center text-sm text-neutral-500">
            Источников пока нет. Добавьте Telegram-канал или сайт выше.
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {sources.map((s) => (
              <li
                key={s.id}
                className={`flex items-start gap-3 px-4 py-3 ${
                  s.disabled ? "opacity-50" : ""
                }`}
              >
                <div className="mt-0.5">
                  <SourceBadge type={s.type} url={s.url} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    value={s.url}
                    onChange={(e) => handleUpdate(s.id, { url: e.target.value })}
                    className="h-8"
                  />
                  <Input
                    placeholder="Подпись"
                    value={s.label ?? ""}
                    onChange={(e) => handleUpdate(s.id, { label: e.target.value })}
                    className="h-8 text-xs text-neutral-400"
                  />
                  {s.type === "website" && (
                    <Input
                      placeholder="Прямой URL RSS/Atom (если автодетект не работает)"
                      value={s.feedUrl ?? ""}
                      onChange={(e) => handleUpdate(s.id, { feedUrl: e.target.value })}
                      className="h-8 text-xs text-neutral-400"
                    />
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(s.id)}
                    className="text-xs"
                  >
                    {s.disabled ? "Включить" : "Выкл"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(s.id)}
                    className="text-rose-400 hover:text-rose-300"
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {dirty && <Label className="text-xs text-amber-300">Есть несохранённые изменения</Label>}
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          Сохранить
        </Button>
      </div>
    </div>
  )
}
