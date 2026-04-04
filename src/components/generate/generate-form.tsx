"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Sparkles, Loader2, DollarSign, RotateCcw } from "lucide-react"
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
import { StyleSelector, getStyleSuffix } from "./style-selector"
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

function loadSaved(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  return localStorage.getItem(`mg_${key}`) || fallback
}

function savePref(key: string, value: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(`mg_${key}`, value)
  }
}

export function GenerateForm({ models, hasApiKeys }: GenerateFormProps) {
  const defaultProvider = Object.keys(models).find((p) => hasApiKeys[p]) || Object.keys(models)[0] || ""
  const defaultModel = models[defaultProvider]?.[0]?.modelId || ""

  const [provider, setProvider] = useState(() => {
    const saved = loadSaved("provider", "")
    return saved && models[saved] ? saved : defaultProvider
  })
  const [modelId, setModelId] = useState(() => {
    const savedProvider = loadSaved("provider", "")
    const savedModel = loadSaved("model", "")
    if (savedProvider && models[savedProvider]?.some((m) => m.modelId === savedModel)) {
      return savedModel
    }
    return defaultModel
  })
  const [prompt, setPrompt] = useState("")
  const [count, setCount] = useState("1")
  const [style, setStyle] = useState("none")
  const [params, setParams] = useState<Record<string, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [results, setResults] = useState<GeneratedImage[]>([])
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null)

  const currentModel = models[provider]?.find((m) => m.modelId === modelId)
  const paramsSchema = currentModel?.paramsSchema as Record<string, {
    type: string; label: string; options: string[]; default: string
  }> | null

  // Расчёт примерной стоимости
  const costEstimate = useMemo(() => {
    if (!currentModel) return null
    const pricing = currentModel.pricing as Record<string, unknown> | null
    if (!pricing) return null

    const n = parseInt(count) || 1

    // OpenAI: pricing[quality][size_category] — точная цена
    if (provider === "openai") {
      const quality = (params.quality || paramsSchema?.quality?.default || "medium") as string
      const size = (params.size || paramsSchema?.size?.default || "1024x1024") as string
      const qualityPrices = pricing[quality] as Record<string, number> | undefined
      if (!qualityPrices) return null
      const isWide = size !== "1024x1024"
      const price = isWide ? qualityPrices.wide : qualityPrices["1024x1024"]
      return price ? { amount: price * n, exact: true } : null
    }

    // xAI: pricing.perImage — точная цена
    if (provider === "xai") {
      const perImage = (pricing as { perImage?: number }).perImage
      if (perImage) return { amount: perImage * n, exact: true }
    }

    // OpenRouter: per-image или per-megapixel
    if (provider === "openrouter") {
      const p = pricing as {
        perImage?: number
        firstMP?: number
        extraMP?: number
        perMP?: number
      }

      // Per-megapixel (FLUX models) — зависит от image_size
      if (p.firstMP || p.perMP) {
        const sizeKey = (params.image_size || paramsSchema?.image_size?.default || "1K") as string
        const sizeMultiplier: Record<string, number> = { "0.5K": 0.25, "1K": 1, "2K": 4, "4K": 16 }
        const mp = sizeMultiplier[sizeKey] || 1

        let pricePerImage: number
        if (p.perMP) {
          pricePerImage = p.perMP * mp
        } else {
          pricePerImage = (p.firstMP || 0) + Math.max(0, mp - 1) * (p.extraMP || 0)
        }
        return { amount: pricePerImage * n, exact: true }
      }

      // Flat per-image (Seedream, Gemini, GPT-5)
      if (p.perImage) return { amount: p.perImage * n, exact: false }
    }

    return null
  }, [currentModel, provider, params, paramsSchema, count])

  const handleModelChange = useCallback((newModelId: string) => {
    setModelId(newModelId)
    setParams({})
    savePref("model", newModelId)
  }, [])

  const handleProviderChange = useCallback((newProvider: string) => {
    setProvider(newProvider)
    setParams({})
    savePref("provider", newProvider)
    const firstModel = models[newProvider]?.[0]?.modelId || ""
    setModelId(firstModel)
    savePref("model", firstModel)
  }, [models])

  function handleResetToDefault() {
    setProvider(defaultProvider)
    setModelId(defaultModel)
    setParams({})
    setStyle("none")
    savePref("provider", defaultProvider)
    savePref("model", defaultModel)
    toast.success("Сброшено на стандартные настройки")
  }

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
          prompt: prompt.trim() + getStyleSuffix(style),
          params: finalParams,
          count: parseInt(count),
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        const errMsg = errData.error || `Ошибка сервера (${response.status})`

        // Разные заголовки в зависимости от типа ошибки
        if (response.status === 429) {
          toast.error("Лимит исчерпан", { description: errMsg, duration: 8000 })
        } else if (response.status === 400) {
          toast.error("Ошибка запроса", { description: errMsg, duration: 6000 })
        } else if (response.status === 502) {
          toast.error("Ошибка провайдера", { description: errMsg, duration: 8000 })
        } else {
          toast.error("Ошибка генерации", { description: errMsg, duration: 6000 })
        }
        return
      }

      const data = await response.json() as {
        images: GeneratedImage[]
        generationId: string
        cost: number
      }

      setResults((prev) => [...data.images, ...prev])
      toast.success("Готово!", {
        description: `Сгенерировано ${data.images.length} изобр. — $${data.cost?.toFixed(3) || "?"}`,
      })
    } catch (error) {
      toast.error("Сетевая ошибка", {
        description: error instanceof Error ? error.message : "Не удалось подключиться к серверу",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const noProviders = Object.keys(models).length === 0

  if (noProviders) {
    return (
      <div className="rounded-lg border border-white/[0.08] py-12 text-center">
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
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleGenerate}
            disabled={isGenerating}
          />
          <div className="mt-3">
            <StyleSelector value={style} onChange={setStyle} />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-neutral-500">Количество</Label>
                <Select value={count} onValueChange={(v) => v && setCount(v)}>
                  <SelectTrigger className="w-20 border-white/[0.08] bg-white/[0.02]">
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
            <div className="columns-2 gap-3 sm:columns-3">
              {isGenerating &&
                Array.from({ length: parseInt(count) }).map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="mb-3 break-inside-avoid aspect-square animate-pulse rounded-lg bg-white/[0.03]"
                  />
                ))}
              {results.map((img) => (
                <button
                  key={img.id}
                  className="group relative mb-3 w-full break-inside-avoid overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02] transition-all hover:border-x-blue/40"
                  onClick={() => setSelectedImage(img)}
                >
                  <img
                    src={img.url}
                    alt="Generated"
                    className="w-full"
                    style={{ aspectRatio: `${img.width} / ${img.height}` }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right panel — model & params */}
      <div className="space-y-6">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Модель</h3>
          <ModelSelector
            models={models}
            selectedProvider={provider}
            selectedModel={modelId}
            onProviderChange={handleProviderChange}
            onModelChange={handleModelChange}
          />
        </div>

        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Параметры</h3>
          <ParamPanel
            schema={paramsSchema}
            values={params}
            onChange={handleParamChange}
          />
        </div>

        {/* Стоимость */}
        {costEstimate !== null && (
          <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-3">
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <DollarSign className="size-4" />
              <span>Стоимость</span>
            </div>
            <span className="text-sm font-bold text-white">
              {costEstimate.exact ? "" : "~"}${costEstimate.amount.toFixed(3)}
            </span>
          </div>
        )}

        {/* Сброс */}
        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
          onClick={handleResetToDefault}
        >
          <RotateCcw className="size-3" />
          Сбросить на стандартные
        </button>
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
