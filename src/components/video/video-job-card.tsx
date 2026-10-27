"use client"

import { useState } from "react"
import { AlertCircle, Download, Film, Loader2, Mic2 } from "lucide-react"
import {
  ACTION_CLASS as ACTION,
  CardMeta,
  ClampedText,
  MetaChip,
  RepeatButton,
  formatElapsed,
  useNearViewport,
  useNow,
} from "@/components/history-feed/parts"
import { voiceOverLabel } from "@/lib/video/voice-over"
import { VoiceChangeButton } from "./voice-change-button"
import { MODE_LABELS, type VideoJob, type VideoResult } from "./video-job"

/** Коробка медиа фиксированной пропорции: карточки одной высоты, без прыжков при загрузке */
export const MEDIA_BOX = "relative aspect-[4/3] w-full overflow-hidden bg-black"

/**
 * Ленивое видео: пока карточка далеко от экрана — только постер/заглушка, без
 * запросов к mp4. Рядом с экраном (200px) монтируется <video preload="none">:
 * файл качается по «▶», при наведении — подгружаются метаданные, чтобы старт
 * был быстрее. У старых видео без постера видимые карточки берут
 * `preload="metadata"` — браузер покажет первый кадр.
 */
function LazyVideo({ video }: { video: VideoResult }) {
  const [boxRef, near] = useNearViewport<HTMLDivElement>("200px")
  const [preload, setPreload] = useState<"none" | "metadata">(video.posterUrl ? "none" : "metadata")

  return (
    <div ref={boxRef} className={MEDIA_BOX} onMouseEnter={() => setPreload("metadata")}>
      {near ? (
        <video
          key={video.id}
          src={video.url}
          poster={video.posterUrl ?? undefined}
          controls
          preload={preload}
          playsInline
          className="absolute inset-0 size-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-700">
          <Film className="size-8" />
        </div>
      )}
      {video.durationSeconds != null && (
        <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
          {video.durationSeconds}с
        </span>
      )}
    </div>
  )
}

/**
 * Компактная карточка задачи: медиа фиксированной пропорции (или причина
 * ошибки), статус, режим, модель, время, промпт в 2 строки и ряд действий.
 * У переозвученного v2v главное видео — переозвучка, подпись «Переозвучка:
 * <голос> · <промпт>», оригинал — действием.
 */
export function VideoJobCard({ job, onRepeat }: { job: VideoJob; onRepeat: (job: VideoJob) => void }) {
  const vo = job.voiceOver
  const voiced = job.status === "done" && vo?.status === "done" && Boolean(vo.video)
  const shown: VideoResult | undefined = voiced ? vo!.video : job.video
  const text = voiced ? voiceOverLabel(vo!.voiceName, job.prompt) : job.prompt

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border ${
        job.status === "error" ? "border-red-500/25 bg-red-500/[0.03]" : "border-white/[0.12] bg-white/[0.02]"
      }`}
    >
      {job.status === "done" && shown ? (
        <LazyVideo video={shown} />
      ) : job.status === "processing" ? (
        <ProcessingBox job={job} />
      ) : job.status === "error" ? (
        <div className="flex items-start gap-2 px-3 pt-3 text-xs text-red-300">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <ClampedText text={job.error || "Генерация не удалась"} className="text-red-300/90" />
        </div>
      ) : (
        <p className="px-3 pt-3 text-xs text-neutral-500">Видео удалено из Библиотеки.</p>
      )}

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <CardMeta
          status={job.status}
          chips={<MetaChip>{MODE_LABELS[job.mode]}</MetaChip>}
          model={job.modelName}
          startedAt={job.startedAt}
        />

        {text && <ClampedText text={text} />}

        {vo && !voiced && job.status === "done" && (
          <p className={`flex items-center gap-1 text-[11px] ${vo.status === "error" ? "text-red-400" : "text-neutral-400"}`}>
            {vo.status === "error" ? (
              <>Переозвучка не удалась: {vo.error}</>
            ) : (
              <>
                <Loader2 className="size-3 shrink-0 animate-spin text-x-blue" />
                Переозвучиваем голосом {vo.voiceName}…
              </>
            )}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {job.mode !== "voice" && (
            <RepeatButton onClick={() => onRepeat(job)} />
          )}
          {shown && (
            <a href={shown.url} download={`video-${shown.id}.mp4`} className={ACTION} title="Скачать">
              <Download className="size-3" />
              Скачать
            </a>
          )}
          {voiced && job.video && (
            <a href={job.video.url} download={`video-${job.video.id}.mp4`} className={ACTION} title="Скачать оригинал без переозвучки">
              Оригинал
            </a>
          )}
          {shown?.hasAudio && (!vo || vo.status === "done" || vo.status === "error") && (
            <VoiceChangeButton
              videoId={shown.id}
              durationSeconds={shown.durationSeconds}
              hasAudio={shown.hasAudio}
              className={ACTION}
            >
              Сменить голос
            </VoiceChangeButton>
          )}
          {typeof job.cost === "number" && job.cost > 0 && (
            <span className="ml-auto text-[11px] text-neutral-500">${job.cost.toFixed(3)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function ProcessingBox({ job }: { job: VideoJob }) {
  const now = useNow()
  const elapsed = Math.max(0, Math.floor((now - job.startedAt) / 1000))
  return (
    <div className={`${MEDIA_BOX} flex items-center justify-center bg-white/[0.02]`}>
      <div className="flex flex-col items-center gap-2 px-4 text-center">
        <Loader2 className="size-6 animate-spin text-x-blue" />
        <p className="text-sm font-medium text-neutral-300">
          {job.mode === "voice" ? "Меняем голос…" : "Генерация видео…"}
        </p>
        <p className="text-[11px] text-neutral-500">{formatElapsed(elapsed)}</p>
      </div>
      {job.voiceOver && (
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-neutral-300">
          <Mic2 className="size-3" />
          затем переозвучка: {job.voiceOver.voiceName}
        </span>
      )}
    </div>
  )
}

/** Заглушка карточки на время загрузки страницы истории */
export function VideoJobCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
      <div className={`${MEDIA_BOX} animate-pulse bg-white/[0.04]`} />
      <div className="space-y-2 p-3">
        <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-3 w-full animate-pulse rounded bg-white/[0.04]" />
        <div className="h-6 w-24 animate-pulse rounded bg-white/[0.04]" />
      </div>
    </div>
  )
}
