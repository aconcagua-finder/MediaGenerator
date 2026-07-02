"use client"

import { useEffect, useState } from "react"
import { Loader2, Download, FolderOpen, X, Volume2, VolumeX } from "lucide-react"
import type { Orientation } from "./types"

export interface RenderJob {
  id: string
  status: "processing" | "done" | "error"
  progress: number
  startedAt: number
  video?: {
    id: string
    url: string
    durationSeconds: number | null
    width: number | null
    height: number | null
    hasAudio: boolean
  } | null
  error?: string
}

interface Props {
  job: RenderJob
  orientation: Orientation
  onOpenLibrary: () => void
  onDismiss: () => void
}

export function RenderJobCard({ job, orientation, onOpenLibrary, onDismiss }: Props) {
  // Счётчик секунд — самообновляемый (Date.now только в колбэке интервала, не в render)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (job.status !== "processing") return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - job.startedAt) / 1000)), 1000)
    return () => clearInterval(t)
  }, [job.status, job.startedAt])

  const fallbackAspect = orientation === "portrait" ? "9 / 16" : "16 / 9"
  const aspect =
    job.video?.width && job.video?.height ? `${job.video.width} / ${job.video.height}` : fallbackAspect

  if (job.status === "done" && job.video) {
    return (
      <div className="overflow-hidden rounded-lg border border-emerald-500/30 bg-emerald-500/[0.03]">
        <video
          src={job.video.url}
          controls
          preload="metadata"
          playsInline
          className="mx-auto max-h-[60vh] bg-black"
          style={{ aspectRatio: aspect }}
        />
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-sm font-medium text-emerald-300">Готово — сохранено в библиотеку</span>
          {job.video.durationSeconds != null && (
            <span className="text-[11px] text-neutral-500">{job.video.durationSeconds}с</span>
          )}
          {job.video.hasAudio ? (
            <Volume2 className="size-3.5 text-neutral-500" />
          ) : (
            <VolumeX className="size-3.5 text-neutral-600" />
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={onOpenLibrary}
              className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.12] px-3 text-xs font-medium text-neutral-300 transition-colors hover:text-white"
            >
              <FolderOpen className="size-3.5" />
              В библиотеку
            </button>
            <a
              href={job.video.url}
              download={`compose-${job.video.id}.mp4`}
              className="flex size-8 items-center justify-center rounded-full bg-white/[0.06] text-white transition-colors hover:bg-x-blue"
              title="Скачать"
              aria-label="Скачать"
            >
              <Download className="size-3.5" />
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (job.status === "error") {
    return (
      <div className="relative rounded-lg border border-red-500/30 bg-red-500/[0.04] p-4">
        <button
          onClick={onDismiss}
          className="absolute right-2 top-2 text-neutral-500 hover:text-white"
          aria-label="Закрыть"
        >
          <X className="size-4" />
        </button>
        <p className="text-sm font-medium text-red-400">Не удалось склеить</p>
        <p className="mt-1 text-xs text-neutral-500">{job.error}</p>
      </div>
    )
  }

  // processing
  return (
    <div className="rounded-lg border border-white/[0.12] bg-white/[0.03] p-5">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-x-blue" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-200">Склейка видео…</p>
          <p className="text-[11px] text-neutral-500">
            {elapsed}с{job.progress > 0 ? ` · ${job.progress}%` : ""}
          </p>
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-x-blue transition-all duration-500"
          style={{ width: `${Math.max(3, job.progress)}%` }}
        />
      </div>
    </div>
  )
}
