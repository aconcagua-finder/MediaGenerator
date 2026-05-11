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
import { PROVIDER_INFO, NEW_IMAGE_MODELS } from "@/lib/providers/registry"

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

/**
 * Унифицированный селектор моделей: одна выпадашка, модели сгруппированы
 * по провайдеру. Внутреннее значение — "provider::modelId", чтобы корректно
 * различать одинаковые modelId у разных провайдеров (например, FLUX.2 Pro
 * есть и в OpenRouter, и в BFL).
 */
export function ModelSelector({
  models,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
}: ModelSelectorProps) {
  const providerOrder = Object.keys(models)

  const currentModel = models[selectedProvider]?.find(
    (m) => m.modelId === selectedModel
  )
  const currentValue = currentModel
    ? `${selectedProvider}::${selectedModel}`
    : ""
  const currentColors = PROVIDER_INFO[selectedProvider]

  function handleChange(value: string) {
    if (!value) return
    const [provider, modelId] = value.split("::")
    if (!provider || !modelId) return
    if (provider !== selectedProvider) {
      onProviderChange(provider)
    }
    onModelChange(modelId)
  }

  return (
    <Select value={currentValue} onValueChange={(v) => v && handleChange(v)}>
      <SelectTrigger className="h-auto w-full border-white/[0.12] bg-white/[0.02] py-2">
        <SelectValue placeholder="Выберите модель">
          {currentModel && currentColors && (
            <div className="flex w-full items-center gap-2 text-left">
              <span className={`size-2 shrink-0 rounded-full ${currentColors.dot}`} />
              <span className="truncate text-sm font-medium text-white">
                {currentModel.displayName}
              </span>
              <span className={`ml-auto shrink-0 text-[10px] uppercase tracking-wider ${currentColors.text}`}>
                {currentColors.label}
              </span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="!w-auto w-[400px] max-w-[min(440px,92vw)] p-1">
        {providerOrder.map((providerId) => {
          const providerModels = models[providerId] || []
          if (providerModels.length === 0) return null
          const colors = PROVIDER_INFO[providerId]
          const providerName = colors?.name || providerId
          return (
            <SelectGroup key={providerId}>
              <SelectLabel className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
                {providerName}
              </SelectLabel>
              {providerModels.map((m) => {
                const isNew = NEW_IMAGE_MODELS.has(`${providerId}:${m.modelId}`)
                return (
                  <SelectItem
                    key={`${providerId}::${m.modelId}`}
                    value={`${providerId}::${m.modelId}`}
                    className="cursor-pointer rounded-md py-2 data-[highlighted]:bg-white/[0.04]"
                  >
                    <div className="flex w-full flex-col gap-1">
                      <div className="flex w-full items-center gap-1.5">
                        {colors && (
                          <span className={`size-2 shrink-0 rounded-full ${colors.dot}`} />
                        )}
                        <span className="min-w-0 flex-1 truncate font-medium text-white">{m.displayName}</span>
                        {isNew && (
                          <span className="shrink-0 rounded-full bg-x-blue/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-x-blue">
                            Новинка
                          </span>
                        )}
                        {colors && (
                          <span className={`shrink-0 text-[10px] uppercase tracking-wider ${colors.text}`}>
                            {colors.label}
                          </span>
                        )}
                      </div>
                      {m.description && (
                        <span className="whitespace-normal text-xs leading-snug text-neutral-400">
                          {m.description}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                )
              })}
            </SelectGroup>
          )
        })}
      </SelectContent>
    </Select>
  )
}
