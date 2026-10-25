"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Mic2, Download } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SourceUpload, type ReadySource } from "./source-upload"
import { VoicePresetPicker } from "./voice-preset-picker"
import { ElevenLabsVoicePicker } from "./elevenlabs-voice-picker"
import {
  loadVoicePick,
  loadVoiceSettings,
  presetVoice,
  saveVoicePick,
  saveVoiceSettings,
  type PickedVoice,
} from "@/components/elevenlabs/voice-prefs"
import {
  DEFAULT_VOICE_ENGINE,
  DEFAULT_VOICE_SETTINGS,
  VOICE_CHANGE_ENGINES,
  estimateVoiceChangeCost,
  getVoiceEngine,
  voiceEngineNoKeyMessage,
  voicePriceLabel,
  type VoiceChangeEngineId,
  type VoiceSettings,
} from "@/lib/providers/voice-change-models"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface VoiceChangeButtonProps {
  /** id видео в библиотеке (`videos.id`) */
  videoId: string
  /** Длительность видео — для оценки стоимости */
  durationSeconds?: number | null
  hasAudio?: boolean
  className?: string
  /** `card` — полоса под плеером в карточке результата (рендерится только когда кнопка доступна) */
  variant?: "inline" | "card"
  children?: React.ReactNode
}

interface ResultVideo {
  id: string
  url: string
}

/**
 * Кнопка «Заменить голос» + диалог. Показывается ТОЛЬКО если есть ключ хотя бы
 * одного движка (ElevenLabs или fal.ai для Chatterbox, проверка
 * `GET /api/video/voice-change`); движок без ключа в диалоге серый.
 * Результат — новое видео в библиотеке (звук подменён, картинка прежняя).
 */
