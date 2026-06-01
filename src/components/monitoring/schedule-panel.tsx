"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2Icon, AlertTriangleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import type { MonitoringSchedule } from "@/lib/db/schema/monitoring"
import type { TemplateCard } from "./types"

interface SchedulePanelProps {
  template: TemplateCard
  onSaved: () => void | Promise<void>
}

const PRESETS: Array<{ label: string; hours: number }> = [
  { label: "Раз в день", hours: 24 },
  { label: "Раз в 2 дня", hours: 48 },
  { label: "Раз в 3 дня", hours: 72 },
  { label: "Раз в неделю", hours: 168 },
]

function formatRussianDate(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function SchedulePanel({ template, onSaved }: SchedulePanelProps) {
  const [schedule, setSchedule] = useState<MonitoringSchedule>(template.schedule)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSchedule(template.schedule)
    setDirty(false)
  }, [template.id, template.schedule])

  const updateSchedule = (patch: Partial<MonitoringSchedule>) => {
    setSchedule((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (schedule.intervalHours < 24) {
      toast.error("Минимальный интервал — 24 часа")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/monitoring/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Не удалось сохранить")
      }
      await onSaved()
      setDirty(false)
      toast.success("Расписание сохранено")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium">Автоматический запуск</h3>
            <p className="mt-1 text-sm text-neutral-400">
              Шаблон будет запускаться сам по расписанию. Результаты появятся в списке запусков и
              в бейдже сайдбара.
            </p>
          </div>
          <Switch
            checked={schedule.enabled}
            onCheckedChange={(v) => updateSchedule({ enabled: v })}
          />
        </div>

        {schedule.enabled && (
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Частота</Label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.hours}
                    type="button"
                    onClick={() => updateSchedule({ intervalHours: p.hours })}
                    className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      schedule.intervalHours === p.hours
                        ? "border-amber-700/60 bg-amber-700/15 text-amber-200"
                        : "border-white/[0.08] text-neutral-300 hover:bg-white/[0.04]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={24}
                    max={720}
                    value={schedule.intervalHours}
                    onChange={(e) =>
                      updateSchedule({ intervalHours: Number(e.target.value) || 24 })
                    }
                    className="h-9 w-24"
                  />
                  <span className="text-xs text-neutral-500">часов</span>
                </div>
              </div>
              <p className="text-xs text-neutral-500">Минимум 24 часа — защита от лишних трат.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hour-utc">Время запуска (UTC)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="hour-utc"
                  type="number"
                  min={0}
                  max={23}
                  value={schedule.hourUtc}
                  onChange={(e) => updateSchedule({ hourUtc: Number(e.target.value) || 0 })}
                  className="h-9 w-20"
                />
                <span className="text-xs text-neutral-500">
                  {schedule.hourUtc}:00 UTC ≈ {(schedule.hourUtc + 3) % 24}:00 МСК
                </span>
              </div>
            </div>

            <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-neutral-400">
              <div>Последний запуск: {formatRussianDate(template.lastRunAt)}</div>
              <div>Следующий запуск: {formatRussianDate(template.nextRunAt)}</div>
            </div>
          </div>
        )}
      </div>

      {schedule.enabled && template.mode === "topics" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-800/40 bg-amber-900/15 p-3 text-sm text-amber-200">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            В режиме «по темам» каждое расписание тратит токены OpenRouter. Оценить расход поможет
            журнал предыдущих запусков (внизу карточки запуска).
          </div>
        </div>
      )}

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
