"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { MonitoringTopic } from "@/lib/db/schema/monitoring"
import type { TemplateCard } from "./types"

interface TopicsPanelProps {
  template: TemplateCard
  onSaved: () => void | Promise<void>
}

function generateId(): string {
  return `topic-${Math.random().toString(36).slice(2, 10)}`
}

export function TopicsPanel({ template, onSaved }: TopicsPanelProps) {
  const [topics, setTopics] = useState<MonitoringTopic[]>(template.topics)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState("")

  useEffect(() => {
    setTopics(template.topics)
    setDirty(false)
  }, [template.id, template.topics])

  const handleAdd = () => {
    if (!newName.trim()) return
    setTopics((prev) => [...prev, { id: generateId(), name: newName.trim() }])
    setNewName("")
    setDirty(true)
  }

  const handleRemove = (id: string) => {
    setTopics((prev) => prev.filter((t) => t.id !== id))
    setDirty(true)
  }

  const handleUpdate = (id: string, patch: Partial<MonitoringTopic>) => {
    setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    setDirty(true)
  }

  const handleSave = async () => {
    if (topics.length === 0) {
      toast.error("В режиме «по темам» нужна хотя бы одна тема")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/monitoring/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Не удалось сохранить")
      }
      await onSaved()
      setDirty(false)
      toast.success("Темы сохранены")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
        <h3 className="text-sm font-medium">Добавить тему</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            placeholder="Например, «Изменения в УСН с 2026»"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd()
            }}
          />
          <Button onClick={handleAdd}>
            <PlusIcon className="mr-1 size-4" /> Добавить
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02]">
        <div className="border-b border-white/[0.06] px-4 py-2 text-xs uppercase tracking-wide text-neutral-400">
          Темы ({topics.length})
        </div>
        {topics.length === 0 ? (
          <div className="p-6 text-center text-sm text-neutral-500">
            Тем пока нет. Добавьте — нейронка будет искать совпадения по ним в каждом посте.
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {topics.map((t) => (
              <li key={t.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={t.name}
                    onChange={(e) => handleUpdate(t.id, { name: e.target.value })}
                    placeholder="Название темы"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(t.id)}
                    className="text-rose-400 hover:text-rose-300"
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
                <Textarea
                  placeholder="Описание (что считаем близким совпадением). Опц., но улучшает качество классификации."
                  rows={2}
                  value={t.description ?? ""}
                  onChange={(e) => handleUpdate(t.id, { description: e.target.value })}
                />
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
