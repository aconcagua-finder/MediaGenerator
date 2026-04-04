"use client"

import { useState, useCallback } from "react"
import { Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  // Найти первый провайдер с ключом
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

  // Текущая модель
  const currentModel = models[provider]?.find((m) => m.modelId === modelId)
  const paramsSchema = currentModel?.paramsSchema as Record<string, {
    type: string; label: string; options: string[]; default: string
  }> | null

  // При смене модели — сбросить параметры на дефолты
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
      // Собираем параметры с дефолтами
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
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            Нет доступных моделей. Обратитесь к администратору.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {/* Левая часть — промпт и результаты */}
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <PromptInput
              value={prompt}
              onChange={setPrompt}
              onSubmit={handleGenerate}
              disabled={isGenerating}
            />
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">Количество</Label>
                  <Select value={count} onValueChange={(v) => v && setCount(v)}>
                    <SelectTrigger className="w-20">
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
                className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition-all hover:shadow-xl hover:shadow-violet-600/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
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
              <p className="mt-2 text-sm text-destructive">
                API ключ для {currentModel?.provider || provider} не настроен. Перейдите в Настройки.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Результаты генерации */}
        {(results.length > 0 || isGenerating) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Результаты</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {isGenerating &&
                  Array.from({ length: parseInt(count) }).map((_, i) => (
                    <div
                      key={`skeleton-${i}`}
                      className="aspect-square animate-pulse rounded-lg bg-muted"
                    />
                  ))}
                {results.map((img) => (
                  <button
                    key={img.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border bg-muted transition-all hover:ring-2 hover:ring-primary"
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
            </CardContent>
          </Card>
        )}
      </div>

      {/* Правая панель — параметры */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Модель</CardTitle>
          </CardHeader>
          <CardContent>
            <ModelSelector
              models={models}
              selectedProvider={provider}
              selectedModel={modelId}
              onProviderChange={handleProviderChange}
              onModelChange={handleModelChange}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Параметры</CardTitle>
          </CardHeader>
          <CardContent>
            <ParamPanel
              schema={paramsSchema}
              values={params}
              onChange={handleParamChange}
            />
          </CardContent>
        </Card>
      </div>

      {/* Лайтбокс */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
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
                className="inline-flex h-8 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
              >
                Скачать
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedImage(null)}
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
