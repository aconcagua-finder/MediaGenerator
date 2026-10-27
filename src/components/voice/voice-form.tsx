"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { AudioLines, Loader2, DollarSign } from "lucide-react"
import { Label } from "@/components/ui/label"
import { VoiceModelSelector } from "./voice-model-selector"
import { VoiceSelector } from "./voice-selector"
import { AudioTagChips, ElevenLabsTtsOptions } from "./elevenlabs-tts-options"
import {
  loadRawVoiceSettings,
  loadVoicePick,
  presetVoice,
  saveRawVoiceSettings,
  saveVoicePick,
  type PickedVoice,
} from "@/components/elevenlabs/voice-prefs"
import {
  VOICE_MODELS,
  getVoiceModel,
  resolveVoice,
  estimateVoiceCost,
  normalizeTtsSettings,
  DEFAULT_VOICE_MODEL,
  DEFAULT_ELEVENLABS_VOICE_MODEL,
  DEFAULT_TTS_SETTINGS,
  RUSSIAN_SPEECH_INFO,
  type TtsVoiceSettings,
  type VoiceModel,
} from "@/lib/providers/voice-models"
import { getVoiceEngine, isElevenLabsVoiceId, sanitizeVoiceName } from "@/lib/providers/voice-change-models"
import { mergeJobsById } from "@/lib/history/merge"
import type { VoiceHistoryItem } from "@/lib/voice/history"
import { HistoryFeedSection, feedCount } from "@/components/history-feed/history-feed-section"
import { useHistoryFeed } from "@/components/history-feed/use-history-feed"
import { VoiceJobCard, VoiceJobCardSkeleton } from "./voice-job-card"
import { voiceJobFromHistory, type VoiceJob } from "./voice-job"
import { toast } from "sonner"

const HISTORY_PAGE = 8

interface VoiceFormProps {
  hasOpenRouterKey: boolean
  /** Есть ли активный ключ ElevenLabs (свой или админа): без него модели ElevenLabs серые */
  hasElevenLabsKey?: boolean
}

function loadSaved(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  return localStorage.getItem(`mg_${key}`) || fallback
}
function savePref(key: string, value: string) {
  if (typeof window !== "undefined") localStorage.setItem(`mg_${key}`, value)
}

let tmpCounter = 0

