"use client"

import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function PromptInput({ value, onChange, disabled }: PromptInputProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="prompt">Промпт</Label>
      <Textarea
        id="prompt"
        placeholder="Опишите изображение, которое хотите сгенерировать..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="min-h-[120px] resize-y"
        rows={4}
      />
      <p className="text-xs text-muted-foreground">
        {value.length > 0 ? `${value.length} символов` : "Английский язык обычно даёт лучшие результаты"}
      </p>
    </div>
  )
}
