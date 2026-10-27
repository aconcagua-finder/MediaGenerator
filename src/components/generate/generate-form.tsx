"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { Sparkles, Loader2, DollarSign, RotateCcw, Wand2, ImagePlus } from "lucide-react"
import { HistoryFeedSection, feedCount } from "@/components/history-feed/history-feed-section"
import { useHistoryFeed } from "@/components/history-feed/use-history-feed"
import { mergeJobsById } from "@/lib/history/merge"
import type { ImageHistoryImage, ImageHistoryItem } from "@/lib/images/history"
import { ImageJobCard, ImageJobCardSkeleton } from "./image-job-card"
import { imageJobFromHistory, type ImageJob } from "./image-job"
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
import { StyleSelector, getStyleSuffix, splitStyleSuffix } from "./style-selector"
import { ImageEditDialog } from "./image-edit-dialog"
import { useImageAttachments } from "@/hooks/use-image-attachments"
import { AttachmentTray } from "@/components/shared/attachment-tray"
import { supportsImageInput } from "@/lib/capabilities"
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

const HISTORY_PAGE = 8
let tmpCounter = 0

/** Картинка из ленты → вид для лайтбокса и диалога правки */
function toGenerated(img: ImageHistoryImage): GeneratedImage {
  return { id: img.id, url: img.url, width: img.width ?? 1024, height: img.height ?? 1024 }
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

// Предпочтительная модель по умолчанию (если доступна и есть ключ провайдера).
// Применяется только к новой/чистой сессии — сохранённый выбор пользователя в
// localStorage имеет приоритет.
const PREFERRED_DEFAULT = { provider: "openrouter", modelId: "google/gemini-3.1-flash-lite-image" }

export function GenerateForm({ models, hasApiKeys }: GenerateFormProps) {
  const preferred =
    hasApiKeys[PREFERRED_DEFAULT.provider] &&
    models[PREFERRED_DEFAULT.provider]?.some((m) => m.modelId === PREFERRED_DEFAULT.modelId)
      ? PREFERRED_DEFAULT
      : null
  const defaultProvider =
    preferred?.provider || Object.keys(models).find((p) => hasApiKeys[p]) || Object.keys(models)[0] || ""
  const defaultModel = preferred?.modelId || models[defaultProvider]?.[0]?.modelId || ""

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
  // «Мои картинки»: свежие генерации вкладки и история из БД в одной ленте
  const [jobs, setJobs] = useState<ImageJob[]>([])
  const historyFeed = useHistoryFeed<ImageHistoryItem>({
    url: "/api/generate/history",
    pageSize: HISTORY_PAGE,
    onPage: (items) => setJobs((prev) => mergeJobsById(prev, items.map(imageJobFromHistory))),
  })
  const modelName = useCallback(
    (p: string, id: string) => models[p]?.find((m) => m.modelId === id)?.displayName ?? id,
    [models],
  )
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null)
  const [editingImage, setEditingImage] = useState<GeneratedImage | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  const currentModel = models[provider]?.find((m) => m.modelId === modelId)
  const modelTakesImage = supportsImageInput(provider, modelId)

  // Хук вложений. Для генерации ограничиваем одной картинкой —
  // /api/edit принимает один источник.
  const att = useImageAttachments({ disabled: !modelTakesImage, maxCount: 1 })
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

    // Recraft: pricing.perImage — точная цена
    if (provider === "recraft") {
      const perImage = (pricing as { perImage?: number }).perImage
      if (perImage) return { amount: perImage * n, exact: true }
    }

    // OpenRouter: per-image или per-megapixel
    // Google: per-image по размеру
    if (provider === "google") {
      const p = pricing as Record<string, number>
      const imgSize = (params.image_size || paramsSchema?.image_size?.default || "1K") as string
      const price = p[imgSize] || p["1K"] || 0.04
      return { amount: price * n, exact: true }
    }

    // BFL: per-megapixel с width/height
    if (provider === "bfl") {
      const p = pricing as { firstMP?: number; extraMP?: number; perMP?: number }
      const w = parseInt((params.width || paramsSchema?.width?.default || "1024") as string, 10)
      const h = parseInt((params.height || paramsSchema?.height?.default || "1024") as string, 10)
      const mp = (w * h) / 1_000_000
      let pricePerImage: number
      if (p.perMP) {
        pricePerImage = p.perMP * mp
      } else {
        pricePerImage = (p.firstMP || 0) + Math.max(0, mp - 1) * (p.extraMP || 0)
      }
      return { amount: pricePerImage * n, exact: true }
    }

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

      // Цена по tier разрешения (FLUX.3, Seedream 5 Pro, Qwen, Riverflow и др.)
      const bySize = (pricing as { bySize?: Record<string, number> }).bySize
      if (bySize) {
        const sizeKey = (params.image_size || paramsSchema?.image_size?.default || "1K") as string
        const price = bySize[sizeKey] ?? Math.max(...Object.values(bySize))
        return { amount: price * n, exact: false }
      }

      // Flat per-image (Seedream, Gemini, GPT-5)
      if (p.perImage !== undefined) return { amount: p.perImage * n, exact: false }
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

  // Escape закрывает лайтбокс
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedImage) {
        setSelectedImage(null)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedImage])

  /** «Повторить»: модель, промпт (со стилем), параметры и количество — в форму */
  function handleRepeat(job: ImageJob) {
    const { base, styleId } = splitStyleSuffix(job.prompt)
    setPrompt(base)
    setStyle(styleId)
    window.scrollTo({ top: 0, behavior: "smooth" })
    const target = models[job.provider]?.find((m) => m.modelId === job.model)
    if (!target) {
      toast.info("Промпт подставлен", { description: "Эта модель сейчас недоступна — выберите другую." })
      return
    }
    setProvider(job.provider)
    setModelId(job.model)
    savePref("provider", job.provider)
    savePref("model", job.model)
    const schema = target.paramsSchema as Record<string, { options?: string[] }> | null
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(job.params)) {
      const opts = schema?.[key]?.options
      if (schema?.[key] && (!opts || opts.includes(value))) next[key] = value
    }
    setParams(next)
    setCount(String(Math.min(Math.max(job.imagesCount || 1, 1), 4)))
    att.clear()
    const notes: string[] = []
    if (job.isEdit) {
      notes.push(
        job.parentImageId
          ? "Это была правка картинки из Библиотеки — прикрепите её заново или откройте «Править» на ней."
          : "Референс-картинку прикрепите заново.",
      )
    }
    if (!hasApiKeys[job.provider]) notes.push("Для этой модели нужен API-ключ провайдера.")
    toast.success("Форма заполнена", { description: notes.join(" ") || undefined, duration: notes.length ? 7000 : 3000 })
  }

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

    if (att.hasUploading) {
      toast.info("Подождите загрузку картинки")
      return
    }

    const uploadId = att.readyIds[0]
    // Если приложена картинка, но модель не умеет — мягко предупреждаем
    if (uploadId && !modelTakesImage) {
      toast.error("Эта модель не работает с референс-картинкой", {
        description: "Уберите вложение или выберите модель с поддержкой image-input.",
      })
      return
    }

    setIsGenerating(true)
    const tmpId = `tmp-${++tmpCounter}`
    const finalPrompt = prompt.trim() + getStyleSuffix(style)
    const pendingParams: Record<string, string> = {}
    if (paramsSchema) {
      for (const [key, schema] of Object.entries(paramsSchema)) pendingParams[key] = params[key] || schema.default
    }
    setJobs((prev) => [
      {
        id: tmpId,
        status: "processing",
        provider,
        model: modelId,
        prompt: finalPrompt,
        params: pendingParams,
        imagesCount: parseInt(count) || 1,
        images: [],
        isEdit: Boolean(uploadId),
        parentImageId: null,
        startedAt: Date.now(),
      },
      ...prev,
    ])
    const failJob = (error: string) =>
      setJobs((prev) => prev.map((j) => (j.id === tmpId ? { ...j, status: "error", error } : j)))

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 300_000) // 5 минут

    try {
      const finalParams: Record<string, string> = {}
      if (paramsSchema) {
        for (const [key, schema] of Object.entries(paramsSchema)) {
          finalParams[key] = params[key] || schema.default
        }
      }

      // Если приложена картинка — это edit-флоу (image-to-image),
      // иначе обычная text-to-image генерация
      const endpoint = uploadId ? "/api/edit" : "/api/generate"
      const requestBody = uploadId
        ? {
            uploadId,
            prompt: prompt.trim() + getStyleSuffix(style),
            provider,
            model: modelId,
            params: finalParams,
            count: parseInt(count),
          }
        : {
            provider,
            model: modelId,
            prompt: prompt.trim() + getStyleSuffix(style),
            params: finalParams,
            count: parseInt(count),
          }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
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
        failJob(errMsg)
        return
      }

      const data = await response.json() as {
        images: GeneratedImage[]
        generationId: string
        cost: number
      }

      const realId = data.generationId || tmpId
      setJobs((prev) =>
        prev
          // Пока шла генерация, страница истории могла принести эту же запись «в работе»
          .filter((j) => j.id !== realId || j.id === tmpId)
          .map((j) =>
            j.id === tmpId
              ? { ...j, id: realId, status: "done", images: data.images, imagesCount: data.images.length, cost: data.cost }
              : j,
          ),
      )
      // После успешной отправки убираем привязанную картинку, чтобы
      // следующий запрос не унаследовал её случайно.
      att.clear()
      toast.success("Готово!", {
        description: uploadId
          ? `На основе вашей картинки — $${data.cost?.toFixed(3) || "?"}`
          : `Сгенерировано ${data.images.length} изобр. — $${data.cost?.toFixed(3) || "?"}`,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Не удалось подключиться к серверу"
      if (msg.includes("abort")) {
        toast.error("Таймаут", { description: "Генерация заняла слишком много времени. Попробуйте меньше изображений." })
        failJob("Генерация заняла слишком много времени. Если она всё же завершится — картинки появятся в Библиотеке.")
      } else {
        toast.error("Сетевая ошибка", { description: msg })
        failJob(msg)
      }
    } finally {
      clearTimeout(timeoutId)
      setIsGenerating(false)
    }
  }

  const noProviders = Object.keys(models).length === 0

  if (noProviders) {
    return (
      <div className="rounded-lg border border-white/[0.12] py-12 text-center">
        <p className="text-neutral-500">
          Нет доступных моделей. Обратитесь к администратору.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Left — prompt */}
      <div className="space-y-6">
        <div
          className={`relative rounded-lg border bg-white/[0.02] p-5 transition-colors ${
            isDragOver ? "border-x-blue/60 bg-x-blue/[0.04]" : "border-white/[0.12]"
          }`}
          onPaste={att.handlePaste}
          onDragEnter={(e) => {
            if (!modelTakesImage) return
            if (!e.dataTransfer?.types?.includes("Files")) return
            dragCounterRef.current += 1
            setIsDragOver(true)
          }}
          onDragOver={(e) => {
            if (!modelTakesImage) return
            if (!e.dataTransfer?.types?.includes("Files")) return
            e.preventDefault()
            if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
          }}
          onDragLeave={() => {
            if (!modelTakesImage) return
            dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
            if (dragCounterRef.current === 0) setIsDragOver(false)
          }}
          onDrop={(e) => {
            if (!modelTakesImage) return
            e.preventDefault()
            dragCounterRef.current = 0
            setIsDragOver(false)
            const files = e.dataTransfer?.files
            if (files && files.length > 0) att.addFiles(files, "drop")
          }}
        >
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleGenerate}
            disabled={isGenerating}
          />

          {/* Tray вложений — только для моделей с image-input */}
          {(modelTakesImage || att.attachments.length > 0) && (
            <div className="mt-3">
              <AttachmentTray
                attachments={att.attachments}
                onRemove={att.remove}
                onPick={(files) => att.addFiles(files, "picker")}
                disabled={!modelTakesImage}
                hint={
                  att.attachments.length === 0 && modelTakesImage
                    ? "Прикрепите референс-картинку: paste/перетащить/«+» — модель использует её как основу."
                    : undefined
                }
              />
              {att.attachments.length > 0 && (
                <p className="mt-1.5 text-[11px] text-x-blue/80">
                  Картинка прикреплена — запустится правка/image-to-image.
                </p>
              )}
            </div>
          )}

          <div className="mt-3">
            <StyleSelector value={style} onChange={setStyle} />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-neutral-500">Количество</Label>
                <Select value={count} onValueChange={(v) => v && setCount(v)}>
                  <SelectTrigger className="w-20 border-white/[0.12] bg-white/[0.02]">
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

          {isDragOver && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-x-blue/60 bg-x-blue/[0.08]">
              <div className="flex items-center gap-2 text-sm font-medium text-x-blue">
                <ImagePlus className="size-4" />
                Отпустите, чтобы прикрепить как референс
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Right panel — model & params */}
      <div className="space-y-6">
        <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Модель</h3>
          <ModelSelector
            models={models}
            selectedProvider={provider}
            selectedModel={modelId}
            onProviderChange={handleProviderChange}
            onModelChange={handleModelChange}
          />
        </div>

        <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Параметры</h3>
          <ParamPanel
            schema={paramsSchema}
            values={params}
            onChange={handleParamChange}
          />
        </div>

        {/* Стоимость */}
        {costEstimate !== null && (
          <div className="flex items-center justify-between rounded-lg border border-white/[0.12] bg-white/[0.02] px-5 py-3">
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

    </div>

      <HistoryFeedSection
        title="Мои картинки"
        count={feedCount(historyFeed.state, jobs)}
        state={historyFeed.state}
        onLoadMore={historyFeed.loadMore}
        libraryHref="/library"
        libraryLabel="Все картинки в Библиотеке →"
        emptyText="Здесь появятся ваши генерации: и готовые, и те, что не удались."
        hasItems={jobs.length > 0}
        skeleton={<ImageJobCardSkeleton />}
        gridClassName="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {jobs.map((job) => (
          <ImageJobCard
            key={job.id}
            job={job}
            modelName={modelName(job.provider, job.model)}
            onOpen={(img) => setSelectedImage(toGenerated(img))}
            onEdit={(img) => setEditingImage(toGenerated(img))}
            onRepeat={handleRepeat}
          />
        ))}
      </HistoryFeedSection>

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
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => {
                  setEditingImage(selectedImage)
                  setSelectedImage(null)
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/[0.08] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.14]"
              >
                <Wand2 className="size-4" />
                Редактировать
              </button>
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

      {/* Диалог правки */}
      {editingImage && (
        <ImageEditDialog
          image={editingImage}
          hasOpenAIKey={!!hasApiKeys.openai}
          hasOpenRouterKey={!!hasApiKeys.openrouter}
          onClose={() => setEditingImage(null)}
          onEditComplete={(newImages, meta) => {
            const job: ImageJob = {
              id: meta?.generationId ?? `tmp-${++tmpCounter}`,
              status: "done",
              provider: meta?.provider ?? provider,
              model: meta?.model ?? modelId,
              prompt: meta?.prompt ?? "",
              params: {},
              imagesCount: newImages.length,
              images: newImages,
              cost: meta?.cost,
              isEdit: true,
              parentImageId: editingImage.id,
              startedAt: Date.now(),
            }
            setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)])
          }}
        />
      )}
    </div>
  )
}
