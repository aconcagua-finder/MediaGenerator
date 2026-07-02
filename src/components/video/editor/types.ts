import type { PickerVideo } from "@/lib/actions/videos"

export type Orientation = "landscape" | "portrait"

/** Один сегмент дорожки: исходный клип + параметры обрезки/звука. */
export interface EditorSegment {
  /** Локальный id строки (клип можно добавить в дорожку несколько раз) */
  uid: string
  clip: PickerVideo
  /** Начало обрезки в секундах (null = с начала клипа) */
  trimStart: number | null
  /** Конец обрезки в секундах (null = до конца клипа) */
  trimEnd: number | null
  mute: boolean
}

export interface OutputSettings {
  orientation: Orientation
  /** Со звуком в итоговом файле */
  audio: boolean
}

/** Длительность сегмента после обрезки, в секундах. */
export function segDuration(s: EditorSegment): number {
  const full = s.clip.durationSeconds ?? 0
  const start = s.trimStart ?? 0
  const end = s.trimEnd ?? full
  return Math.max(0, end - start)
}

/** Человекочитаемая длительность: «5.2с» или «1:05». */
export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0с"
  if (sec < 60) return `${Math.round(sec * 10) / 10}с`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}
