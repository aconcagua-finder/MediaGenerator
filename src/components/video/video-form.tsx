"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Video, Loader2, DollarSign, Volume2, VolumeX, ImagePlus, Download, Scissors } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PromptInput } from "@/components/generate/prompt-input"
import { VideoModelSelector } from "./video-model-selector"
import { useImageAttachments } from "@/hooks/use-image-attachments"
import { AttachmentTray } from "@/components/shared/attachment-tray"
import {
  VIDEO_MODELS,
  getVideoModel,
  defaultVideoParams,
  estimateVideoCost,
  videoPricePerSecond,
  DEFAULT_VIDEO_MODEL,
  RUSSIAN_SPEECH_INFO,
} from "@/lib/providers/video-models"
import { toast } from "sonner"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface VideoResult {
  id: string
  url: string
  width: number | null
  height: number | null
  hasAudio: boolean
  durationSeconds: number | null
}

interface VideoJob {
  id: string
  status: "processing" | "done" | "error"
  prompt: string
  modelName: string
  aspect: string
  startedAt: number
  video?: VideoResult
  error?: string
}

interface VideoFormProps {
  hasOpenRouterKey: boolean
}

function loadSaved(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  return localStorage.getItem(`mg_${key}`) || fallback
}
function savePref(key: string, value: string) {
  if (typeof window !== "undefined") localStorage.setItem(`mg_${key}`, value)
}

interface VideoParams {
  duration: number
  resolution: string
  aspect_ratio: string
  generate_audio: boolean
}

