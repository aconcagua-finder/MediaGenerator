"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  Check,
  Copy,
  ImagePlus,
  Loader2,
  Maximize2,
  RefreshCw,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  COVER_MODELS,
  DEFAULT_COVER_MODEL_BY_STYLE,
} from "@/lib/content/cover-models"

type CoverStyle = "3d_with_text" | "minimalist" | "photo"

const STYLE_OPTIONS: Array<{ id: CoverStyle; label: string; hint: string }> = [
  {
    id: "3d_with_text",
    label: "3D в стиле канала",
    hint: "Синий фон, объёмные объекты, тёмная плашка с русским заголовком и жёлтым акцентом. Логотип ставится вручную в верхнем левом углу.",
  },
  {
    id: "minimalist",
    label: "Минимализм",
    hint: "Редакторская иллюстрация без текста, мягкие градиенты, 16:9.",
  },
  {
    id: "photo",
    label: "Фото",
    hint: "Фотореалистичная сцена без текста, 16:9.",
  },
]

export interface CoverItem {
  imageId: string
  prompt: string
  style?: string
  createdAt?: string
}

interface CoverGalleryProps {
  runId: string
  /** Полная история обложек этого run-а. */
  items: CoverItem[]
  /** ID активной обложки — она показывается крупно и идёт в превью Telegram. */
  activeImageId: string | null
  /** Стартовый промпт — берётся из активной обложки. */
  initialPrompt?: string | null
  onGenerated: (params: {
    history: CoverItem[]
    activeImageId: string
    totalCost: number
  }) => void
  onSelected: (imageId: string) => void
}

