"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

interface ParamSchema {
  [key: string]: {
    type: string
    label: string
    options: string[]
    default: string
    optionLabels?: Record<string, string>
  }
}

interface ParamPanelProps {
  schema: ParamSchema | null
  values: Record<string, string>
  onChange: (key: string, value: string) => void
}

export function ParamPanel({ schema, values, onChange }: ParamPanelProps) {
  if (!schema || Object.keys(schema).length === 0) {
    return (
      <p className="text-sm text-neutral-600">
        Нет настраиваемых параметров для этой модели
      </p>
    )
  }

  return (
    <div className="grid items-end gap-4 sm:grid-cols-2">
      {Object.entries(schema).map(([key, param]) => {
        if (param.type !== "select") return null

        const currentValue = values[key] || param.default

        return (
          <div key={key} className="space-y-1.5">
            <Label className="block text-sm font-medium leading-tight text-neutral-400">{param.label}</Label>
            <Select
              value={currentValue}
              onValueChange={(v) => v && onChange(key, v)}
            >
              <SelectTrigger className="w-full border-white/[0.08] bg-white/[0.02]">
                <SelectValue>
                  {param.optionLabels?.[currentValue] || currentValue}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="!w-auto min-w-[180px]">
                {param.options.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {param.optionLabels?.[opt] || opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      })}
    </div>
  )
}
