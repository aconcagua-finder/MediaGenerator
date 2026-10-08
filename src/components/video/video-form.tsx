"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Video, Loader2, DollarSign, Volume2, VolumeX, ImagePlus, Download, Scissors, Wand2, Clapperboard, Mic2 } from "lucide-react"
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
import { SourceUpload, type ReadySource } from "./source-upload"
import { VoiceChangeButton } from "./voice-change-button"
import { VoicePresetPicker } from "./voice-preset-picker"
import { useImageAttachments } from "@/hooks/use-image-attachments"
import { AttachmentTray } from "@/components/shared/attachment-tray"
import {
  getVideoModel,
  defaultVideoParams,
  estimateVideoCost,
  estimateV2VCost,
  videoPricePerSecond,
  modelsForMode,
  isV2VModel,
  DEFAULT_VIDEO_MODEL,
  RUSSIAN_SPEECH_INFO,
} from "@/lib/providers/video-models"
import { closestAspectRatio, MAX_SOURCE_SECONDS } from "@/lib/video/source-limits"
import {
  AUTO_VOICE_ENGINE,
  estimateVoiceChangeCost,
  getVoiceEngine,
  voicePresetTitle,
} from "@/lib/providers/voice-change-models"
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

interface VoiceOverJob {
  /** Голос ElevenLabs (имя пресета) */
  voice: string
  status: "waiting" | "processing" | "done" | "error"
  generationId?: string
  video?: VideoResult
  error?: string
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
  /** Автопереозвучка через ElevenLabs после видео → видео */
  voiceOver?: VoiceOverJob
}

interface VoiceOverStatus {
  voice: string
  generationId?: string
  error?: string
}

const voiceEngine = getVoiceEngine(AUTO_VOICE_ENGINE)!

interface VideoFormProps {
  hasOpenRouterKey: boolean
  /** Есть ли активный ключ fal.ai: без него fal-модели скрыты */
  hasFalKey?: boolean
}

type FormMode = "generate" | "v2v"

const V2V_PROMPT_PLACEHOLDER =
  "Преврати человека в седого профессора в твидовом пиджаке, сохрани движения и мимику"
const MOTION_PROMPT_PLACEHOLDER = "Необязательно: опишите сцену или стиль, например «в уютном кафе, дневной свет»"

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
  /** Motion Control: ориентация персонажа (`video` — до 30 сек, `image` — до 10 сек) */
  character_orientation: "video" | "image"
}

