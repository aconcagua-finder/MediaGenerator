"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { EditorSegment } from "./types"

interface Props {
  segment: EditorSegment
  onClose: () => void
  onApply: (trimStart: number | null, trimEnd: number | null) => void
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function TrimDialog({ segment, onClose, onApply }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState(segment.clip.durationSeconds ?? 0)
  const [start, setStart] = useState(segment.trimStart ?? 0)
  const [end, setEnd] = useState(segment.trimEnd ?? segment.clip.durationSeconds ?? 0)

  // Когда метаданные подгрузились — уточняем реальную длительность
  function handleLoaded() {
    const d = videoRef.current?.duration
    if (d && Number.isFinite(d) && d > 0) {
      setDuration(d)
      if (segment.trimEnd == null) setEnd(d)
    }
  }

  function seek(t: number) {
    const v = videoRef.current
    if (v) {
      try {
        v.currentTime = Math.max(0, Math.min(t, duration || t))
      } catch {
        /* до loadedmetadata перемотка может бросить — игнор */
      }
    }
  }

  function changeStart(value: number) {
    const next = Math.min(value, end - 0.1)
    const clamped = Math.max(0, next)
    setStart(clamped)
    seek(clamped)
  }
  function changeEnd(value: number) {
    const next = Math.max(value, start + 0.1)
    const clamped = Math.min(next, duration || next)
    setEnd(clamped)
    seek(clamped)
  }

  // ESC закрывает через onOpenChange
  useEffect(() => {
    seek(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const trimmedLen = Math.max(0, end - start)
  const max = duration || end || 1

  function apply() {
    onApply(start > 0.05 ? r1(start) : null, end < (duration || end) - 0.05 ? r1(end) : null)
  }
  function reset() {
    setStart(0)
    setEnd(duration)
    onApply(null, null)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Обрезка клипа</DialogTitle>
        </DialogHeader>

        <video
          ref={videoRef}
          src={`/api/videos/${segment.clip.id}`}
          onLoadedMetadata={handleLoaded}
          controls
          playsInline
          className="w-full rounded-md bg-black"
          style={{
            aspectRatio:
              segment.clip.width && segment.clip.height
                ? `${segment.clip.width} / ${segment.clip.height}`
                : "16 / 9",
            maxHeight: "40vh",
          }}
        />

        <div className="space-y-4">
          <RangeRow
            label="Начало"
            value={start}
            max={max}
            color="accent-emerald-500"
            onChange={changeStart}
          />
          <RangeRow label="Конец" value={end} max={max} color="accent-x-blue" onChange={changeEnd} />

          <div className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2 text-xs text-neutral-400">
            <span>
              {r1(start)}с → {r1(end)}с
            </span>
            <span className="font-medium text-neutral-200">Итог: {r1(trimmedLen)}с</span>
          </div>
        </div>

        <div className="-mx-4 -mb-4 flex items-center justify-between gap-2 rounded-b-xl border-t bg-muted/50 p-4">
          <Button variant="ghost" size="sm" onClick={reset}>
            Сбросить обрезку
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Отмена
            </Button>
            <Button size="sm" onClick={apply}>
              Применить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RangeRow({
  label,
  value,
  max,
  color,
  onChange,
}: {
  label: string
  value: number
  max: number
  color: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-neutral-400">{label}</span>
        <span className="text-neutral-300">{r1(value)}с</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/[0.1] ${color}`}
      />
    </div>
  )
}
