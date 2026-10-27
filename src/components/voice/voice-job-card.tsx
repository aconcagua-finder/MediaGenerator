"use client"

import { AlertCircle, Download, Loader2, Mic } from "lucide-react"
import {
  ACTION_CLASS,
  CardMeta,
  ClampedText,
  CopyTextButton,
  MetaChip,
  RepeatButton,
  formatElapsed,
  useNearViewport,
  useNow,
} from "@/components/history-feed/parts"
import type { VoiceHistoryAudio } from "@/lib/voice/history"
import type { VoiceJob } from "./voice-job"

/** Высота строки плеера: заглушка и <audio> одного размера — без прыжков */
const PLAYER_ROW = "h-10 w-full"

function fmtSize(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

/**
 * Ленивый плеер: <audio preload="none"> монтируется, только когда карточка рядом
 * с экраном, и качает файл лишь по «▶». Длительность и размер — из БД, без запроса.
 */
function LazyAudio({ audio }: { audio: VoiceHistoryAudio }) {
  const [ref, near] = useNearViewport<HTMLDivElement>("200px")
  return (
    <div ref={ref} className={PLAYER_ROW}>
      {near ? (
        <audio src={audio.url} controls preload="none" className={PLAYER_ROW} />
      ) : (
        <div className={`${PLAYER_ROW} rounded-full bg-white/[0.04]`} />
      )}
    </div>
  )
}

function ProcessingRow({ startedAt }: { startedAt: number }) {
  const now = useNow()
  return (
    <div className={`${PLAYER_ROW} flex items-center gap-2 rounded-full bg-white/[0.03] px-3 text-xs text-neutral-400`}>
      <Loader2 className="size-4 shrink-0 animate-spin text-x-blue" />
      Синтез речи… <span className="text-neutral-600">{formatElapsed(Math.max(0, Math.floor((now - startedAt) / 1000)))}</span>
    </div>
  )
}

/**
 * Компактная карточка озвучки: статус, провайдер, модель, время; голос и
 * настройки; текст в 3 строки с «ещё»; плеер (или причина ошибки); действия.
 */
export function VoiceJobCard({ job, onRepeat }: { job: VoiceJob; onRepeat: (job: VoiceJob) => void }) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-3 ${
        job.status === "error" ? "border-red-500/25 bg-red-500/[0.03]" : "border-white/[0.12] bg-white/[0.02]"
      }`}
    >
      <CardMeta
        status={job.status}
        chips={<MetaChip>{job.providerLabel}</MetaChip>}
        model={job.modelName}
        startedAt={job.startedAt}
      />
      <p className="flex min-w-0 items-center gap-1 text-[11px] text-neutral-400">
        <Mic className="size-3 shrink-0" />
        <span className="truncate">
          {job.voiceName}
          {job.settingsSummary ? <span className="text-neutral-600"> · {job.settingsSummary}</span> : null}
        </span>
      </p>
      <ClampedText text={job.text} lines={3} />

      {job.status === "done" && job.audio ? (
        <LazyAudio audio={job.audio} />
      ) : job.status === "processing" ? (
        <ProcessingRow startedAt={job.startedAt} />
      ) : job.status === "error" ? (
        <div className="flex items-start gap-2 text-xs text-red-300">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <ClampedText text={job.error || "Не удалось синтезировать речь"} className="text-red-300/90" />
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Аудио удалено из Библиотеки.</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <RepeatButton onClick={() => onRepeat(job)} title="Повторить: модель, голос, настройки и текст — в форму" />
        {job.audio && (
          <a
            href={job.audio.url}
            download={`voice-${job.audio.id}.${job.audio.format}`}
            className={ACTION_CLASS}
            title="Скачать"
          >
            <Download className="size-3" />
            Скачать
          </a>
        )}
        <CopyTextButton text={job.text} toastText="Текст скопирован" />
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-neutral-500">
          {job.audio?.durationSeconds != null && <span>{job.audio.durationSeconds}с</span>}
          {job.audio?.sizeBytes ? <span>{fmtSize(job.audio.sizeBytes)}</span> : null}
          {typeof job.cost === "number" && job.cost > 0 && <span>${job.cost.toFixed(4)}</span>}
        </span>
      </div>
    </div>
  )
}

export function VoiceJobCardSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.04]" />
      <div className="h-3 w-full animate-pulse rounded bg-white/[0.04]" />
      <div className={`${PLAYER_ROW} animate-pulse rounded-full bg-white/[0.04]`} />
    </div>
  )
}
