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
import { Label } from "@/components/ui/label"
import { PROVIDER_INFO } from "@/lib/providers/registry"

interface Model {
  id: string
  provider: string
  modelId: string
  displayName: string
  description: string | null
  paramsSchema: unknown
  pricing: unknown
  isActive: boolean
}

interface ModelSelectorProps {
  models: Record<string, Model[]>
  selectedProvider: string
  selectedModel: string
  onProviderChange: (provider: string) => void
  onModelChange: (modelId: string) => void
}

export function ModelSelector({
  models,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
}: ModelSelectorProps) {
  const providers = Object.keys(models)

  function handleProviderChange(provider: string) {
    onProviderChange(provider)
    const firstModel = models[provider]?.[0]
    if (firstModel) {
      onModelChange(firstModel.modelId)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium text-neutral-400">Провайдер</Label>
        <Select value={selectedProvider} onValueChange={(v) => v && handleProviderChange(v)}>
          <SelectTrigger className="w-full border-white/8 bg-white/[0.02]">
            <SelectValue placeholder="Выберите провайдера" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p} value={p}>
                {PROVIDER_INFO[p]?.name || p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-neutral-400">Модель</Label>
        <Select value={selectedModel} onValueChange={(v) => v && onModelChange(v)}>
          <SelectTrigger className="w-full border-white/8 bg-white/[0.02]">
            <SelectValue placeholder="Выберите модель" />
          </SelectTrigger>
          <SelectContent className="min-w-[var(--radix-select-trigger-width)] max-w-[400px]">
            <SelectGroup>
              <SelectLabel>{PROVIDER_INFO[selectedProvider]?.name}</SelectLabel>
              {(models[selectedProvider] || []).map((m) => (
                <SelectItem key={m.modelId} value={m.modelId}>
                  <div className="flex flex-col gap-0.5">
                    <span>{m.displayName}</span>
                    {m.description && (
                      <span className="text-xs leading-snug text-neutral-500">
                        {m.description}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
