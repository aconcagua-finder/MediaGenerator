"use client"

import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  disabled?: boolean
}

export function PromptInput({ value, onChange, onSubmit, disabled }: PromptInputProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="prompt">Промпт</Label>
      <Textarea
        id="prompt"
        placeholder="Опишите изображение, которое хотите сгенерировать..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && onSubmit) {
            e.preventDefault()
            onSubmit()
          }
        }}
        disabled={disabled}
        className="min-h-[120px] resize-y"
        rows={4}
      />
      <p className="text-xs text-muted-foreground">
        {value.length > 0
          ? `${value.length} символов`
          : "Ctrl+Enter для генерации"}
      </p>
    </div>
  )
}
