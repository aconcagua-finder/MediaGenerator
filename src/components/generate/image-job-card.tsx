"use client"

import { AlertCircle, Download, ImageIcon, Loader2, Wand2 } from "lucide-react"
import {
  CardMeta,
  ClampedText,
  CopyTextButton,
  MetaChip,
  RepeatButton,
  formatElapsed,
  useNearViewport,
  useNow,
} from "@/components/history-feed/parts"
import type { ImageHistoryImage } from "@/lib/images/history"
import type { ImageJob } from "./image-job"

/** Ячейка фиксированной пропорции: карточки ровные, без прыжков при загрузке */
const CELL = "relative aspect-square w-full overflow-hidden bg-black/40"

/**
 * Миниатюра: <img> появляется, только когда карточка рядом с экраном (200px),
 * плюс `loading="lazy"` — оффскрин-картинки не качаются. Отдельных превью у
 * картинок нет, грузится оригинал.
 */
function Thumb({
  image,
  onOpen,
  onEdit,
}: {
  image: ImageHistoryImage
  onOpen: (image: ImageHistoryImage) => void
  onEdit: (image: ImageHistoryImage) => void
}) {
  const [ref, near] = useNearViewport<HTMLDivElement>("200px")
  return (
    <div ref={ref} className={`group ${CELL}`}>
      {near ? (
        <button type="button" onClick={() => onOpen(image)} className="block size-full" aria-label="Открыть изображение">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        </button>
      ) : (
        <div className="flex size-full items-center justify-center text-neutral-700">
          <ImageIcon className="size-6" />
        </div>
      )}
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(image)}
          className="flex size-7 items-center justify-center rounded-full bg-black/75 text-white backdrop-blur-sm transition-colors hover:bg-x-blue"
          title="Править"
          aria-label="Править"
        >
          <Wand2 className="size-3.5" />
        </button>
        <a
          href={image.url}
          download={`image-${image.id}.png`}
          className="flex size-7 items-center justify-center rounded-full bg-black/75 text-white backdrop-blur-sm transition-colors hover:bg-white/[0.18]"
          title="Скачать"
          aria-label="Скачать"
        >
          <Download className="size-3.5" />
        </a>
      </div>
    </div>
  )
}

function ProcessingCells({ count, startedAt }: { count: number; startedAt: number }) {
  const now = useNow()
  const n = Math.min(Math.max(count, 1), 4)
  return (
    <div className={n > 1 ? "grid grid-cols-2 gap-px" : ""}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`${CELL} flex animate-pulse items-center justify-center bg-white/[0.03]`}>
          {i === 0 && (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <Loader2 className="size-5 animate-spin text-x-blue" />
              <span className="text-[11px] text-neutral-500">
                {formatElapsed(Math.max(0, Math.floor((now - startedAt) / 1000)))}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Компактная карточка генерации: миниатюры (1 — целиком, 2-4 — сеткой 2×2),
 * статус, модель, время, промпт в 2 строки с «ещё», действия.
 */
export function ImageJobCard({
  job,
  modelName,
  onOpen,
  onEdit,
  onRepeat,
}: {
  job: ImageJob
  modelName: string
  onOpen: (image: ImageHistoryImage) => void
  onEdit: (image: ImageHistoryImage) => void
  onRepeat: (job: ImageJob) => void
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border ${
        job.status === "error" ? "border-red-500/25 bg-red-500/[0.03]" : "border-white/[0.12] bg-white/[0.02]"
      }`}
    >
      {job.status === "done" && job.images.length > 0 ? (
        <div className={job.images.length > 1 ? "grid grid-cols-2 gap-px" : ""}>
          {job.images.slice(0, 4).map((img) => (
            <Thumb key={img.id} image={img} onOpen={onOpen} onEdit={onEdit} />
          ))}
        </div>
      ) : job.status === "processing" ? (
        <ProcessingCells count={job.imagesCount} startedAt={job.startedAt} />
      ) : job.status === "error" ? (
        <div className="flex items-start gap-2 px-3 pt-3 text-xs text-red-300">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <ClampedText text={job.error || "Генерация не удалась"} className="text-red-300/90" />
        </div>
      ) : (
        <p className="px-3 pt-3 text-xs text-neutral-500">Картинки удалены из Библиотеки.</p>
      )}

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <CardMeta
          status={job.status}
          chips={job.isEdit ? <MetaChip>правка</MetaChip> : undefined}
          model={modelName}
          startedAt={job.startedAt}
        />
        <ClampedText text={job.prompt} />
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <RepeatButton onClick={() => onRepeat(job)} />
          <CopyTextButton text={job.prompt} label="Промпт" toastText="Промпт скопирован" />
          <span className="ml-auto text-[11px] text-neutral-500">
            {job.images.length > 1 ? `${job.images.length} шт · ` : ""}
            {typeof job.cost === "number" && job.cost > 0 ? `$${job.cost.toFixed(3)}` : ""}
          </span>
        </div>
      </div>
    </div>
  )
}

export function ImageJobCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
      <div className={`${CELL} animate-pulse bg-white/[0.04]`} />
      <div className="space-y-2 p-3">
        <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-3 w-full animate-pulse rounded bg-white/[0.04]" />
      </div>
    </div>
  )
}
