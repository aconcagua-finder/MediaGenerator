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
    <div className="space-y-2">
      <Label htmlFor="prompt" className="text-sm font-medium text-neutral-400">Промпт</Label>
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
        className="min-h-[120px] resize-y border-white/[0.12] bg-white/[0.02] text-white placeholder-neutral-600 focus:border-x-blue/40 focus:ring-1 focus:ring-x-blue/20"
        rows={4}
      />
      <p className="text-xs text-neutral-600">
        {value.length > 0
          ? `${value.length} символов`
          : "Ctrl+Enter для генерации"}
      </p>
    </div>
  )
}
