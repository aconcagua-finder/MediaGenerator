"use client"

import { ChevronUp, ChevronDown, X, Scissors, Volume2, VolumeX } from "lucide-react"
import { type EditorSegment, segDuration, fmtDuration } from "./types"

interface Props {
  segment: EditorSegment
  index: number
  isFirst: boolean
  isLast: boolean
  audioEnabled: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onTrim: () => void
  onToggleMute: () => void
}

export function TimelineSegment({
  segment,
  index,
  isFirst,
  isLast,
  audioEnabled,
  onMoveUp,
  onMoveDown,
  onRemove,
  onTrim,
  onToggleMute,
}: Props) {
  const full = segment.clip.durationSeconds ?? 0
  const trimmed = segDuration(segment)
  const isTrimmed = (segment.trimStart ?? 0) > 0 || (segment.trimEnd != null && segment.trimEnd < full)
  const aspect =
    segment.clip.width && segment.clip.height ? `${segment.clip.width} / ${segment.clip.height}` : "16 / 9"

  return (
    <li className="flex items-center gap-3 rounded-lg border border-white/[0.1] bg-white/[0.02] p-2">
      {/* Номер */}
      <span className="w-5 shrink-0 text-center text-xs font-medium text-neutral-500">{index + 1}</span>

      {/* Превью (первый кадр) */}
      <div className="h-12 w-20 shrink-0 overflow-hidden rounded bg-black">
        <video
          src={`/api/videos/${segment.clip.id}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
          style={{ aspectRatio: aspect }}
        />
      </div>

      {/* Подпись + длительность */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-neutral-300" title={segment.clip.label}>
          {segment.clip.label}
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          {isTrimmed ? (
            <>
              <span className="text-neutral-600 line-through">{fmtDuration(full)}</span>{" "}
              <span className="text-x-blue">{fmtDuration(trimmed)}</span>
            </>
          ) : (
            fmtDuration(full)
          )}
        </p>
      </div>

      {/* Действия */}
      <div className="flex shrink-0 items-center gap-0.5">
        {audioEnabled && segment.clip.hasAudio && (
          <IconBtn
            onClick={onToggleMute}
            title={segment.mute ? "Включить звук сегмента" : "Заглушить сегмент"}
            active={segment.mute}
          >
            {segment.mute ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </IconBtn>
        )}
        <IconBtn onClick={onTrim} title="Обрезать" active={isTrimmed}>
          <Scissors className="size-3.5" />
        </IconBtn>
        <IconBtn onClick={onMoveUp} title="Вверх" disabled={isFirst}>
          <ChevronUp className="size-4" />
        </IconBtn>
        <IconBtn onClick={onMoveDown} title="Вниз" disabled={isLast}>
          <ChevronDown className="size-4" />
        </IconBtn>
        <IconBtn onClick={onRemove} title="Убрать" danger>
          <X className="size-3.5" />
        </IconBtn>
      </div>
    </li>
  )
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  active,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  active?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-25 ${
        active
          ? "bg-x-blue/[0.15] text-x-blue"
          : danger
            ? "text-neutral-400 hover:bg-red-500/[0.12] hover:text-red-400"
            : "text-neutral-400 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      {children}
    </button>
  )
}
