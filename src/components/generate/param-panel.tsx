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
      <p className="text-sm text-muted-foreground">
        Нет настраиваемых параметров для этой модели
      </p>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(schema).map(([key, param]) => {
        if (param.type !== "select") return null

        const currentValue = values[key] || param.default

        return (
          <div key={key} className="space-y-1.5">
            <Label className="text-sm">{param.label}</Label>
            <Select
              value={currentValue}
              onValueChange={(v) => v && onChange(key, v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {param.options.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
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
