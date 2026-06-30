"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { VoiceModel } from "@/lib/providers/voice-models"

interface VoiceSelectorProps {
  model: VoiceModel
  value: string
  onChange: (voiceId: string) => void
}

/** Выбор голоса для конкретной модели. Родные русские голоса помечены флажком. */
export function VoiceSelector({ model, value, onChange }: VoiceSelectorProps) {
  const current = model.voices.find((v) => v.id === value)

  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="w-full border-white/[0.12] bg-white/[0.02]">
        <SelectValue placeholder="Голос">
          {current && (
            <span className="flex items-center gap-1.5">
              {current.ru && <span className="text-[11px]">🇷🇺</span>}
              <span className="truncate">{current.label}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="!w-auto min-w-[220px] max-w-[min(360px,92vw)]">
        {model.voices.map((v) => (
          <SelectItem key={v.id} value={v.id} className="cursor-pointer">
            <span className="flex items-center gap-1.5">
              {v.ru && <span className="text-[11px]">🇷🇺</span>}
              <span>{v.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