export function VoiceForm({ hasOpenRouterKey, hasElevenLabsKey = false }: VoiceFormProps) {
  const hasKeyFor = useCallback(
    (m: VoiceModel) => (m.provider === "elevenlabs" ? hasElevenLabsKey : hasOpenRouterKey),
    [hasElevenLabsKey, hasOpenRouterKey],
  )
  // Начальное состояние одинаково на сервере и клиенте (иначе гидратация ломается);
  // сохранённые в localStorage модель и голос подставляются после монтирования.
  // С ключом ElevenLabs по умолчанию — лучший русский.
  const [modelId, setModelId] = useState(hasElevenLabsKey ? DEFAULT_ELEVENLABS_VOICE_MODEL : DEFAULT_VOICE_MODEL)
  const model = getVoiceModel(modelId) || VOICE_MODELS[0]
  const keyMissing = !hasKeyFor(model)
  const lockedModelIds = useMemo(
    () => new Set(VOICE_MODELS.filter((m) => !hasKeyFor(m)).map((m) => m.id)),
    [hasKeyFor],
  )

  // ElevenLabs: голос из каталога и тонкие настройки (запоминаются отдельно от замены голоса)
  const [elVoice, setElVoice] = useState<PickedVoice>(() => presetVoice(getVoiceEngine("elevenlabs")!.defaultFemale))
  const [elSettings, setElSettings] = useState<Required<TtsVoiceSettings>>(DEFAULT_TTS_SETTINGS)
  useEffect(() => {
    const saved = loadSaved("voice_model", "")
    const m = saved ? getVoiceModel(saved) : undefined
    if (m && m.available && (m.provider !== "elevenlabs" || hasElevenLabsKey)) {
      setModelId(m.id)
      setVoice(resolveVoice(m, loadSaved(`voice_${m.id}`, "")))
    } else {
      setVoice(resolveVoice(model, loadSaved(`voice_${model.id}`, "")))
    }
    setElVoice(loadVoicePick("voice_tts"))
    setElSettings(normalizeTtsSettings(loadRawVoiceSettings("voice_tts")))
    // только при монтировании
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const textRef = useRef<HTMLTextAreaElement | null>(null)

  const [voice, setVoice] = useState(() => model.defaultVoice)
  const [speed, setSpeed] = useState(1)
  const [text, setText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [jobs, setJobs] = useState<VoiceJob[]>([])
  const submittingRef = useRef(false)

  // «Мои озвучки»: история из БД страницами, сливается со свежими результатами вкладки
  const historyFeed = useHistoryFeed<VoiceHistoryItem>({
    url: "/api/voice/history",
    pageSize: HISTORY_PAGE,
    onPage: (items) => {
      const incoming = items.map(voiceJobFromHistory)
      setJobs((prev) => mergeJobsById(prev, incoming))
      const unfinished = incoming.filter((j) => j.status === "processing").map((j) => j.id)
      if (unfinished.length) void watchUnfinished(unfinished)
    },
  })

  /**
   * Синтез синхронный, но после перезагрузки вкладки запрос уже не наш —
   * досматриваем такие записи точечными запросами истории, пока не завершатся.
   */
  async function watchUnfinished(ids: string[]) {
    let pending = ids
    for (let attempt = 0; attempt < 45 && pending.length > 0; attempt++) {
      await new Promise((r) => setTimeout(r, 4000))
      try {
        const res = await fetch(`/api/voice/history?ids=${pending.join(",")}&limit=${pending.length}`)
        if (!res.ok) continue
        const data = (await res.json()) as { items?: VoiceHistoryItem[] }
        const fresh = new Map((data.items ?? []).map((i) => [i.id, voiceJobFromHistory(i)]))
        setJobs((prev) => prev.map((j) => fresh.get(j.id) ?? j))
        pending = pending.filter((id) => fresh.get(id)?.status === "processing")
      } catch {
        // сетевой сбой — попробуем на следующем шаге
      }
    }
  }

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

  /** Вставка аудиотега в позицию курсора (или в конец) */
  function insertTag(tag: string) {
    const el = textRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const before = text.slice(0, start)
    const insert = `${before && !/\s$/.test(before) ? " " : ""}${tag} `
    const next = before + insert + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const pos = before.length + insert.length
      el.setSelectionRange(pos, pos)
    })
  }

  /** «Повторить»: модель, голос, настройки и текст записи — в форму */
  function handleRepeat(job: VoiceJob) {
    setText(job.text)
    window.scrollTo({ top: 0, behavior: "smooth" })
    const m = getVoiceModel(job.modelId)
    if (!m || !m.available) {
      toast.info("Текст подставлен", { description: `Модель «${job.modelName}» сейчас недоступна — выберите другую.` })
      return
    }
    if (!hasKeyFor(m)) {
      toast.info("Текст подставлен", {
        description: `Для «${m.name}» нужен ключ ${m.provider === "elevenlabs" ? "ElevenLabs" : "OpenRouter"}.`,
      })
      return
    }
    setModelId(m.id)
    savePref("voice_model", m.id)
    if (m.dynamicVoices) {
      if (isElevenLabsVoiceId(job.voice)) {
        const picked = { id: job.voice, name: sanitizeVoiceName(job.voiceName) || job.voice }
        setElVoice(picked)
        saveVoicePick(picked, "voice_tts")
      }
      if (job.settings) {
        const next = normalizeTtsSettings({ ...elSettings, ...job.settings })
        setElSettings(next)
        saveRawVoiceSettings("voice_tts", next)
      }
    } else {
      setVoice(resolveVoice(m, job.voice))
      setSpeed(m.supportsSpeed && typeof job.speed === "number" ? job.speed : 1)
    }
    toast.success("Форма заполнена")
  }

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
    if (keyMissing) {
      toast.error(model.provider === "elevenlabs" ? "Нужен ключ ElevenLabs" : "Не настроен ключ OpenRouter", {
        description:
          model.provider === "elevenlabs"
            ? "Администратор добавляет ключ ElevenLabs в Настройках."
            : "Добавьте API ключ OpenRouter в Настройках.",
      })
      return
    }
    if (!model.available) {
      toast.error(`Модель «${model.name}» сейчас недоступна`)
      return
    }

    const voiceLabel = model.dynamicVoices ? elVoice.name : model.voices.find((v) => v.id === voice)?.label || voice
    const tmpId = `tmp-${++tmpCounter}`
    const pending: VoiceJob = {
      id: tmpId,
      status: "processing",
      text: trimmed,
      modelId: model.id,
      modelName: model.name,
      providerLabel: model.provider === "elevenlabs" ? "ElevenLabs" : "OpenRouter",
      voice: model.dynamicVoices ? elVoice.id : voice,
      voiceName: voiceLabel,
      ...(model.dynamicVoices ? { settings: elSettings } : model.supportsSpeed ? { speed } : {}),
      startedAt: Date.now(),
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
          ...(model.dynamicVoices
            ? { voice: elVoice.id, voiceName: elVoice.name, settings: elSettings }
            : { voice, ...(model.supportsSpeed ? { speed } : {}) }),
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

      const realId: string = data.voiceGenerationId || tmpId
      setJobs((prev) =>
        prev
          // Пока шёл синтез, страница истории могла принести эту же запись «в работе»
          .filter((j) => j.id !== realId || j.id === tmpId)
          .map((j) => (j.id === tmpId ? { ...j, id: realId, status: "done", audio: data.audio, cost: data.cost } : j)),
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
    <div className="space-y-10">
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Левая колонка — текст */}
      <div className="space-y-6">
        <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
          <textarea
            ref={textRef}
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
              disabled={isSubmitting || !text.trim() || overLimit || keyMissing || !model.available}
              className="flex h-10 items-center gap-2 rounded-full bg-x-blue px-5 text-sm font-bold text-white transition-colors hover:bg-x-blue-hover active:scale-[0.98] disabled:opacity-40"
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <AudioLines className="size-4" />}
              {isSubmitting ? "Озвучиваю…" : "Озвучить"}
            </button>
          </div>
          {model.elevenlabs?.supportsAudioTags && <AudioTagChips onInsert={insertTag} disabled={isSubmitting} />}
          {keyMissing && (
            <p className="mt-3 text-sm text-red-400">
              {model.provider === "elevenlabs"
                ? "Нужен ключ ElevenLabs. Администратор добавляет его в Настройках."
                : "Не настроен ключ OpenRouter. Перейдите в Настройки."}
            </p>
          )}
        </div>

      </div>

      {/* Правая колонка — модель, голос, параметры */}
      <div className="space-y-6">
        <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Модель</h3>
          <VoiceModelSelector
            selectedModel={modelId}
            onModelChange={handleModelChange}
            lockedIds={lockedModelIds}
          />
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug">
            <span className={`mt-1 size-1.5 shrink-0 rounded-full ${ru.dot}`} />
            <span className={ru.text}>{ru.label}</span>
          </p>
          {model.note && <p className="mt-1.5 text-[11px] leading-snug text-neutral-600">{model.note}</p>}
        </div>

        <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-bold text-white">Голос</h3>
          {model.dynamicVoices ? (
            <ElevenLabsTtsOptions
              model={model}
              voice={elVoice}
              onVoiceChange={(v) => {
                setElVoice(v)
                saveVoicePick(v, "voice_tts")
              }}
              settings={elSettings}
              onSettingsChange={(s) => {
                setElSettings(s)
                saveRawVoiceSettings("voice_tts", s)
              }}
              disabled={isSubmitting}
            />
          ) : (
            <VoiceSelector model={model} value={voice} onChange={handleVoiceChange} />
          )}

          {model.supportsSpeed && !model.dynamicVoices && (
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
          Оценка по числу символов (≈${model.pricePer1kChars.toFixed(3)}/1к).{" "}
          {model.provider === "elevenlabs"
            ? `Списывается с кредитов ElevenLabs за каждый символ${model.elevenlabs?.supportsAudioTags ? ", аудиотеги тоже считаются" : ""}.`
            : "Точная сумма — по факту от OpenRouter."}
        </p>
      </div>
    </div>

      <HistoryFeedSection
        title="Мои озвучки"
        count={feedCount(historyFeed.state, jobs)}
        state={historyFeed.state}
        onLoadMore={historyFeed.loadMore}
        libraryHref="/library?tab=audios"
        libraryLabel="Все аудио в Библиотеке →"
        emptyText="Здесь появятся ваши озвучки: и готовые, и те, что не удались."
        hasItems={jobs.length > 0}
        skeleton={<VoiceJobCardSkeleton />}
      >
        {jobs.map((job) => (
          <VoiceJobCard key={job.id} job={job} onRepeat={handleRepeat} />
        ))}
      </HistoryFeedSection>
    </div>
  )
}
