"use client"

import { useState } from "react"
import { ChevronDown, RotateCcw } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Switch } from "@/components/ui/switch"

export type VoiceSettingField =
  | {
      kind: "slider"
      key: string
      label: string
      hint: string
      min: number
      max: number
      step: number
      /** Подпись значения справа: «50%», «1.10×» */
      format: (value: number) => string
    }
  | { kind: "switch"; key: string; label: string; hint: string }

type Values = Record<string, number | boolean | undefined>

interface VoiceSettingsPanelProps<T extends object> {
  fields: VoiceSettingField[]
  values: T
  defaults: T
  onChange: (values: T) => void
  disabled?: boolean
}

export const percent = (v: number) => `${Math.round(v * 100)}%`

/**
 * Сворачиваемые «Тонкие настройки» голоса ElevenLabs: ползунки и переключатели
 * с подсказками и «Сбросить». Набор полей задаёт вызывающий (замена голоса и
 * озвучка показывают разное; поля, которых модель не умеет, не передаются).
 */
export function VoiceSettingsPanel<T extends object>({
  fields,
  values: typedValues,
  defaults: typedDefaults,
  onChange,
  disabled,
}: VoiceSettingsPanelProps<T>) {
  const [open, setOpen] = useState(false)
  // Поля адресуются по имени из `fields`, поэтому внутри — как словарь
  const values = typedValues as Values
  const defaults = typedDefaults as Values
  const set = (key: string, value: number | boolean) => onChange({ ...typedValues, [key]: value })
  const isDefault = fields.every((f) => values[f.key] === defaults[f.key])
  const reset = () => {
    const next: Values = { ...values }
    for (const f of fields) next[f.key] = defaults[f.key]
    onChange(next as T)
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1 text-[11px] font-medium text-neutral-400 hover:text-white">
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        Тонкие настройки
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-3 rounded-md border border-white/[0.08] bg-white/[0.02] p-3">
          {fields.map((f) =>
            f.kind === "slider" ? (
              <div key={f.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-neutral-300">
                  <span>{f.label}</span>
                  <span className="tabular-nums text-neutral-500">{f.format(Number(values[f.key] ?? defaults[f.key]))}</span>
                </div>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={Number(values[f.key] ?? defaults[f.key])}
                  disabled={disabled}
                  onChange={(e) => set(f.key, parseFloat(e.target.value))}
                  className="w-full accent-[#1D9BF0]"
                />
                <p className="text-[11px] leading-snug text-neutral-500">{f.hint}</p>
              </div>
            ) : (
              <div key={f.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-neutral-300">{f.label}</p>
                  <p className="text-[11px] leading-snug text-neutral-500">{f.hint}</p>
                </div>
                <Switch
                  checked={Boolean(values[f.key] ?? defaults[f.key])}
                  disabled={disabled}
                  onCheckedChange={(checked) => set(f.key, checked)}
                  className="mt-0.5"
                />
              </div>
            ),
          )}
          <button
            type="button"
            disabled={disabled || isDefault}
            onClick={reset}
            className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white disabled:opacity-40"
          >
            <RotateCcw className="size-3" />
            Сбросить
          </button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