export function VideoForm({ hasOpenRouterKey }: VideoFormProps) {
  const [modelId, setModelId] = useState(() => {
    const saved = loadSaved("video_model", "")
    return saved && getVideoModel(saved) ? saved : DEFAULT_VIDEO_MODEL
  })
  const model = getVideoModel(modelId) || VIDEO_MODELS[0]

  const [prompt, setPrompt] = useState("")
  const [params, setParams] = useState<VideoParams>(() => defaultVideoParams(model))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const router = useRouter()

  // Готовые клипы этой сессии — для быстрой склейки
  const doneVideoIds = jobs
    .filter((j) => j.status === "done" && j.video)
    .map((j) => j.video!.id)

  const modelTakesImage = model.modes.includes("i2v")
  const att = useImageAttachments({ disabled: !modelTakesImage, maxCount: 1 })

  const pollingRef = useRef<Set<string>>(new Set())
  const mountedRef = useRef(true)
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Тикаем раз в секунду, пока есть незавершённые задачи — для счётчика времени
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!jobs.some((j) => j.status === "processing")) return
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [jobs])

  const costEstimate = useMemo(
    () =>
      estimateVideoCost(model, {
        durationSeconds: params.duration,
        resolution: params.resolution,
        audio: params.generate_audio,
      }),
    [model, params.duration, params.resolution, params.generate_audio]
  )

  const handleModelChange = useCallback((newId: string) => {
    setModelId(newId)
    savePref("video_model", newId)
    const m = getVideoModel(newId)
    if (m) setParams(defaultVideoParams(m))
  }, [])

  const setParam = useCallback(
    (key: keyof VideoParams, value: string | number | boolean) => {
      setParams((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  async function pollJob(genId: string) {
    if (pollingRef.current.has(genId)) return
    pollingRef.current.add(genId)
    const maxAttempts = 240 // ~12 минут при шаге 3с

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await sleep(attempt === 0 ? 2000 : 3000)
      if (!mountedRef.current) {
        pollingRef.current.delete(genId)
        return
      }
      let data: { status?: string; video?: VideoResult; error?: string; cost?: number } = {}
      try {
        const r = await fetch(`/api/video/${genId}/status`)
        data = await r.json()
      } catch {
        continue // транзиентная сетевая ошибка — повторим
      }

      if (data.status === "done") {
        setJobs((prev) =>
          prev.map((j) => (j.id === genId ? { ...j, status: "done", video: data.video } : j))
        )
        pollingRef.current.delete(genId)
        toast.success("Видео готово!", {
          description: typeof data.cost === "number" ? `Стоимость: $${data.cost.toFixed(3)}` : undefined,
        })
        return
      }
      if (data.status === "error") {
        setJobs((prev) =>
          prev.map((j) => (j.id === genId ? { ...j, status: "error", error: data.error } : j))
        )
        pollingRef.current.delete(genId)
        toast.error("Ошибка генерации видео", { description: data.error, duration: 8000 })
        return
      }
      // status === "processing" → продолжаем опрос
    }

    setJobs((prev) =>
      prev.map((j) =>
        j.id === genId
          ? { ...j, status: "error", error: "Превышено время ожидания. Попробуйте позже." }
          : j
      )
    )
    pollingRef.current.delete(genId)
  }

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("Введите промпт")
      return
    }
    if (!hasOpenRouterKey) {
      toast.error("Не настроен ключ OpenRouter", {
        description: "Добавьте API ключ OpenRouter в Настройках.",
      })
      return
    }
    if (att.hasUploading) {
      toast.info("Подождите загрузку картинки")
      return
    }
    const uploadId = att.readyIds[0]
    if (uploadId && !modelTakesImage) {
      toast.error("Эта модель не умеет image-to-video", {
        description: "Уберите картинку или выберите модель с поддержкой «из картинки».",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          prompt: prompt.trim(),
          params,
          ...(uploadId ? { uploadId } : {}),
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        const errMsg = errData.error || `Ошибка сервера (${response.status})`
        if (response.status === 429) {
          toast.error("Лимит исчерпан", { description: errMsg, duration: 8000 })
        } else if (response.status === 400) {
          toast.error("Ошибка запроса", { description: errMsg, duration: 6000 })
        } else {
          toast.error("Не удалось запустить", { description: errMsg, duration: 6000 })
        }
        return
      }

      const data = (await response.json()) as { videoGenerationId: string }
      const job: VideoJob = {
        id: data.videoGenerationId,
        status: "processing",
        prompt: prompt.trim(),
        modelName: model.name,
        aspect: params.aspect_ratio,
        startedAt: Date.now(),
      }
      setJobs((prev) => [job, ...prev])
      att.clear()
      toast.success("Запущено", {
        description: "Генерация видео обычно занимает 30 сек – 2 минуты",
      })
      void pollJob(data.videoGenerationId)
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Не удалось подключиться к серверу"
      toast.error("Сетевая ошибка", { description: msg })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Левая колонка — промпт и результаты */}
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
          <PromptInput value={prompt} onChange={setPrompt} onSubmit={handleGenerate} disabled={isSubmitting} />

          {/* Референс-кадр — только для моделей с image-to-video */}
          {(modelTakesImage || att.attachments.length > 0) && (
            <div className="mt-3">
              <AttachmentTray
                attachments={att.attachments}
                onRemove={att.remove}
                onPick={(files) => att.addFiles(files, "picker")}
                disabled={!modelTakesImage}
                hint={
                  att.attachments.length === 0 && modelTakesImage
                    ? "Прикрепите кадр (paste/перетащить/«+») — видео начнётся с него (image-to-video)."
                    : undefined
                }
              />
              {att.attachments.length > 0 && (
                <p className="mt-1.5 text-[11px] text-x-blue/80">
                  Кадр прикреплён — запустится image-to-video.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center justify-end">
            <button
              onClick={handleGenerate}
              disabled={isSubmitting || !prompt.trim() || !hasOpenRouterKey}
              className="flex h-10 items-center gap-2 rounded-full bg-x-blue px-5 text-sm font-bold text-white transition-colors hover:bg-x-blue-hover active:scale-[0.98] disabled:opacity-40"
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />}
              {isSubmitting ? "Отправка..." : "Сгенерировать видео"}
            </button>
          </div>
          {!hasOpenRouterKey && (
            <p className="mt-3 text-sm text-red-400">
              Не настроен ключ OpenRouter. Перейдите в Настройки.
            </p>
          )}

          {isDragOver && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-x-blue/60 bg-x-blue/[0.08]">
              <div className="flex items-center gap-2 text-sm font-medium text-x-blue">
                <ImagePlus className="size-4" />
                Отпустите, чтобы прикрепить первый кадр
              </div>
            </div>
          )}
        </div>

        {/* Результаты */}
        {jobs.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-neutral-400">Результаты</h3>
              {doneVideoIds.length >= 2 && (
                <button
                  type="button"
                  onClick={() => router.push(`/video/editor?clips=${doneVideoIds.slice(0, 12).join(",")}`)}
                  className="flex h-8 items-center gap-1.5 rounded-full border border-x-blue/40 bg-x-blue/[0.1] px-3 text-xs font-medium text-x-blue transition-colors hover:bg-x-blue/[0.18]"
                >
                  <Scissors className="size-3.5" />
                  Склеить готовые ({doneVideoIds.length})
                </button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {jobs.map((job) => (
                <VideoCard key={job.id} job={job} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Правая колонка — модель и параметры */}
      <div className="space-y-6">
        <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Модель</h3>
          <VideoModelSelector selectedModel={modelId} onModelChange={handleModelChange} />
          {/* Индикатор русской озвучки выбранной модели */}
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug">
            <span
              className={`mt-1 size-1.5 shrink-0 rounded-full ${
                model.supportsAudio ? RUSSIAN_SPEECH_INFO[model.russianSpeech].dot : "bg-neutral-600"
              }`}
            />
            <span className={model.supportsAudio ? RUSSIAN_SPEECH_INFO[model.russianSpeech].text : "text-neutral-500"}>
              {model.supportsAudio
                ? RUSSIAN_SPEECH_INFO[model.russianSpeech].label
                : "Без звука — озвучку добавляйте отдельно"}
              {model.supportsAudio && model.russianSpeech !== "good" && (
                <>
                  {" · для русской речи — "}
                  <button
                    type="button"
                    onClick={() => handleModelChange("google/veo-3.1-fast")}
                    className="text-x-blue hover:underline"
                  >
                    Veo 3.1 Fast
                  </button>
                </>
              )}
            </span>
          </p>
        </div>

        <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Параметры</h3>
          <div className="grid items-end gap-4 sm:grid-cols-2">
            <ParamSelect
              label="Длительность"
              value={String(params.duration)}
              options={model.durations.map((d) => ({ value: String(d), label: `${d} сек` }))}
              onChange={(v) => setParam("duration", Number(v))}
            />
            <ParamSelect
              label="Разрешение"
              value={params.resolution}
              options={model.resolutions.map((r) => ({ value: r, label: r }))}
              onChange={(v) => setParam("resolution", v)}
            />
            <ParamSelect
              label="Соотношение"
              value={params.aspect_ratio}
              options={model.aspectRatios.map((a) => ({ value: a, label: a }))}
              onChange={(v) => setParam("aspect_ratio", v)}
            />
            {model.supportsAudio && (
              <div className="space-y-1.5">
                <Label className="block text-sm font-medium leading-tight text-neutral-400">Звук</Label>
                <button
                  type="button"
                  onClick={() => setParam("generate_audio", !params.generate_audio)}
                  className={`flex h-9 w-full items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition-colors ${
                    params.generate_audio
                      ? "border-x-blue/40 bg-x-blue/[0.12] text-x-blue"
                      : "border-white/[0.12] bg-white/[0.02] text-neutral-400 hover:text-white"
                  }`}
                >
                  {params.generate_audio ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                  {params.generate_audio ? "Со звуком" : "Без звука"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Оценка стоимости */}
        <div className="flex items-center justify-between rounded-lg border border-white/[0.12] bg-white/[0.02] px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <DollarSign className="size-4" />
            <span>Примерная стоимость</span>
          </div>
          <span className="text-sm font-bold text-white">~${costEstimate.toFixed(3)}</span>
        </div>
        <p className="-mt-3 px-1 text-[11px] leading-snug text-neutral-600">
          Точная сумма спишется по факту от OpenRouter после генерации (≈${videoPricePerSecond(model, params.resolution, params.generate_audio).toFixed(3)}/сек при {params.resolution} × {params.duration} сек).
        </p>
      </div>
    </div>
  )
}

interface ParamSelectProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

function ParamSelect({ label, value, options, onChange }: ParamSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label className="block text-sm font-medium leading-tight text-neutral-400">{label}</Label>
      {options.length > 1 ? (
        <Select value={value} onValueChange={(v) => v && onChange(v)}>
          <SelectTrigger className="w-full border-white/[0.12] bg-white/[0.02]">
            <SelectValue>{options.find((o) => o.value === value)?.label || value}</SelectValue>
          </SelectTrigger>
          <SelectContent className="!w-auto min-w-[140px]">
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex h-9 items-center rounded-md border border-white/[0.12] bg-white/[0.02] px-3 text-sm text-neutral-300">
          {options[0]?.label || value}
        </div>
      )}
    </div>
  )
}

function VideoCard({ job }: { job: VideoJob }) {
  const aspectStyle = (() => {
    if (job.video?.width && job.video?.height) {
      return { aspectRatio: `${job.video.width} / ${job.video.height}` }
    }
    const [aw, ah] = job.aspect.split(":")
    return { aspectRatio: `${aw || 16} / ${ah || 9}` }
  })()

  if (job.status === "done" && job.video) {
    return (
      <div className="overflow-hidden rounded-lg border border-white/[0.12] bg-white/[0.02]">
        <video
          src={job.video.url}
          controls
          preload="metadata"
          playsInline
          className="w-full bg-black"
          style={aspectStyle}
        />
        <div className="flex items-center gap-2 px-3 py-2">
          <p className="min-w-0 flex-1 truncate text-xs text-neutral-400" title={job.prompt}>
            {job.prompt}
          </p>
          {job.video.durationSeconds != null && (
            <span className="shrink-0 text-[11px] text-neutral-500">{job.video.durationSeconds}с</span>
          )}
          {job.video.hasAudio ? (
            <Volume2 className="size-3.5 shrink-0 text-neutral-500" />
          ) : (
            <VolumeX className="size-3.5 shrink-0 text-neutral-600" />
          )}
          <a
            href={job.video.url}
            download={`video-${job.video.id}.mp4`}
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white transition-colors hover:bg-x-blue"
            title="Скачать"
            aria-label="Скачать"
          >
            <Download className="size-3.5" />
          </a>
        </div>
      </div>
    )
  }

  if (job.status === "error") {
    return (
      <div className="flex flex-col rounded-lg border border-red-500/30 bg-red-500/[0.04] p-4">
        <p className="text-sm font-medium text-red-400">Не удалось сгенерировать</p>
        <p className="mt-1 line-clamp-3 text-xs text-neutral-500">{job.error}</p>
        <p className="mt-2 truncate text-[11px] text-neutral-600" title={job.prompt}>
          {job.modelName} · {job.prompt}
        </p>
      </div>
    )
  }

  // processing
  const elapsed = Math.floor((Date.now() - job.startedAt) / 1000)
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-lg border border-white/[0.12] bg-white/[0.03]"
      style={aspectStyle}
    >
      <div className="flex flex-col items-center gap-2 px-4 text-center">
        <Loader2 className="size-6 animate-spin text-x-blue" />
        <p className="text-sm font-medium text-neutral-300">Генерация видео…</p>
        <p className="text-[11px] text-neutral-500">
          {job.modelName} · {elapsed}с
        </p>
        <p className="max-w-[220px] truncate text-[11px] text-neutral-600" title={job.prompt}>
          {job.prompt}
        </p>
      </div>
    </div>
  )
}