export function VideoForm({ hasOpenRouterKey, hasFalKey = false }: VideoFormProps) {
  // Начальное состояние одинаково на сервере и клиенте (иначе гидратация ломается);
  // сохранённые в localStorage режим и модель подставляются после монтирования.
  const [formMode, setFormMode] = useState<FormMode>("generate")
  const modeModels = useMemo(() => modelsForMode(formMode, { hasFalKey }), [formMode, hasFalKey])
  // В списке показываем и fal-модели без ключа — серыми, без возможности выбора
  const visibleModels = useMemo(() => modelsForMode(formMode, { hasFalKey: true }), [formMode])
  const lockedModelIds = useMemo(
    () => new Set(hasFalKey ? [] : visibleModels.filter((m) => m.provider === "fal").map((m) => m.id)),
    [hasFalKey, visibleModels],
  )
  const [modelId, setModelId] = useState(DEFAULT_VIDEO_MODEL)
  // Модель, выбранная раньше, может быть недоступна в этом режиме (напр. fal без ключа)
  const model =
    modeModels.find((m) => m.id === modelId) ||
    modeModels.find((m) => m.id === DEFAULT_VIDEO_MODEL) ||
    modeModels[0]
  const isV2V = formMode === "v2v" && isV2VModel(model)

  const [prompt, setPrompt] = useState("")
  const [params, setParams] = useState<VideoParams>(() => ({
    ...defaultVideoParams(model),
    character_orientation: "video",
  }))
  const [source, setSource] = useState<ReadySource | null>(null)
  // Переозвучка результата v2v через ElevenLabs (fal.ai): выключено = исходный звук
  const [voiceOverOn, setVoiceOverOn] = useState(false)
  const [voiceOverVoice, setVoiceOverVoice] = useState(voiceEngine.defaultFemale)
  const voiceOverBlocked = !hasFalKey
    ? "Переозвучка работает через fal.ai: нужен ключ fal в настройках."
    : source && !source.hasAudio
      ? "В исходном видео нет звука, переозвучивать нечего."
      : null
  const voiceOverActive = isV2V && voiceOverOn && !voiceOverBlocked

  useEffect(() => {
    setVoiceOverOn(loadSaved("video_voice_over", "") === "1")
    const savedVoice = loadSaved("video_voice_over_voice", "")
    if (voiceEngine.presets.some((p) => p.id === savedVoice)) setVoiceOverVoice(savedVoice)
  }, [])

  useEffect(() => {
    const savedMode: FormMode = loadSaved("video_form_mode", "generate") === "v2v" ? "v2v" : "generate"
    const savedModelId = loadSaved(savedMode === "v2v" ? "video_model_v2v" : "video_model", "")
    const list = modelsForMode(savedMode, { hasFalKey })
    const pick = list.find((m) => m.id === savedModelId) || (savedMode === "v2v" ? list[0] : undefined)
    if (savedMode !== "generate") setFormMode(savedMode)
    if (pick) {
      setModelId(pick.id)
      setParams((prev) => ({ ...defaultVideoParams(pick), character_orientation: prev.character_orientation }))
    }
    // только при монтировании
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const router = useRouter()

  // Готовые клипы этой сессии — для быстрой склейки
  // Для склейки берём переозвученную версию, если она готова
  const doneVideoIds = jobs
    .filter((j) => j.status === "done" && j.video)
    .map((j) => (j.voiceOver?.status === "done" && j.voiceOver.video ? j.voiceOver.video.id : j.video!.id))

  // Картинка: стартовый кадр (i2v) или персонаж (Motion Control)
  const modelTakesImage = isV2V ? Boolean(model.requiresCharacterImage) : model.modes.includes("i2v")
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

  const voiceOverCost = voiceOverActive ? estimateVoiceChangeCost(voiceEngine, source?.durationSeconds ?? 0) : 0
  const costEstimate = useMemo(
    () =>
      isV2V
        ? estimateV2VCost(model, source?.durationSeconds ?? 0)
        : estimateVideoCost(model, {
            durationSeconds: params.duration,
            resolution: params.resolution,
            audio: params.generate_audio,
          }),
    [model, isV2V, source?.durationSeconds, params.duration, params.resolution, params.generate_audio]
  ) + voiceOverCost

  const handleModelChange = useCallback(
    (newId: string) => {
      setModelId(newId)
      savePref(formMode === "v2v" ? "video_model_v2v" : "video_model", newId)
      const m = getVideoModel(newId)
      if (m) {
        setParams((prev) => ({
          ...defaultVideoParams(m),
          character_orientation: prev.character_orientation,
          // у v2v соотношение сторон по умолчанию — ориентация исходника
          ...(isV2VModel(m) && source?.width && source?.height && m.aspectRatios.length > 0
            ? { aspect_ratio: closestAspectRatio(source.width, source.height, m.aspectRatios) }
            : {}),
        }))
      }
    },
    [formMode, source?.width, source?.height]
  )

  const handleModeChange = useCallback(
    (next: FormMode) => {
      if (next === formMode) return
      setFormMode(next)
      savePref("video_form_mode", next)
      const list = modelsForMode(next, { hasFalKey })
      const saved = loadSaved(next === "v2v" ? "video_model_v2v" : "video_model", "")
      const m =
        list.find((x) => x.id === saved) ||
        list.find((x) => x.id === DEFAULT_VIDEO_MODEL) ||
        list[0]
      if (m) {
        setModelId(m.id)
        setParams((prev) => ({ ...defaultVideoParams(m), character_orientation: prev.character_orientation }))
      }
      att.clear()
    },
    [formMode, hasFalKey, att]
  )

  // Загрузили исходник — соотношение сторон по умолчанию берём по его ориентации
  const handleSourceChange = useCallback(
    (next: ReadySource | null) => {
      setSource(next)
      if (next?.width && next?.height && model.aspectRatios.length > 0) {
        setParams((prev) => ({
          ...prev,
          aspect_ratio: closestAspectRatio(next.width!, next.height!, model.aspectRatios),
        }))
      }
    },
    [model]
  )

  const setParam = useCallback(
    (key: keyof VideoParams, value: string | number | boolean) => {
      setParams((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  async function pollJob(genId: string, expectVoiceOver?: string) {
    if (pollingRef.current.has(genId)) return
    pollingRef.current.add(genId)
    const maxAttempts = 240 // ~12 минут при шаге 3с
    let doneAnnounced = false
    // Ожидание запуска переозвучки — отдельный короткий бюджет, чтобы не съесть общий
    let voWaitAttempts = 0
    const VO_WAIT_MAX = 40 // ~2 минуты

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await sleep(attempt === 0 ? 2000 : 3000)
      if (!mountedRef.current) {
        pollingRef.current.delete(genId)
        return
      }
      let data: {
        status?: string
        video?: VideoResult
        error?: string
        cost?: number
        voiceOver?: VoiceOverStatus
      } = {}
      try {
        const r = await fetch(`/api/video/${genId}/status`)
        data = await r.json()
      } catch {
        continue // транзиентная сетевая ошибка — повторим
      }

      if (data.status === "done") {
        // Заказанная переозвучка, о которой сервер ещё не отчитался (гонка опросов) — ждём
        const vo: VoiceOverStatus | undefined =
          data.voiceOver ?? (expectVoiceOver ? { voice: expectVoiceOver } : undefined)
        let voPending = Boolean(vo && !vo.generationId && !vo.error)
        if (voPending && ++voWaitAttempts > VO_WAIT_MAX) {
          voPending = false
          vo!.error = "Переозвучка не запустилась. Запустите её вручную кнопкой «Заменить голос»."
        }
        setJobs((prev) =>
          prev.map((j) => {
            if (j.id !== genId) return j
            return {
              ...j,
              status: "done",
              video: data.video,
              ...(vo
                ? {
                    voiceOver: {
                      voice: vo.voice,
                      status: vo.error ? "error" : vo.generationId ? "processing" : "waiting",
                      generationId: vo.generationId,
                      error: vo.error,
                    },
                  }
                : {}),
            }
          })
        )
        if (!doneAnnounced) {
          doneAnnounced = true
          toast.success("Видео готово!", {
            description: [
              typeof data.cost === "number" ? `Стоимость: $${data.cost.toFixed(3)}` : null,
              vo && !vo.error ? `Переозвучиваем голосом ${vo.voice}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
          })
        }
        if (voPending) continue
        pollingRef.current.delete(genId)
        if (vo?.error) {
          toast.error("Переозвучка не запустилась", { description: vo.error, duration: 8000 })
        } else if (vo?.generationId) {
          void pollVoiceOver(genId, vo.generationId)
        }
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

    // Готовое видео не превращаем в ошибку из-за таймаута
    setJobs((prev) =>
      prev.map((j) =>
        j.id === genId && j.status !== "done"
          ? { ...j, status: "error", error: "Превышено время ожидания. Попробуйте позже." }
          : j
      )
    )
    pollingRef.current.delete(genId)
  }

  /** Поллинг автопереозвучки: результат подменяет видео в карточке */
  async function pollVoiceOver(jobId: string, voiceGenId: string) {
    const patch = (vo: Partial<VoiceOverJob>) =>
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId && j.voiceOver ? { ...j, voiceOver: { ...j.voiceOver, ...vo } } : j))
      )
    for (let attempt = 0; attempt < 120; attempt++) {
      await sleep(attempt === 0 ? 2000 : 3000)
      if (!mountedRef.current) return
      let st: { status?: string; video?: VideoResult; error?: string } = {}
      try {
        st = await (await fetch(`/api/video/${voiceGenId}/status`)).json()
      } catch {
        continue
      }
      if (st.status === "done") {
        if (!st.video) {
          patch({ status: "error", error: "Видео не найдено. Проверьте библиотеку." })
          return
        }
        patch({ status: "done", video: st.video })
        toast.success("Переозвучка готова", { description: "Новое видео сохранено в библиотеке" })
        return
      }
      if (st.status === "error") {
        patch({ status: "error", error: st.error || "Неизвестная ошибка" })
        toast.error("Не удалось переозвучить", { description: st.error, duration: 8000 })
        return
      }
    }
    patch({ status: "error", error: "Превышено время ожидания. Проверьте библиотеку чуть позже." })
  }

  async function handleGenerate() {
    const promptRequired = !(isV2V && model.promptOptional)
    if (promptRequired && !prompt.trim()) {
      toast.error(isV2V ? "Опишите, что изменить в видео" : "Введите промпт")
      return
    }
    const needsFal = model.provider === "fal"
    if (needsFal ? !hasFalKey : !hasOpenRouterKey) {
      toast.error(needsFal ? "Не настроен ключ fal.ai" : "Не настроен ключ OpenRouter", {
        description: needsFal
          ? "Администратор добавляет ключ fal.ai в Настройках."
          : "Добавьте API ключ OpenRouter в Настройках.",
      })
      return
    }
    if (att.hasUploading) {
      toast.info("Подождите загрузку картинки")
      return
    }
    const uploadId = att.readyIds[0]
    if (isV2V) {
      if (!source) {
        toast.error("Загрузите исходное видео")
        return
      }
      if (model.requiresCharacterImage && !uploadId) {
        toast.error("Загрузите картинку персонажа", {
          description: "Движения из видео перенесутся на этого персонажа.",
        })
        return
      }
    } else if (uploadId && !modelTakesImage) {
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
          model: model.id,
          prompt: prompt.trim(),
          params,
          ...(isV2V
            ? {
                sourceId: source!.id,
                ...(model.requiresCharacterImage ? { characterUploadId: uploadId } : {}),
                ...(voiceOverActive ? { voiceOver: { voice: voiceOverVoice } } : {}),
              }
            : uploadId
              ? { uploadId }
              : {}),
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        const errMsg = errData.error || `Ошибка сервера (${response.status})`
        if (response.status === 429) {
          toast.error("Лимит исчерпан", { description: errMsg, duration: 8000 })
        } else if (response.status === 400 || response.status === 404 || response.status === 410) {
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
        prompt: prompt.trim() || model.name,
        modelName: model.name,
        aspect: isV2V && source?.width && source?.height ? `${source.width}:${source.height}` : params.aspect_ratio || "16:9",
        startedAt: Date.now(),
        ...(voiceOverActive ? { voiceOver: { voice: voiceOverVoice, status: "waiting" as const } } : {}),
      }
      setJobs((prev) => [job, ...prev])
      att.clear()
      toast.success("Запущено", {
        description: isV2V
          ? "Обработка видео обычно занимает 1–3 минуты"
          : "Генерация видео обычно занимает 30 сек – 2 минуты",
      })
      void pollJob(data.videoGenerationId, voiceOverActive ? voiceOverVoice : undefined)
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
          {/* Режим: обычная генерация или «видео → видео» */}
          <div className="mb-4 inline-flex rounded-full border border-white/[0.12] bg-white/[0.02] p-0.5" role="tablist" aria-label="Режим">
            {([
              { id: "generate", label: "Текст / картинка → видео", Icon: Clapperboard },
              { id: "v2v", label: "Видео → видео", Icon: Wand2 },
            ] as const).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={formMode === id}
                onClick={() => handleModeChange(id)}
                disabled={isSubmitting}
                className={`flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors ${
                  formMode === id ? "bg-x-blue text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Исходное видео — только в режиме «видео → видео» */}
          {isV2V && (
            <div className="mb-4 space-y-2">
              <Label className="block text-sm font-medium text-neutral-400">Исходное видео</Label>
              <SourceUpload
                kind="video"
                value={source}
                onChange={handleSourceChange}
                maxSeconds={model.maxSourceSeconds ?? MAX_SOURCE_SECONDS}
                disabled={isSubmitting}
                hint={
                  model.requiresCharacterImage
                    ? "Видео с движением, которое нужно повторить: человек виден целиком или по пояс, без перекрытий."
                    : "Результат будет той же длины, что и исходное видео; звук исходника сохранится."
                }
              />
            </div>
          )}

          <PromptInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleGenerate}
            disabled={isSubmitting}
            label={isV2V ? (model.promptOptional ? "Что изменить (необязательно)" : "Что изменить в видео") : "Промпт"}
            placeholder={isV2V ? (model.requiresCharacterImage ? MOTION_PROMPT_PLACEHOLDER : V2V_PROMPT_PLACEHOLDER) : "Опишите видео, которое хотите сгенерировать..."}
          />
          {isV2V && !model.requiresCharacterImage && (
            <p className="mt-1.5 text-[11px] leading-snug text-neutral-600">
              Описывайте образ нейтрально: откровенные формулировки про фигуру и одежду модерация Runway отклоняет
              (за отклонённую задачу деньги не списываются).
            </p>
          )}

          {/* Картинка: стартовый кадр (image-to-video) или персонаж (Motion Control) */}
          {(modelTakesImage || att.attachments.length > 0) && (
            <div className="mt-3">
              {isV2V && (
                <Label className="mb-1.5 block text-sm font-medium text-neutral-400">Персонаж (картинка)</Label>
              )}
              <AttachmentTray
                attachments={att.attachments}
                onRemove={att.remove}
                onPick={(files) => att.addFiles(files, "picker")}
                disabled={!modelTakesImage}
                hint={
                  att.attachments.length === 0 && modelTakesImage
                    ? isV2V
                      ? "Прикрепите фото персонажа (paste/перетащить/«+») — на него перенесутся движения из видео. Персонаж виден целиком или по пояс, без перекрытий."
                      : "Прикрепите кадр (paste/перетащить/«+») — видео начнётся с него (image-to-video)."
                    : undefined
                }
              />
              {att.attachments.length > 0 && (
                <p className="mt-1.5 text-[11px] text-x-blue/80">
                  {isV2V ? "Персонаж прикреплён." : "Кадр прикреплён — запустится image-to-video."}
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center justify-end">
            <button
              onClick={handleGenerate}
              disabled={
                isSubmitting ||
                (!(isV2V && model.promptOptional) && !prompt.trim()) ||
                (isV2V && !source) ||
                (model.provider === "fal" ? !hasFalKey : !hasOpenRouterKey)
              }
              className="flex h-10 items-center gap-2 rounded-full bg-x-blue px-5 text-sm font-bold text-white transition-colors hover:bg-x-blue-hover active:scale-[0.98] disabled:opacity-40"
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />}
              {isSubmitting ? "Отправка..." : isV2V ? "Преобразовать видео" : "Сгенерировать видео"}
            </button>
          </div>
          {model.provider !== "fal" && !hasOpenRouterKey && (
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
          <VideoModelSelector
            selectedModel={model.id}
            onModelChange={handleModelChange}
            models={visibleModels}
            disabledIds={lockedModelIds}
            disabledNote="нужен ключ fal"
          />
          {formMode === "v2v" && !hasFalKey && (
            <p className="mt-2 text-[11px] leading-snug text-neutral-500">
              Kling Motion Control (ваше видео + фото персонажа) пока недоступен: нужен ключ fal.ai в настройках.
            </p>
          )}
          {/* Индикатор русской озвучки выбранной модели */}
          {isV2V ? (
            <p className="mt-3 text-[11px] leading-snug text-neutral-500">
              {voiceOverActive
                ? `Звук результата переозвучится голосом ${voiceOverVoice} (ElevenLabs). Длина результата равна длине исходного видео.`
                : "Звук исходного видео сохраняется в результате. Длина результата равна длине исходного видео."}
            </p>
          ) : (
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug">
            <span
              className={`mt-1 size-1.5 shrink-0 rounded-full ${
                model.supportsAudio || model.builtInAudio ? RUSSIAN_SPEECH_INFO[model.russianSpeech].dot : "bg-neutral-600"
              }`}
            />
            <span className={model.supportsAudio || model.builtInAudio ? RUSSIAN_SPEECH_INFO[model.russianSpeech].text : "text-neutral-500"}>
              {model.supportsAudio
                ? RUSSIAN_SPEECH_INFO[model.russianSpeech].label
                : model.builtInAudio
                  ? `Звук встроен и не отключается · ${RUSSIAN_SPEECH_INFO[model.russianSpeech].label}`
                  : "Без звука — озвучку добавляйте отдельно"}
              {(model.supportsAudio || model.builtInAudio) && model.russianSpeech !== "good" && (
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
          )}
        </div>

        <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Параметры</h3>
          <div className="grid items-end gap-4 sm:grid-cols-2">
            {/* Длительность и разрешение у v2v не задаются: длина = исходнику */}
            {!isV2V && (
              <ParamSelect
                label="Длительность"
                value={String(params.duration)}
                options={model.durations.map((d) => ({ value: String(d), label: `${d} сек` }))}
                onChange={(v) => setParam("duration", Number(v))}
              />
            )}
            {!isV2V && (
              <ParamSelect
                label="Разрешение"
                value={params.resolution}
                options={model.resolutions.map((r) => ({ value: r, label: r }))}
                onChange={(v) => setParam("resolution", v)}
              />
            )}
            {model.aspectRatios.length > 0 && (
              <ParamSelect
                label="Соотношение"
                value={params.aspect_ratio}
                options={model.aspectRatios.map((a) => ({ value: a, label: a }))}
                onChange={(v) => setParam("aspect_ratio", v)}
              />
            )}
            {isV2V && model.requiresCharacterImage && (
              <ParamSelect
                label="Ориентация"
                value={params.character_orientation}
                options={[
                  { value: "video", label: "Как в видео" },
                  { value: "image", label: "Как на картинке" },
                ]}
                onChange={(v) => setParam("character_orientation", v === "image" ? "image" : "video")}
              />
            )}
            {isV2V && model.requiresCharacterImage && (
              <p className="text-[11px] leading-snug text-neutral-600 sm:col-span-2">
                «Как в видео» — до 30 сек, лучше для сложных движений. «Как на картинке» — до 10 сек, лучше повторяет движения камеры.
              </p>
            )}
            {isV2V && (
              <div className="space-y-2 sm:col-span-2">
                <Label className="block text-sm font-medium leading-tight text-neutral-400">Звук</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { on: false, label: "Исходный" },
                    { on: true, label: "Переозвучить" },
                  ] as const).map((o) => {
                    const selected = o.on ? voiceOverActive : !voiceOverActive
                    return (
                      <button
                        key={o.label}
                        type="button"
                        disabled={isSubmitting || (o.on && Boolean(voiceOverBlocked))}
                        onClick={() => {
                          setVoiceOverOn(o.on)
                          savePref("video_voice_over", o.on ? "1" : "")
                        }}
                        className={`flex h-9 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                          selected
                            ? "border-x-blue/40 bg-x-blue/[0.12] text-x-blue"
                            : "border-white/[0.12] bg-white/[0.02] text-neutral-400 hover:text-white"
                        }`}
                      >
                        {o.on ? <Mic2 className="size-4" /> : <Volume2 className="size-4" />}
                        {o.label}
                      </button>
                    )
                  })}
                </div>
                {voiceOverBlocked ? (
                  <p className="text-[11px] leading-snug text-neutral-500">{voiceOverBlocked}</p>
                ) : voiceOverActive ? (
                  <>
                    <VoicePresetPicker
                      engine={voiceEngine}
                      value={voiceOverVoice}
                      onChange={(v) => {
                        setVoiceOverVoice(v)
                        savePref("video_voice_over_voice", v)
                      }}
                      disabled={isSubmitting}
                    />
                    <p className="text-[11px] leading-snug text-neutral-600">
                      После готовности речь из ролика заменится голосом ElevenLabs с той же интонацией
                      (${voiceEngine.pricePerMinute.toFixed(2)}/мин). В библиотеке останутся обе версии.
                    </p>
                  </>
                ) : null}
              </div>
            )}
            {!isV2V && model.supportsAudio && (
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
          {isV2V ? (
            <>
              Цена зависит от длины исходного видео (≈${videoPricePerSecond(model, "source").toFixed(3)}/сек
              {source ? ` × ${source.durationSeconds.toFixed(1)} сек` : ""}
              {model.price.minPerGeneration ? `, минимум $${model.price.minPerGeneration.toFixed(2)}` : ""}
              ){voiceOverActive ? ` + переозвучка ~$${voiceOverCost.toFixed(3)}` : ""}. Точная сумма спишется по факту после обработки; за отклонённую или упавшую задачу деньги не берутся.
            </>
          ) : (
            <>
              Точная сумма спишется по факту от OpenRouter после генерации (≈${videoPricePerSecond(model, params.resolution, params.generate_audio).toFixed(3)}/сек при {params.resolution} × {params.duration} сек).
            </>
          )}
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
    const vo = job.voiceOver
    // Готовая переозвучка подменяет видео в карточке; оригинал остаётся ссылкой
    const shown = vo?.status === "done" && vo.video ? vo.video : job.video
    return (
      <div className="overflow-hidden rounded-lg border border-white/[0.12] bg-white/[0.02]">
        <video
          key={shown.id}
          src={shown.url}
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
          {shown.durationSeconds != null && (
            <span className="shrink-0 text-[11px] text-neutral-500">{shown.durationSeconds}с</span>
          )}
          {shown.hasAudio ? (
            <Volume2 className="size-3.5 shrink-0 text-neutral-500" />
          ) : (
            <VolumeX className="size-3.5 shrink-0 text-neutral-600" />
          )}
          <a
            href={shown.url}
            download={`video-${shown.id}.mp4`}
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white transition-colors hover:bg-x-blue"
            title="Скачать"
            aria-label="Скачать"
          >
            <Download className="size-3.5" />
          </a>
        </div>
        {vo && (
          <div className="flex items-center gap-1.5 border-t border-white/[0.08] px-3 py-2 text-[11px]">
            {vo.status === "done" ? (
              <>
                <Mic2 className="size-3.5 shrink-0 text-x-blue" />
                <span className="min-w-0 flex-1 truncate text-neutral-400">
                  Переозвучено: {voicePresetTitle(voiceEngine.presets.find((p) => p.id === vo.voice) ?? voiceEngine.presets[0])}
                </span>
                <a
                  href={job.video.url}
                  download={`video-${job.video.id}.mp4`}
                  className="shrink-0 text-x-blue hover:underline"
                >
                  Оригинал со звуком
                </a>
              </>
            ) : vo.status === "error" ? (
              <span className="text-red-400">Переозвучка не удалась: {vo.error}</span>
            ) : (
              <>
                <Loader2 className="size-3.5 shrink-0 animate-spin text-x-blue" />
                <span className="text-neutral-400">Переозвучиваем голосом {vo.voice}…</span>
              </>
            )}
          </div>
        )}
        {shown.hasAudio && (!vo || vo.status === "done" || vo.status === "error") && (
          <VoiceChangeButton
            videoId={shown.id}
            durationSeconds={shown.durationSeconds}
            hasAudio={shown.hasAudio}
            variant="card"
          />
        )}
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
