"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Scissors, Plus, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import type { PickerVideo } from "@/lib/actions/videos"
import { type EditorSegment, type OutputSettings, segDuration, fmtDuration } from "./types"
import { Timeline } from "./timeline"
import { OutputPanel } from "./output-panel"
import { ClipPickerDialog } from "./clip-picker-dialog"
import { TrimDialog } from "./trim-dialog"
import { SequencePreview } from "./sequence-preview"
import { RenderJobCard, type RenderJob } from "./render-job-card"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const newUid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)

function toSegment(clip: PickerVideo): EditorSegment {
  return { uid: newUid(), clip, trimStart: null, trimEnd: null, mute: false }
}

export function VideoEditor({ initialClips }: { initialClips: PickerVideo[] }) {
  const router = useRouter()
  const [segments, setSegments] = useState<EditorSegment[]>(() => initialClips.map(toSegment))

  // Ориентация по умолчанию — по первому клипу (вертикальные клипы не уродуем)
  const [output, setOutput] = useState<OutputSettings>(() => {
    const first = initialClips[0]
    const portrait = first && first.width && first.height ? first.height > first.width : false
    return { orientation: portrait ? "portrait" : "landscape", audio: true }
  })

  const [title, setTitle] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [trimUid, setTrimUid] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [job, setJob] = useState<RenderJob | null>(null)

  const pollingRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => () => void (mountedRef.current = false), [])

  const totalDuration = useMemo(() => segments.reduce((sum, s) => sum + segDuration(s), 0), [segments])
  const trimTarget = useMemo(() => segments.find((s) => s.uid === trimUid) || null, [segments, trimUid])

  const addClips = useCallback((clips: PickerVideo[]) => {
    setSegments((prev) => [...prev, ...clips.map(toSegment)])
  }, [])
  const removeSegment = useCallback((uid: string) => {
    setSegments((prev) => prev.filter((s) => s.uid !== uid))
  }, [])
  const move = useCallback((uid: string, dir: -1 | 1) => {
    setSegments((prev) => {
      const i = prev.findIndex((s) => s.uid === uid)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }, [])
  const patchSegment = useCallback((uid: string, patch: Partial<EditorSegment>) => {
    setSegments((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s)))
  }, [])

  async function pollJob(id: string) {
    if (pollingRef.current) return
    pollingRef.current = true
    for (let attempt = 0; attempt < 400; attempt++) {
      await sleep(attempt === 0 ? 1500 : 2500)
      if (!mountedRef.current) {
        pollingRef.current = false
        return
      }
      let data: { status?: string; progress?: number; video?: RenderJob["video"]; error?: string } = {}
      try {
        const r = await fetch(`/api/video/compose/${id}/status`)
        data = await r.json()
      } catch {
        continue
      }
      if (data.status === "done") {
        setJob((j) => (j ? { ...j, status: "done", progress: 100, video: data.video } : j))
        pollingRef.current = false
        toast.success("Видео склеено!", { description: "Результат сохранён в библиотеку" })
        return
      }
      if (data.status === "error") {
        setJob((j) => (j ? { ...j, status: "error", error: data.error } : j))
        pollingRef.current = false
        toast.error("Не удалось склеить", { description: data.error, duration: 8000 })
        return
      }
      setJob((j) => (j ? { ...j, progress: data.progress ?? j.progress } : j))
    }
    setJob((j) => (j ? { ...j, status: "error", error: "Превышено время ожидания" } : j))
    pollingRef.current = false
  }

  async function handleRender() {
    if (segments.length < 1) {
      toast.error("Добавьте хотя бы один клип")
      return
    }
    if (totalDuration <= 0) {
      toast.error("Суммарная длительность равна нулю — проверьте обрезку")
      return
    }
    setJob({ id: "", status: "processing", progress: 0, startedAt: Date.now() })
    try {
      const res = await fetch("/api/video/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          output: { orientation: output.orientation, audio: output.audio },
          segments: segments.map((s) => ({
            sourceVideoId: s.clip.id,
            trimStart: s.trimStart,
            trimEnd: s.trimEnd,
            mute: s.mute,
          })),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setJob(null)
        toast.error("Не удалось запустить склейку", { description: err.error, duration: 6000 })
        return
      }
      const data = (await res.json()) as { compositionId: string }
      setJob({ id: data.compositionId, status: "processing", progress: 0, startedAt: Date.now() })
      toast.success("Склейка запущена", { description: "Обычно занимает 10–60 секунд" })
      void pollJob(data.compositionId)
    } catch (e) {
      setJob(null)
      toast.error("Сетевая ошибка", { description: e instanceof Error ? e.message : undefined })
    }
  }

  const canRender = segments.length >= 1 && totalDuration > 0 && job?.status !== "processing"

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Левая колонка — дорожка, предпросмотр, результат.
          min-w-0 + minmax(0,1fr) на гриде — иначе длинный однострочный промпт
          (truncate = nowrap) раздувает колонку вправо до бесконечности и
          выталкивает правую панель (см. CLAUDE.md, мониторинг п.5). */}
      <div className="min-w-0 space-y-6">
        <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Дорожка</h3>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.02] px-3 text-xs font-medium text-neutral-300 transition-colors hover:border-x-blue/40 hover:text-white"
            >
              <Plus className="size-3.5" />
              Добавить
            </button>
          </div>

          {segments.length === 0 ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-white/[0.15] py-12 text-neutral-500 transition-colors hover:border-x-blue/40 hover:text-neutral-300"
            >
              <Plus className="size-6" />
              <span className="text-sm">Добавьте клипы для склейки</span>
            </button>
          ) : (
            <Timeline
              segments={segments}
              onMove={move}
              onRemove={removeSegment}
              onTrim={(uid) => setTrimUid(uid)}
              onToggleMute={(uid, mute) => patchSegment(uid, { mute })}
              audioEnabled={output.audio}
            />
          )}

          {segments.length > 0 && (
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-3 text-xs text-neutral-400">
              <span>
                Итог: {segments.length} {plural(segments.length, "клип", "клипа", "клипов")}
              </span>
              <span className="font-medium text-neutral-300">{fmtDuration(totalDuration)}</span>
            </div>
          )}
        </div>

        {/* Предпросмотр последовательности (клиентский, без рендера) */}
        {segments.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="mb-2 flex items-center gap-1.5 text-xs font-medium text-neutral-400 transition-colors hover:text-white"
            >
              {showPreview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {showPreview ? "Скрыть предпросмотр" : "Предпросмотр последовательности"}
            </button>
            {showPreview && <SequencePreview segments={segments} muted={!output.audio} />}
          </div>
        )}

        {/* Кнопка склейки */}
        <div className="flex items-center justify-end">
          <button
            onClick={handleRender}
            disabled={!canRender}
            className="flex h-10 items-center gap-2 rounded-full bg-x-blue px-5 text-sm font-bold text-white transition-colors hover:bg-x-blue-hover active:scale-[0.98] disabled:opacity-40"
          >
            <Scissors className="size-4" />
            Склеить видео
          </button>
        </div>

        {/* Результат рендера */}
        {job && (
          <RenderJobCard
            job={job}
            orientation={output.orientation}
            onOpenLibrary={() => router.push("/library")}
            onDismiss={() => setJob(null)}
          />
        )}
      </div>

      {/* Правая колонка — параметры вывода */}
      <div className="space-y-6">
        <OutputPanel
          output={output}
          onChange={setOutput}
          title={title}
          onTitleChange={setTitle}
        />
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-5 py-3 text-sm text-emerald-300/90">
          Склейка бесплатна — рендер выполняется на сервере, без оплаты провайдеру.
        </div>
      </div>

      <ClipPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onAdd={(clips) => {
          addClips(clips)
          setPickerOpen(false)
        }}
      />

      {trimTarget && (
        <TrimDialog
          segment={trimTarget}
          onClose={() => setTrimUid(null)}
          onApply={(trimStart, trimEnd) => {
            patchSegment(trimTarget.uid, { trimStart, trimEnd })
            setTrimUid(null)
          }}
        />
      )}
    </div>
  )
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
