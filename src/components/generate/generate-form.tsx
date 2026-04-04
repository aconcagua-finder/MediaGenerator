"use client"

import { useState, useCallback } from "react"
import { Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ModelSelector } from "./model-selector"
import { ParamPanel } from "./param-panel"
import { PromptInput } from "./prompt-input"
import { toast } from "sonner"

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

interface GeneratedImage {
  id: string
  url: string
  width: number
  height: number
}

interface GenerateFormProps {
  models: Record<string, Model[]>
  hasApiKeys: Record<string, boolean>
}

export function GenerateForm({ models, hasApiKeys }: GenerateFormProps) {
  const firstAvailableProvider = Object.keys(models).find((p) => hasApiKeys[p]) || Object.keys(models)[0] || ""
  const firstModel = models[firstAvailableProvider]?.[0]?.modelId || ""

  const [provider, setProvider] = useState(firstAvailableProvider)
  const [modelId, setModelId] = useState(firstModel)
  const [prompt, setPrompt] = useState("")
  const [count, setCount] = useState("1")
  const [params, setParams] = useState<Record<string, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [results, setResults] = useState<GeneratedImage[]>([])
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null)

  const currentModel = models[provider]?.find((m) => m.modelId === modelId)
  const paramsSchema = currentModel?.paramsSchema as Record<string, {
    type: string; label: string; options: string[]; default: string
  }> | null

  const handleModelChange = useCallback((newModelId: string) => {
    setModelId(newModelId)
    setParams({})
  }, [])

  const handleProviderChange = useCallback((newProvider: string) => {
    setProvider(newProvider)
    setParams({})
  }, [])

  const handleParamChange = useCallback((key: string, value: string) => {
    setParams((prev) => ({ ...prev, [key]: value }))
  }, [])

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("Введите промпт")
      return
    }

    if (!hasApiKeys[provider]) {
      toast.error("API ключ не настроен", {
        description: `Добавьте API ключ в Настройках для этого провайдера`,
      })
      return
    }

    setIsGenerating(true)

    try {
      const finalParams: Record<string, string> = {}
      if (paramsSchema) {
        for (const [key, schema] of Object.entries(paramsSchema)) {
          finalParams[key] = params[key] || schema.default
        }
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: modelId,
          prompt: prompt.trim(),
          params: finalParams,
          count: parseInt(count),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Ошибка генерации")
      }

      const data = await response.json() as {
        images: GeneratedImage[]
        generationId: string
      }

      setResults((prev) => [...data.images, ...prev])
      toast.success("Готово!", {
        description: `Сгенерировано ${data.images.length} изображений`,
      })
    } catch (error) {
      toast.error("Ошибка генерации", {
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const noProviders = Object.keys(models).length === 0

  if (noProviders) {
    return (
      <div className="rounded-lg border border-white/8 py-12 text-center">
        <p className="text-neutral-500">
          Нет доступных моделей. Обратитесь к администратору.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Left — prompt and results */}
      <div className="space-y-6">
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-5">
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleGenerate}
            disabled={isGenerating}
          />
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-neutral-500">Количество</Label>
                <Select value={count} onValueChange={(v) => v && setCount(v)}>
                  <SelectTrigger className="w-20 border-white/8 bg-white/[0.02]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1", "2", "3", "4"].map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim() || !hasApiKeys[provider]}
              className="flex h-10 items-center gap-2 rounded-full bg-x-blue px-5 text-sm font-bold text-white transition-colors hover:bg-x-blue-hover active:scale-[0.98] disabled:opacity-40"
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {isGenerating ? "Генерация..." : "Сгенерировать"}
            </button>
          </div>
          {!hasApiKeys[provider] && (
            <p className="mt-3 text-sm text-red-400">
              API ключ для {currentModel?.provider || provider} не настроен. Перейдите в Настройки.
            </p>
          )}
        </div>

        {/* Results */}
        {(results.length > 0 || isGenerating) && (
          <div>
            <h3 className="mb-3 text-sm font-medium text-neutral-400">Результаты</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {isGenerating &&
                Array.from({ length: parseInt(count) }).map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="aspect-square animate-pulse rounded-lg bg-white/[0.03]"
                  />
                ))}
              {results.map((img) => (
                <button
                  key={img.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-white/8 bg-white/[0.02] transition-all hover:border-x-blue/40"
                  onClick={() => setSelectedImage(img)}
                >
                  <img
                    src={img.url}
                    alt="Generated"
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right panel — model & params */}
      <div className="space-y-6">
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Модель</h3>
          <ModelSelector
            models={models}
            selectedProvider={provider}
            selectedModel={modelId}
            onProviderChange={handleProviderChange}
            onModelChange={handleModelChange}
          />
        </div>

        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Параметры</h3>
          <ParamPanel
            schema={paramsSchema}
            values={params}
            onChange={handleParamChange}
          />
        </div>
      </div>

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage.url}
              alt="Generated"
              className="max-h-[85vh] rounded-lg object-contain"
            />
            <div className="mt-3 flex justify-center gap-3">
              <a
                href={selectedImage.url}
                download={`image-${selectedImage.id}.png`}
                className="inline-flex h-9 items-center rounded-full bg-x-blue px-4 text-sm font-bold text-white transition-colors hover:bg-x-blue-hover"
              >
                Скачать
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedImage(null)}
                className="rounded-full text-neutral-400 hover:text-white"
              >
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
