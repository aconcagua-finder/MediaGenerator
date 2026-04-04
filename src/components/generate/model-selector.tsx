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

  // При смене провайдера — выбрать первую модель
  function handleProviderChange(provider: string) {
    onProviderChange(provider)
    const firstModel = models[provider]?.[0]
    if (firstModel) {
      onModelChange(firstModel.modelId)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Провайдер</Label>
        <Select value={selectedProvider} onValueChange={(v) => v && handleProviderChange(v)}>
          <SelectTrigger className="w-full">
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

      <div className="space-y-1.5">
        <Label>Модель</Label>
        <Select value={selectedModel} onValueChange={(v) => v && onModelChange(v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Выберите модель" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>{PROVIDER_INFO[selectedProvider]?.name}</SelectLabel>
              {(models[selectedProvider] || []).map((m) => (
                <SelectItem key={m.modelId} value={m.modelId}>
                  <div className="flex flex-col">
                    <span>{m.displayName}</span>
                    {m.description && (
                      <span className="text-xs text-muted-foreground">
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
