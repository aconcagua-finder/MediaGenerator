"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { AudioLines, Loader2, DollarSign, Download } from "lucide-react"
import { Label } from "@/components/ui/label"
import { VoiceModelSelector } from "./voice-model-selector"
import { VoiceSelector } from "./voice-selector"
import {
  VOICE_MODELS,
  getVoiceModel,
  resolveVoice,
  estimateVoiceCost,
  DEFAULT_VOICE_MODEL,
  RUSSIAN_SPEECH_INFO,
} from "@/lib/providers/voice-models"
import { toast } from "sonner"

interface AudioResult {
  id: string
  url: string
  format: string
  durationSeconds: number | null
  sizeBytes: number | null
}

interface VoiceJob {
  id: string
  status: "processing" | "done" | "error"
  text: string
  modelName: string
  voiceLabel: string
  audio?: AudioResult
  error?: string
  cost?: number
}

interface VoiceFormProps {
  hasOpenRouterKey: boolean
}

function loadSaved(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  return localStorage.getItem(`mg_${key}`) || fallback
}
function savePref(key: string, value: string) {
  if (typeof window !== "undefined") localStorage.setItem(`mg_${key}`, value)
}

let tmpCounter = 0

export function VoiceForm({ hasOpenRouterKey }: VoiceFormProps) {
  const [modelId, setModelId] = useState(() => {
    const saved = loadSaved("voice_model", "")
    const m = saved ? getVoiceModel(saved) : undefined
    return m && m.available ? saved : DEFAULT_VOICE_MODEL
  })
  const model = getVoiceModel(modelId) || VOICE_MODELS[0]

  const [voice, setVoice] = useState(() => {
    const saved = loadSaved(`voice_${modelId}`, "")
    return resolveVoice(model, saved)
  })
  const [speed, setSpeed] = useState(1)
  const [text, setText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [jobs, setJobs] = useState<VoiceJob[]>([])
  const submittingRef = useRef(false)

  const costEstimate = useMemo(() => estimateVoiceCost(model, text.length), [model, text.length])
  const overLimit = text.length > model.maxChars
  const ru = RUSSIAN_SPEECH_INFO[model.russianSpeech]

  const handleModelChange = useCallback((newId: string) => {
    const m = getVoiceModel(newId)
    if (!m) return
    setModelId(newId)
    savePref("voice_model", newId)
    const savedVoice = loadSaved(`voice_${newId}`, "")
    setVoice(resolveVoice(m, savedVoice))
    if (!m.supportsSpeed) setSpeed(1)
  }, [])

  const handleVoiceChange = useCallback(
    (v: string) => {
      setVoice(v)
      savePref(`voice_${modelId}`, v)
    },
    [modelId],
  )

  async function handleGenerate() {
    if (submittingRef.current) return
    const trimmed = text.trim()
    if (!trimmed) {
      toast.error("Введите текст для озвучки")
      return
    }
    if (overLimit) {
      toast.error(`Слишком длинный текст: ${text.length}/${model.maxChars} символов`)
      return
    }
    if (!hasOpenRouterKey) {
      toast.error("Не настроен ключ OpenRouter", {
        description: "Добавьте API ключ OpenRouter в Настройках.",
      })
      return
    }
    if (!model.available) {
      toast.error(`Модель «${model.name}» сейчас недоступна`)
      return
    }

    const voiceLabel = model.voices.find((v) => v.id === voice)?.label || voice
    const tmpId = `tmp-${++tmpCounter}`
    const pending: VoiceJob = {
      id: tmpId,
      status: "processing",
      text: trimmed,
      modelName: model.name,
      voiceLabel,
    }
    setJobs((prev) => [pending, ...prev])
    setIsSubmitting(true)
    submittingRef.current = true

    try {
      const response = await fetch("/api/voice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          text: trimmed,
          voice,
          ...(model.supportsSpeed ? { speed } : {}),
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const errMsg = data.error || `Ошибка сервера (${response.status})`
        setJobs((prev) => prev.map((j) => (j.id === tmpId ? { ...j, status: "error", error: errMsg } : j)))
        if (response.status === 429) {
          toast.error("Лимит исчерпан", { description: errMsg, duration: 8000 })
        } else {
          toast.error("Не удалось озвучить", { description: errMsg, duration: 6000 })
        }
        return
      }

      setJobs((prev) =>
        prev.map((j) =>
          j.id === tmpId
            ? { ...j, id: data.voiceGenerationId || tmpId, status: "done", audio: data.audio, cost: data.cost }
            : j,
        ),
      )
      toast.success("Озвучка готова!", {
        description: typeof data.cost === "number" ? `Стоимость: $${data.cost.toFixed(4)}` : undefined,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Не удалось подключиться к серверу"
      setJobs((prev) => prev.map((j) => (j.id === tmpId ? { ...j, status: "error", error: msg } : j)))
      toast.error("Сетевая ошибка", { description: msg })
    } finally {
      setIsSubmitting(false)
      submittingRef.current = false
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Левая колонка — текст и результаты */}
      <div className="space-y-6">
        <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Введите текст, который нужно озвучить…"
            rows={6}
            className="w-full resize-y rounded-md border border-white/[0.12] bg-white/[0.02] p-3 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-x-blue/50"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className={`text-[11px] ${overLimit ? "text-red-400" : "text-neutral-600"}`}>
              {text.length} / {model.maxChars} символов
            </span>
            <button
              onClick={handleGenerate}
              disabled={isSubmitting || !text.trim() || overLimit || !hasOpenRouterKey || !model.available}
              className="flex h-10 items-center gap-2 rounded-full bg-x-blue px-5 text-sm font-bold text-white transition-colors hover:bg-x-blue-hover active:scale-[0.98] disabled:opacity-40"
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <AudioLines className="size-4" />}
              {isSubmitting ? "Озвучиваю…" : "Озвучить"}
            </button>
          </div>
          {!hasOpenRouterKey && (
            <p className="mt-3 text-sm text-red-400">Не настроен ключ OpenRouter. Перейдите в Настройки.</p>
          )}
        </div>

        {/* Результаты */}
        {jobs.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-medium text-neutral-400">Результаты</h3>
            <div className="space-y-3">
              {jobs.map((job) => (
                <VoiceCard key={job.id} job={job} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Правая колонка — модель, голос, параметры */}
      <div className="space-y-6">
        <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Модель</h3>
          <VoiceModelSelector selectedModel={modelId} onModelChange={handleModelChange} />
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug">
            <span className={`mt-1 size-1.5 shrink-0 rounded-full ${ru.dot}`} />
            <span className={ru.text}>{ru.label}</span>
          </p>
          {model.note && <p className="mt-1.5 text-[11px] leading-snug text-neutral-600">{model.note}</p>}
        </div>

        <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Голос</h3>
          <VoiceSelector model={model} value={voice} onChange={handleVoiceChange} />

          {model.supportsSpeed && (
            <div className="mt-4 space-y-1.5">
              <Label className="flex items-center justify-between text-sm font-medium text-neutral-400">
                <span>Скорость</span>
                <span className="text-neutral-300">{speed.toFixed(2)}×</span>
              </Label>
              <input
                type="range"
                min={model.speedRange?.[0] ?? 0.5}
                max={model.speedRange?.[1] ?? 2}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-x-blue"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-white/[0.12] bg-white/[0.02] px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <DollarSign className="size-4" />
            <span>Примерная стоимость</span>
          </div>
          <span className="text-sm font-bold text-white">~${costEstimate.toFixed(4)}</span>
        </div>
        <p className="-mt-3 px-1 text-[11px] leading-snug text-neutral-600">
          Оценка по числу символов (≈${model.pricePer1kChars.toFixed(3)}/1к). Точная сумма — по факту от OpenRouter.
        </p>
      </div>
    </div>
  )
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

function VoiceCard({ job }: { job: VoiceJob }) {
  if (job.status === "done" && job.audio) {
    return (
      <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-3">
        <p className="mb-2 line-clamp-2 text-xs text-neutral-400" title={job.text}>
          {job.text}
        </p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio src={job.audio.url} controls preload="metadata" className="w-full" />
        <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-500">
          <span className="truncate">
            {job.modelName} · {job.voiceLabel}
          </span>
          <span className="ml-auto shrink-0 uppercase">{job.audio.format}</span>
          {job.audio.durationSeconds != null && <span className="shrink-0">{job.audio.durationSeconds}с</span>}
          {job.audio.sizeBytes != null && <span className="shrink-0">{fmtSize(job.audio.sizeBytes)}</span>}
          <a
            href={job.audio.url}
            download={`voice-${job.audio.id}.${job.audio.format}`}
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
      <div className="rounded-lg border border-red-500/30 bg-red-500/[0.04] p-4">
        <p className="text-sm font-medium text-red-400">Не удалось озвучить</p>
        <p className="mt-1 line-clamp-3 text-xs text-neutral-500">{job.error}</p>
        <p className="mt-2 truncate text-[11px] text-neutral-600" title={job.text}>
          {job.modelName} · {job.voiceLabel}
        </p>
      </div>
    )
  }

  // processing
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/[0.12] bg-white/[0.03] p-4">
      <Loader2 className="size-5 shrink-0 animate-spin text-x-blue" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-300">Синтез речи…</p>
        <p className="truncate text-[11px] text-neutral-600" title={job.text}>
          {job.modelName} · {job.voiceLabel}
        </p>
      </div>
    </div>
  )
}
