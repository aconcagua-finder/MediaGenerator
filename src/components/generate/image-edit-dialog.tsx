"use client"

import { useState, useEffect } from "react"
import { Loader2, Wand2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface GeneratedImage {
  id: string
  url: string
  width: number
  height: number
}

interface ImageEditDialogProps {
  image: GeneratedImage
  hasOpenAIKey: boolean
  hasOpenRouterKey?: boolean
  onClose: () => void
  onEditComplete: (newImages: GeneratedImage[]) => void
}

interface EditModel {
  /** Внутренний id формата "provider::modelId" */
  key: string
  /** ID провайдера в нашем реестре */
  provider: "openai" | "openrouter"
  /** ID модели у провайдера */
  modelId: string
  /** Имя для UI */
  name: string
  /** Подпись с вендором/брендом для бейджа */
  vendorLabel: string
  /** Цветовая категория провайдера */
  vendorTone: "openai" | "google" | "openrouter"
  /** Краткое описание (зачем выбирать) */
  hint: string
  /** Группа */
  category: string
  /** Помечена как новинка */
  isNew?: boolean
}

const EDIT_MODELS: EditModel[] = [
  // === OpenAI напрямую (images/edits) ===
  {
    key: "openai::gpt-image-2",
    provider: "openai",
    modelId: "gpt-image-2",
    name: "GPT Image 2",
    vendorLabel: "OpenAI",
    vendorTone: "openai",
    hint: "Новейшая, лучшее качество правок и работа с текстом",
    category: "OpenAI — точные правки",
    isNew: true,
  },
  {
    key: "openai::gpt-image-1.5",
    provider: "openai",
    modelId: "gpt-image-1.5",
    name: "GPT Image 1.5",
    vendorLabel: "OpenAI",
    vendorTone: "openai",
    hint: "Предыдущая флагман — стабильная и проверенная",
    category: "OpenAI — точные правки",
  },
  {
    key: "openai::gpt-image-1-mini",
    provider: "openai",
    modelId: "gpt-image-1-mini",
    name: "GPT Image 1 Mini",
    vendorLabel: "OpenAI",
    vendorTone: "openai",
    hint: "Бюджетный вариант OpenAI — быстро и дёшево",
    category: "OpenAI — точные правки",
  },

  // === Google Gemini через OpenRouter (Nano Banana) ===
  {
    key: "openrouter::google/gemini-3.1-flash-image-preview",
    provider: "openrouter",
    modelId: "google/gemini-3.1-flash-image-preview",
    name: "Gemini 3.1 Flash Image",
    vendorLabel: "Google",
    vendorTone: "google",
    hint: "Nano Banana 2 — топ для правок: понимает контекст и сохраняет стиль",
    category: "Google Nano Banana — креативные правки",
    isNew: true,
  },
  {
    key: "openrouter::google/gemini-3-pro-image-preview",
    provider: "openrouter",
    modelId: "google/gemini-3-pro-image-preview",
    name: "Gemini 3 Pro Image",
    vendorLabel: "Google",
    vendorTone: "google",
    hint: "Nano Banana Pro — максимум деталей, до 4K",
    category: "Google Nano Banana — креативные правки",
  },
  {
    key: "openrouter::google/gemini-2.5-flash-image",
    provider: "openrouter",
    modelId: "google/gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash Image",
    vendorLabel: "Google",
    vendorTone: "google",
    hint: "Nano Banana — быстрая и дешёвая",
    category: "Google Nano Banana — креативные правки",
  },

  // === OpenAI через OpenRouter ===
  {
    key: "openrouter::openai/gpt-5-image",
    provider: "openrouter",
    modelId: "openai/gpt-5-image",
    name: "GPT-5 Image",
    vendorLabel: "OpenRouter",
    vendorTone: "openrouter",
    hint: "OpenAI image через OpenRouter — без отдельного ключа OpenAI",
    category: "Через OpenRouter",
  },
  {
    key: "openrouter::openai/gpt-5.4-image-2",
    provider: "openrouter",
    modelId: "openai/gpt-5.4-image-2",
    name: "GPT-5.4 Image 2",
    vendorLabel: "OpenRouter",
    vendorTone: "openrouter",
    hint: "Свежая версия GPT image через OpenRouter",
    category: "Через OpenRouter",
    isNew: true,
  },
]

const VENDOR_TONE: Record<EditModel["vendorTone"], { dot: string; text: string }> = {
  openai: { dot: "bg-emerald-400", text: "text-emerald-300" },
  google: { dot: "bg-blue-400", text: "text-blue-300" },
  openrouter: { dot: "bg-rose-400", text: "text-rose-300" },
}

const QUALITY_OPTIONS = [
  { id: "low", label: "Низкое — быстрее, дешевле" },
  { id: "medium", label: "Среднее — оптимально" },
  { id: "high", label: "Высокое — максимум деталей" },
]

const PROMPT_EXAMPLES = [
  "Сделай небо закатное, оранжево-розовое",
  "Добавь снегопад",
  "Замени фон на минималистичный белый",
  "Сделай изображение более ярким и контрастным",
]

const DEFAULT_MODEL_KEY = "openai::gpt-image-2"

export function ImageEditDialog({
  image,
  hasOpenAIKey,
  hasOpenRouterKey = true,
  onClose,
  onEditComplete,
}: ImageEditDialogProps) {
  const [prompt, setPrompt] = useState("")
  const [modelKey, setModelKey] = useState(DEFAULT_MODEL_KEY)
  const [quality, setQuality] = useState("medium")
  const [isEditing, setIsEditing] = useState(false)

  const currentModel = EDIT_MODELS.find((m) => m.key === modelKey) || EDIT_MODELS[0]
  const needsOpenAIKey = currentModel.provider === "openai"
  const needsOpenRouterKey = currentModel.provider === "openrouter"
  const keyMissing =
    (needsOpenAIKey && !hasOpenAIKey) || (needsOpenRouterKey && !hasOpenRouterKey)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isEditing) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, isEditing])

  // Группируем модели по категории для красивого дропдауна
  const modelsByCategory = EDIT_MODELS.reduce<Record<string, EditModel[]>>((acc, m) => {
    if (!acc[m.category]) acc[m.category] = []
    acc[m.category].push(m)
    return acc
  }, {})

  async function handleApply() {
    if (!prompt.trim()) {
      toast.error("Опишите изменение")
      return
    }
    if (keyMissing) {
      const which = needsOpenAIKey ? "OpenAI" : "OpenRouter"
      toast.error(`Нет API ключа ${which}`, {
        description: "Добавьте его в Настройках или выберите другую модель.",
      })
      return
    }

    setIsEditing(true)
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 300_000)

    try {
      // Параметры зависят от провайдера: OpenAI принимает size/quality,
      // OpenRouter — image_size/aspect_ratio (необязательно)
      const params =
        currentModel.provider === "openai"
          ? { quality, size: "1024x1024", output_format: "png" }
          : {}

      const response = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          imageId: image.id,
          prompt: prompt.trim(),
          provider: currentModel.provider,
          model: currentModel.modelId,
          params,
          count: 1,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        toast.error("Ошибка правки", {
          description: err.error || `Сервер вернул ${response.status}`,
          duration: 6000,
        })
        return
      }

      const data = await response.json() as {
        images: GeneratedImage[]
        cost: number
      }

      toast.success("Готово!", {
        description: `Новый вариант создан — $${data.cost?.toFixed(3) || "?"}`,
      })
      onEditComplete(data.images)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Сетевая ошибка"
      if (msg.includes("abort")) {
        toast.error("Таймаут", { description: "Правка заняла слишком много времени." })
      } else {
        toast.error("Сетевая ошибка", { description: msg })
      }
    } finally {
      clearTimeout(tid)
      setIsEditing(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={() => !isEditing && onClose()}
    >
      <div
        className="relative grid w-full max-w-5xl gap-6 rounded-2xl border border-white/[0.12] bg-neutral-950 p-6 lg:grid-cols-[1fr_380px]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={isEditing}
          className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
          aria-label="Закрыть"
        >
          <X className="size-5" />
        </button>

        {/* Превью изображения */}
        <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-xl bg-black/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt="Original"
            className="max-h-[70vh] w-auto object-contain"
            style={{ aspectRatio: `${image.width} / ${image.height}` }}
          />
        </div>

        {/* Панель правки */}
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Редактировать</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Опишите, что хотите изменить — модель применит правку к этому изображению.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-neutral-400">
              Что изменить
            </Label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Например: добавь радугу на фоне, или замени человека на робота…"
              disabled={isEditing}
              rows={5}
              className="w-full resize-none rounded-lg border border-white/[0.12] bg-white/[0.02] p-3 text-sm text-white placeholder:text-neutral-600 focus:border-x-blue/40 focus:outline-none disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleApply()
                }
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={isEditing}
                  onClick={() => setPrompt(ex)}
                  className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-neutral-400 transition-colors hover:border-white/[0.18] hover:text-white disabled:opacity-40"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-neutral-400">Модель</Label>
            <Select
              value={modelKey}
              onValueChange={(v) => v && setModelKey(v)}
              disabled={isEditing}
            >
              <SelectTrigger className="h-auto w-full border-white/[0.12] bg-white/[0.02] py-2">
                <SelectValue>
                  <div className="flex w-full items-center gap-2">
                    <span className={`size-2 shrink-0 rounded-full ${VENDOR_TONE[currentModel.vendorTone].dot}`} />
                    <span className="truncate text-sm font-medium text-white">
                      {currentModel.name}
                    </span>
                    <span className={`ml-auto shrink-0 text-[10px] uppercase tracking-wider ${VENDOR_TONE[currentModel.vendorTone].text}`}>
                      {currentModel.vendorLabel}
                    </span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="!w-auto w-[380px] max-w-[min(420px,92vw)] p-1">
                {Object.entries(modelsByCategory).map(([cat, models]) => (
                  <SelectGroup key={cat}>
                    <SelectLabel className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
                      {cat}
                    </SelectLabel>
                    {models.map((m) => {
                      const tone = VENDOR_TONE[m.vendorTone]
                      return (
                        <SelectItem
                          key={m.key}
                          value={m.key}
                          className="cursor-pointer rounded-md py-2 data-[highlighted]:bg-white/[0.04]"
                        >
                          <div className="flex w-full flex-col gap-1">
                            <div className="flex w-full items-center gap-1.5">
                              <span className={`size-2 shrink-0 rounded-full ${tone.dot}`} />
                              <span className="min-w-0 flex-1 truncate font-medium text-white">
                                {m.name}
                              </span>
                              {m.isNew && (
                                <span className="shrink-0 rounded-full bg-x-blue/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-x-blue">
                                  Новинка
                                </span>
                              )}
                              <span className={`shrink-0 text-[10px] uppercase tracking-wider ${tone.text}`}>
                                {m.vendorLabel}
                              </span>
                            </div>
                            <span className="whitespace-normal text-xs leading-snug text-neutral-400">
                              {m.hint}
                            </span>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Качество — только для OpenAI direct (другим провайдерам не нужно) */}
          {currentModel.provider === "openai" && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-neutral-400">Качество</Label>
              <Select value={quality} onValueChange={(v) => v && setQuality(v)} disabled={isEditing}>
                <SelectTrigger className="w-full border-white/[0.12] bg-white/[0.02]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUALITY_OPTIONS.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {keyMissing && (
            <p className="text-xs text-red-400">
              Для этой модели нужен API ключ {needsOpenAIKey ? "OpenAI" : "OpenRouter"}.
              Добавьте его в Настройках или выберите другую модель.
            </p>
          )}

          <div className="mt-auto flex gap-2 pt-2">
            <button
              onClick={handleApply}
              disabled={isEditing || !prompt.trim() || keyMissing}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-x-blue px-5 text-sm font-bold text-white transition-colors hover:bg-x-blue-hover active:scale-[0.98] disabled:opacity-40"
            >
              {isEditing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              {isEditing ? "Правка..." : "Применить правку"}
            </button>
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isEditing}
              className="rounded-full text-neutral-400 hover:text-white"
            >
              Отмена
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