export function VoiceChangeButton({ videoId, durationSeconds, hasAudio = true, className, variant = "inline", children }: VoiceChangeButtonProps) {
  const [available, setAvailable] = useState(false)
  const [engineKeys, setEngineKeys] = useState<Partial<Record<VoiceChangeEngineId, boolean>>>({})
  const [open, setOpen] = useState(false)
  const [engineId, setEngineId] = useState<VoiceChangeEngineId>(DEFAULT_VOICE_ENGINE)
  const [voice, setVoice] = useState<string>("")
  // ElevenLabs: голос из каталога и тонкие настройки (общие с автопереозвучкой v2v)
  const [elevenVoice, setElevenVoice] = useState<PickedVoice>(() =>
    presetVoice(getVoiceEngine("elevenlabs")!.defaultFemale),
  )
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS)
  const [useSample, setUseSample] = useState(false)
  const [sample, setSample] = useState<ReadySource | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ResultVideo | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/video/voice-change")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d: { available?: boolean; engines?: Partial<Record<VoiceChangeEngineId, boolean>> }) => {
        if (cancelled) return
        const keys = d.engines ?? {}
        setAvailable(Boolean(d.available))
        setEngineKeys(keys)
        // Движок по умолчанию без ключа — сразу на первый доступный
        if (!keys[DEFAULT_VOICE_ENGINE]) {
          const first = VOICE_CHANGE_ENGINES.find((e) => keys[e.id])
          if (first) setEngineId(first.id)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Последний голос и настройки ElevenLabs — из localStorage после монтирования
  useEffect(() => {
    setElevenVoice(loadVoicePick())
    setSettings(loadVoiceSettings())
  }, [])

  const engine = getVoiceEngine(engineId)!
  const engineReady = Boolean(engineKeys[engine.id])
  const selectedVoice = engine.presets.some((p) => p.id === voice) ? voice : engine.presets[0].id
  const estimate = durationSeconds ? estimateVoiceChangeCost(engine, durationSeconds) : null

  if (!available || !hasAudio) return null

  function pickEngine(id: VoiceChangeEngineId) {
    setEngineId(id)
    setVoice("")
    const e = getVoiceEngine(id)
    if (!e?.supportsSample) {
      setUseSample(false)
      setSample(null)
    }
  }

  async function run() {
    if (!engineReady) {
      toast.error(voiceEngineNoKeyMessage(engine))
      return
    }
    if (useSample && !sample) {
      toast.error("Загрузите образец голоса или выберите готовый голос")
      return
    }
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch("/api/video/voice-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          engine: engineId,
          ...(engine.dynamicVoices
            ? { voice: elevenVoice.id, voiceName: elevenVoice.name, settings }
            : { voice: selectedVoice }),
          ...(useSample && sample ? { sampleSourceId: sample.id } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error("Не удалось запустить замену голоса", { description: data.error, duration: 8000 })
        return
      }
      const genId = data.videoGenerationId as string
      toast.success(engine.provider === "elevenlabs" ? "Голос заменён, собираем видео" : "Запущено", {
        description: "Замена голоса обычно занимает до минуты",
      })

      for (let attempt = 0; attempt < 120; attempt++) {
        await sleep(attempt === 0 ? 2000 : 3000)
        if (!mountedRef.current) return
        let st: { status?: string; video?: ResultVideo; error?: string } = {}
        try {
          st = await (await fetch(`/api/video/${genId}/status`)).json()
        } catch {
          continue
        }
        if (st.status === "done" && st.video) {
          setResult(st.video)
          toast.success("Голос заменён", { description: "Новое видео сохранено в библиотеке" })
          return
        }
        if (st.status === "error") {
          toast.error("Не удалось заменить голос", { description: st.error, duration: 8000 })
          return
        }
      }
      toast.error("Превышено время ожидания", { description: "Проверьте библиотеку чуть позже" })
    } catch (err) {
      toast.error("Сетевая ошибка", { description: err instanceof Error ? err.message : undefined })
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  const trigger = (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "flex h-8 items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.04] px-3 text-xs font-medium text-neutral-200 transition-colors hover:border-x-blue/40 hover:text-white"
        }
      >
        <Mic2 className="size-3.5" />
        {children ?? "Заменить голос"}
      </button>
  )

  return (
    <>
      {variant === "card" ? (
        <div className="border-t border-white/[0.08] px-3 py-2">{trigger}</div>
      ) : (
        trigger
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Заменить голос в видео</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-xs leading-snug text-neutral-500">
              Звук из ролика заменится другим голосом с той же речью и интонацией. Картинка не меняется.
              Результат сохранится как новое видео в библиотеке.
            </p>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-neutral-400">Движок</p>
              <div className="grid gap-2">
                {VOICE_CHANGE_ENGINES.map((e) => {
                  const hasKey = Boolean(engineKeys[e.id])
                  return (
                    <button
                      key={e.id}
                      type="button"
                      disabled={busy || !hasKey}
                      onClick={() => pickEngine(e.id)}
                      className={`rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                        engineId === e.id && hasKey
                          ? "border-x-blue/50 bg-x-blue/[0.1]"
                          : "border-white/[0.12] bg-white/[0.02] hover:border-white/[0.24]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-medium text-white">
                        {e.name}
                        <span className="shrink-0 text-[11px] font-normal text-neutral-500">
                          {hasKey ? voicePriceLabel(e) : `нужен ключ ${e.provider === "elevenlabs" ? "ElevenLabs" : "fal"}`}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">{e.description}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-neutral-400">Голос</p>
              {engine.dynamicVoices ? (
                <ElevenLabsVoicePicker
                  voice={elevenVoice}
                  onVoiceChange={(v) => {
                    setElevenVoice(v)
                    saveVoicePick(v)
                  }}
                  settings={settings}
                  onSettingsChange={(s) => {
                    setSettings(s)
                    saveVoiceSettings(s)
                  }}
                  disabled={busy}
                />
              ) : (
                !useSample && (
                  <VoicePresetPicker engine={engine} value={selectedVoice} onChange={setVoice} disabled={busy} />
                )
              )}
              {engine.supportsSample && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setUseSample((v) => !v)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    useSample
                      ? "border-x-blue/50 bg-x-blue/[0.12] text-x-blue"
                      : "border-white/[0.12] text-neutral-300 hover:text-white"
                  }`}
                >
                  {useSample ? "Вернуться к готовым голосам" : "Взять голос из своей записи"}
                </button>
              )}
              {useSample && engine.supportsSample && (
                <SourceUpload
                  kind="audio"
                  value={sample}
                  onChange={setSample}
                  disabled={busy}
                  hint="Чистая запись одного голоса без музыки, 10-30 секунд."
                />
              )}
            </div>

            {estimate != null && (
              <p className="text-xs text-neutral-500">Примерная стоимость: ~${estimate.toFixed(3)}</p>
            )}

            {result && (
              <div className="space-y-2">
                <video src={result.url} controls playsInline className="max-h-72 w-full rounded-md bg-black" />
                <a
                  href={result.url}
                  download={`video-${result.id}.mp4`}
                  className="inline-flex items-center gap-1.5 text-xs text-x-blue hover:underline"
                >
                  <Download className="size-3.5" />
                  Скачать
                </a>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={run} disabled={busy || !engineReady}>
                {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Mic2 className="mr-1.5 size-4" />}
                {busy ? "Меняем голос…" : "Заменить голос"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
