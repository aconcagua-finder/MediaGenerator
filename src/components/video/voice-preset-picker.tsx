"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { voicePresetTitle, type VoiceChangeEngine } from "@/lib/providers/voice-change-models"

interface VoicePresetPickerProps {
  engine: VoiceChangeEngine
  value: string
  onChange: (voice: string) => void
  disabled?: boolean
}

/**
 * Выбор голоса движка: две кнопки «женский / мужской по умолчанию» и полный
 * список голосов, сгруппированный по полу, с короткой характеристикой тембра.
 */
export function VoicePresetPicker({ engine, value, onChange, disabled }: VoicePresetPickerProps) {
  const current = engine.presets.find((p) => p.id === value) ?? engine.presets[0]
  const groups = [
    { gender: "female" as const, title: "Женские" },
    { gender: "male" as const, title: "Мужские" },
  ]

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { id: engine.defaultFemale, label: "Женский" },
          { id: engine.defaultMale, label: "Мужской" },
        ].map((d) => (
          <button
            key={d.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(d.id)}
            className={`flex h-8 items-center justify-center gap-1 rounded-md border text-xs font-medium transition-colors disabled:opacity-50 ${
              current.id === d.id
                ? "border-x-blue/50 bg-x-blue/[0.12] text-x-blue"
                : "border-white/[0.12] bg-white/[0.02] text-neutral-300 hover:text-white"
            }`}
          >
            {d.label}
            <span className="font-normal text-neutral-500">· {d.id}</span>
          </button>
        ))}
      </div>
      <Select value={current.id} onValueChange={(v) => v && onChange(v)} disabled={disabled}>
        <SelectTrigger className="w-full border-white/[0.12] bg-white/[0.02]">
          <SelectValue>{voicePresetTitle(current)}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80 !w-auto min-w-[260px]">
          {groups.map((g) => (
            <SelectGroup key={g.gender}>
              <SelectLabel>{g.title}</SelectLabel>
              {engine.presets
                .filter((p) => p.gender === g.gender)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                    {p.hint && <span className="text-[11px] text-neutral-500">{p.hint}</span>}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