export function CoverGallery({
  runId,
  items,
  activeImageId,
  initialPrompt,
  onGenerated,
  onSelected,
}: CoverGalleryProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  // Промпт в диалоге стартует пустым — пользователь либо генерит из текста поста,
  // либо вводит свой. Прошлый промпт доступен по кнопке «Использовать прошлый».
  const [prompt, setPrompt] = useState("")
  const [style, setStyle] = useState<CoverStyle>("3d_with_text")
  // Выбранная модель — composite id "provider:model". Если null, используется
  // дефолт под текущий стиль.
  const [modelId, setModelId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [copiedActive, setCopiedActive] = useState(false)
  // Открытая обложка в полноэкранном просмотре (lightbox).
  const [zoomImageId, setZoomImageId] = useState<string | null>(null)
  const hasAny = items.length > 0
  const hasPrevPrompt = Boolean(initialPrompt && initialPrompt.trim())

  const openDialog = () => {
    setPrompt("")
    setDialogOpen(true)
  }

  // Эффективный id модели: что выбрано вручную или дефолт под стиль.
  const effectiveModelId = modelId || DEFAULT_COVER_MODEL_BY_STYLE[style] || COVER_MODELS[0].id
  const selectedModel = COVER_MODELS.find((m) => m.id === effectiveModelId) || COVER_MODELS[0]

  const generate = async (override?: string) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/content/runs/${runId}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style,
          provider: selectedModel.provider,
          model: selectedModel.model,
          ...(override !== undefined ? { prompt: override } : {}),
        }),
      })
      const data = (await response.json()) as {
        imageId?: string
        prompt?: string
        history?: CoverItem[]
        totalCost?: number
        error?: string
      }
      if (!response.ok || !data.imageId) {
        toast.error(data.error || "Не удалось сгенерировать обложку")
        return
      }
      onGenerated({
        history: data.history || [],
        activeImageId: data.imageId,
        totalCost: typeof data.totalCost === "number" ? data.totalCost : 0,
      })
      setPrompt(data.prompt || "")
      toast.success("Новый вариант обложки готов")
      setDialogOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Сетевая ошибка")
    } finally {
      setBusy(false)
    }
  }

  const select = async (imageId: string) => {
    if (imageId === activeImageId) return
    setSelectingId(imageId)
    try {
      const response = await fetch(`/api/content/runs/${runId}/cover/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        toast.error(data.error || "Не удалось выбрать")
        return
      }
      onSelected(imageId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Сетевая ошибка")
    } finally {
      setSelectingId(null)
    }
  }

  const copyActive = async () => {
    if (!activeImageId) return
    try {
      const response = await fetch(`/api/images/${activeImageId}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const sourceBlob = await response.blob()
      const blob =
        sourceBlob.type === "image/png" ? sourceBlob : await convertToPng(sourceBlob)
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      setCopiedActive(true)
      toast.success("Картинка скопирована — можно вставлять в Telegram")
      setTimeout(() => setCopiedActive(false), 2000)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Браузер не разрешил копировать картинку",
      )
    }
  }

  return (
    <div className="space-y-3">
      {!hasAny && (
        <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.01] p-4 text-center text-sm text-neutral-400">
          <p>Обложки пока нет.</p>
          <Button size="sm" className="mt-2" onClick={openDialog} disabled={busy}>
            <ImagePlus className="mr-1.5 size-3.5" />
            Создать обложку
          </Button>
        </div>
      )}

      {hasAny && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={copyActive} disabled={!activeImageId}>
              {copiedActive ? (
                <Check className="mr-1.5 size-3.5" />
              ) : (
                <Copy className="mr-1.5 size-3.5" />
              )}
              Копировать активную
            </Button>
            <Button size="sm" variant="outline" onClick={openDialog} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-3.5" />
              )}
              Сгенерить ещё вариант
            </Button>
            {activeImageId && (
              <a
                href={`/api/images/${activeImageId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-neutral-500 underline hover:text-neutral-300"
              >
                Скачать активную
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => {
              const isActive = item.imageId === activeImageId
              const isLoading = selectingId === item.imageId
              return (
                <div
                  key={item.imageId}
                  className={cn(
                    "group relative overflow-hidden rounded-lg border bg-white/[0.02] transition-all",
                    isActive
                      ? "border-emerald-400/60 ring-2 ring-emerald-400/30"
                      : "border-white/[0.08] hover:border-white/[0.18]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void select(item.imageId)}
                    title={item.prompt}
                    className="block w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/images/${item.imageId}`}
                      alt="cover"
                      className="block aspect-square w-full object-cover"
                    />
                  </button>
                  {isActive && (
                    <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-1.5 py-0.5 text-[10px] font-medium text-emerald-950">
                      <Check className="size-3" /> активна
                    </span>
                  )}
                  {/* Лупа в правом верхнем углу — открывает lightbox без выбора активной */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setZoomImageId(item.imageId)
                    }}
                    title="Открыть в полный размер"
                    aria-label="Открыть обложку"
                    className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Maximize2 className="size-3.5" />
                  </button>
                  {isLoading && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="size-4 animate-spin text-white" />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => !busy && setDialogOpen(v)}>
        <DialogContent className="flex max-h-[85vh] max-w-xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Обложка к посту</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Стиль</Label>
              <div className="space-y-1.5">
                {STYLE_OPTIONS.map((opt) => {
                  const active = style === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setStyle(opt.id)
                        // Подменяем модель на дефолт для нового стиля,
                        // если пользователь её явно не выбирал
                        setModelId(null)
                      }}
                      disabled={busy}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                        active
                          ? "border-sky-500/40 bg-sky-500/10"
                          : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1 size-3.5 shrink-0 rounded-full border",
                          active
                            ? "border-sky-400 bg-sky-400/40"
                            : "border-white/[0.15] bg-transparent",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm font-medium", active ? "text-white" : "text-neutral-200")}>
                          {opt.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">
                          {opt.hint}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="cover-model">Модель</Label>
                <span className="text-[11px] text-neutral-500">
                  {selectedModel.approxCost} за картинку
                </span>
              </div>
              <select
                id="cover-model"
                value={effectiveModelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={busy}
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-neutral-100 transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              >
                {COVER_MODELS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-neutral-900">
                    {m.label}
                    {m.goodForCyrillic ? " · 🇷🇺 ОК" : ""}
                  </option>
                ))}
              </select>
              {selectedModel.hint && (
                <p className="text-[11px] text-neutral-500">{selectedModel.hint}</p>
              )}
              {style === "3d_with_text" && !selectedModel.goodForCyrillic && (
                <p className="text-[11px] text-amber-400">
                  ⚠ Эта модель плохо рисует кириллицу — заголовок на плашке может выйти
                  кривой. Лучше gpt-image-2 или gpt-image-1.5.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="cover-prompt">Свой image-prompt (опционально)</Label>
                <div className="flex items-center gap-3 text-[11px]">
                  {hasPrevPrompt && !prompt && (
                    <button
                      type="button"
                      onClick={() => setPrompt(initialPrompt || "")}
                      disabled={busy}
                      className="text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline disabled:opacity-50"
                    >
                      Взять прошлый
                    </button>
                  )}
                  {prompt && (
                    <button
                      type="button"
                      onClick={() => setPrompt("")}
                      disabled={busy}
                      className="text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline disabled:opacity-50"
                    >
                      Очистить
                    </button>
                  )}
                </div>
              </div>
              <Textarea
                id="cover-prompt"
                rows={4}
                value={prompt}
                placeholder="Оставь пустым — модель сама придумает сцену из текста поста"
                onChange={(e) => setPrompt(e.target.value)}
                disabled={busy}
                className="max-h-[200px] resize-y overflow-y-auto font-mono text-xs leading-relaxed"
              />
              <p className="text-[11px] text-neutral-500">
                В стиле 3D логотип в верхнем левом углу нужно вставить вручную в обычном
                редакторе — нейросеть его не пытается рисовать.
              </p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                onClick={() => void generate(undefined)}
                disabled={busy}
              >
                Сгенерить из текста
              </Button>
              <Button onClick={() => void generate(prompt)} disabled={busy || !prompt.trim()}>
                {busy ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="mr-1.5 size-3.5" />
                )}
                Сгенерить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {zoomImageId && (
        <CoverLightbox
          imageId={zoomImageId}
          onClose={() => setZoomImageId(null)}
        />
      )}
    </div>
  )
}

function CoverLightbox({ imageId, onClose }: { imageId: string; onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    // Не трогаем body.overflow — он ломает позиционирование других порталов
    // (base-ui select-popper и т.п.). Backdrop сам перехватывает скролл.
    return () => {
      window.removeEventListener("keydown", handleKey)
    }
  }, [onClose])

  if (typeof window === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
      onWheel={(e) => e.preventDefault()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/images/${imageId}`}
        alt="cover full size"
        onClick={(e) => e.stopPropagation()}
        className="block max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90"
      >
        <X className="size-5" />
      </button>
    </div>,
    document.body,
  )
}

async function convertToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error("Canvas недоступен"))
        return
      }
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(
        (out) => {
          URL.revokeObjectURL(url)
          if (out) resolve(out)
          else reject(new Error("Не удалось конвертировать в PNG"))
        },
        "image/png",
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Не удалось прочитать картинку"))
    }
    img.src = url
  })
}
