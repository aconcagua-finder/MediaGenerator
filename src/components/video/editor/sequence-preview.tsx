"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Pause } from "lucide-react"
import type { EditorSegment } from "./types"

/**
 * Клиентский предпросмотр итоговой последовательности БЕЗ рендера: один <video>
 * проигрывает каждый сегмент от trimStart до trimEnd, затем переходит к
 * следующему. Даёт мгновенно проверить порядок и точки реза. Финальную склейку
 * всё равно делает сервер (ffmpeg) — здесь нет нормализации холста/звука.
 */
export function SequencePreview({ segments, muted }: { segments: EditorSegment[]; muted: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)

  // Любая правка дорожки сбрасывает предпросмотр в начало
  useEffect(() => {
    setIdx(0)
    setPlaying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments.map((s) => s.uid).join(","), segments.map((s) => `${s.trimStart}-${s.trimEnd}`).join(",")])

  const current = segments[idx]

  function goNext() {
    if (idx + 1 < segments.length) {
      setIdx(idx + 1)
    } else {
      setPlaying(false)
      setIdx(0)
    }
  }

  function handleLoaded() {
    const v = videoRef.current
    if (!v) return
    try {
      v.currentTime = current?.trimStart ?? 0
    } catch {
      /* игнор */
    }
    if (playing) void v.play().catch(() => setPlaying(false))
  }

  function handleTimeUpdate() {
    const v = videoRef.current
    if (!v || !current) return
    const end = current.trimEnd ?? (Number.isFinite(v.duration) ? v.duration : Infinity)
    if (v.currentTime >= end - 0.05) goNext()
  }

  function toggle() {
    const v = videoRef.current
    if (!v) return
    if (playing) {
      v.pause()
      setPlaying(false)
    } else {
      setPlaying(true)
      void v.play().catch(() => setPlaying(false))
    }
  }

  if (!current) return null
  const aspect =
    current.clip.width && current.clip.height ? `${current.clip.width} / ${current.clip.height}` : "16 / 9"

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.12] bg-black">
      <video
        ref={videoRef}
        key={current.uid + idx}
        src={`/api/videos/${current.clip.id}`}
        muted={muted}
        playsInline
        onLoadedMetadata={handleLoaded}
        onTimeUpdate={handleTimeUpdate}
        onEnded={goNext}
        className="max-h-[50vh] w-full bg-black"
        style={{ aspectRatio: aspect }}
      />
      <div className="flex items-center gap-3 bg-white/[0.02] px-3 py-2">
        <button
          type="button"
          onClick={toggle}
          className="flex size-8 items-center justify-center rounded-full bg-x-blue text-white transition-colors hover:bg-x-blue-hover"
          aria-label={playing ? "Пауза" : "Воспроизвести"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-0.5" />}
        </button>
        <span className="text-xs text-neutral-400">
          Клип {idx + 1} из {segments.length}
        </span>
        <div className="ml-auto flex gap-1">
          {segments.map((s, i) => (
            <span
              key={s.uid}
              className={`h-1 w-4 rounded-full ${i === idx ? "bg-x-blue" : "bg-white/[0.15]"}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
