"use client"

import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  disabled?: boolean
  /** Подпись поля (по умолчанию «Промпт») */
  label?: string
  /** Плейсхолдер (по умолчанию — для картинок) */
  placeholder?: string
}

export function PromptInput({ value, onChange, onSubmit, disabled, label = "Промпт", placeholder }: PromptInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="prompt" className="text-sm font-medium text-neutral-400">{label}</Label>
      <Textarea
        id="prompt"
        placeholder={placeholder ?? "Опишите изображение, которое хотите сгенерировать..."}
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
