"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, UploadCloud, X, FileVideo, FileAudio } from "lucide-react"
import { toast } from "sonner"
import {
  AUDIO_ACCEPT,
  MAX_SAMPLE_BYTES,
  MAX_SAMPLE_SECONDS,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_SECONDS,
  VIDEO_ACCEPT,
  fileExtension,
  mimeForSource,
  validateSourceMeta,
  type SourceKind,
} from "@/lib/video/source-limits"
import { readMediaMeta, uploadSourceFile, type UploadedSource } from "@/lib/video/upload-source-client"

export interface ReadySource extends UploadedSource {
  /** Имя файла для подписи */
  name: string
  /** blob:-URL для превью без обращения к серверу */
  previewUrl: string
}

interface SourceUploadProps {
  kind: SourceKind
  value: ReadySource | null
  onChange: (value: ReadySource | null) => void
  /** Ограничение длительности (по умолчанию — общий лимит для вида файла) */
  maxSeconds?: number
  disabled?: boolean
  /** Подсказка внутри пустой зоны */
  hint?: string
}

function fmtSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`
}

/**
 * Загрузка исходного видео/аудио: выбор файла или перетаскивание, проверка лимитов
 * до отправки (расширение, размер, длительность по метаданным браузера), загрузка с
 * прогрессом, превью. Серверная проверка по ffprobe всё равно выполняется.
 */
export function SourceUpload({ kind, value, onChange, maxSeconds, disabled, hint }: SourceUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const limitSeconds = maxSeconds ?? (kind === "video" ? MAX_SOURCE_SECONDS : MAX_SAMPLE_SECONDS)
  const limitBytes = kind === "video" ? MAX_SOURCE_BYTES : MAX_SAMPLE_BYTES
  const Icon = kind === "video" ? FileVideo : FileAudio
  const uploading = progress !== null

  // Освобождаем blob-URL при замене/удалении
  useEffect(() => {
    return () => {
      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl)
    }
  }, [value?.previewUrl])

  const handleFile = useCallback(
    async (file: File) => {
      const ext = fileExtension(file.name)
      if (!mimeForSource(kind, ext)) {
        toast.error(kind === "video" ? "Нужен файл mp4, mov или webm" : "Нужен файл mp3, wav, m4a или ogg")
        return
      }
      if (file.size > limitBytes) {
        toast.error(`Файл слишком большой: максимум ${Math.round(limitBytes / 1024 / 1024)} МБ`)
        return
      }

      // Быстрая проверка длительности до загрузки. Не все браузеры читают .mov (HEVC) —
      // тогда пропускаем: окончательно проверит сервер по ffprobe.
      try {
        const meta = await readMediaMeta(file, kind)
        if (Number.isFinite(meta.durationSeconds)) {
          const check = validateSourceMeta(kind, { sizeBytes: file.size, durationSeconds: meta.durationSeconds })
          if (!check.ok) {
            toast.error(check.message)
            return
          }
          if (meta.durationSeconds > limitSeconds + 0.05) {
            toast.error(`Слишком длинный файл: максимум ${limitSeconds} сек, а у вас ${meta.durationSeconds.toFixed(1)} сек`)
            return
          }
        }
      } catch {
        // игнорируем — сервер проверит сам
      }

      setProgress(0)
      const { promise, abort } = uploadSourceFile(file, kind, setProgress)
      abortRef.current = abort
      try {
        const uploaded = await promise
        if (uploaded.durationSeconds > limitSeconds + 0.05) {
          toast.error(`Слишком длинный файл: максимум ${limitSeconds} сек, а у вас ${uploaded.durationSeconds.toFixed(1)} сек`)
          return
        }
        onChange({ ...uploaded, name: file.name, previewUrl: URL.createObjectURL(file) })
      } catch (err) {
        toast.error("Не удалось загрузить файл", { description: err instanceof Error ? err.message : undefined })
      } finally {
        abortRef.current = null
        setProgress(null)
      }
    },
    [kind, limitBytes, limitSeconds, onChange]
  )

  function openPicker() {
    if (!disabled && !uploading) inputRef.current?.click()
  }

  const accept = kind === "video" ? VIDEO_ACCEPT : AUDIO_ACCEPT

  if (value) {
    return (
      <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-3">
        <div className="flex items-start gap-3">
          {kind === "video" ? (
            <video
              src={value.previewUrl}
              controls
              playsInline
              preload="metadata"
              className="max-h-56 w-auto max-w-[45%] rounded-md bg-black"
            />
          ) : (
            <audio src={value.previewUrl} controls className="h-10 w-full" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white" title={value.name}>{value.name}</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {value.durationSeconds.toFixed(1)} сек · {fmtSize(value.sizeBytes)}
              {value.width && value.height ? ` · ${value.width}×${value.height}` : ""}
              {kind === "video" ? (value.hasAudio ? " · со звуком" : " · без звука") : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-neutral-300 transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-40"
            title="Убрать файл"
            aria-label="Убрать файл"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          openPicker()
        }
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types?.includes("Files")) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer?.files?.[0]
        if (f && !disabled && !uploading) void handleFile(f)
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${
        dragOver ? "border-x-blue/60 bg-x-blue/[0.06]" : "border-white/[0.18] bg-white/[0.02] hover:border-x-blue/40"
      } ${disabled || uploading ? "pointer-events-none opacity-70" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) void handleFile(f)
        }}
      />
      {uploading ? (
        <>
          <Loader2 className="size-6 animate-spin text-x-blue" />
          <p className="text-sm font-medium text-neutral-300">Загрузка… {Math.round((progress ?? 0) * 100)}%</p>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full bg-x-blue transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
        </>
      ) : (
        <>
          <UploadCloud className="size-6 text-neutral-400" />
          <p className="text-sm font-medium text-neutral-200">
            <Icon className="mr-1.5 inline size-4 align-text-bottom text-neutral-400" />
            {kind === "video" ? "Загрузите видео" : "Загрузите образец голоса"}
          </p>
          <p className="text-xs text-neutral-500">
            Перетащите файл сюда или нажмите. {kind === "video" ? "mp4, mov, webm" : "mp3, wav, m4a, ogg"} · до {limitSeconds} сек · до {Math.round(limitBytes / 1024 / 1024)} МБ
          </p>
          {hint && <p className="max-w-md text-[11px] leading-snug text-neutral-600">{hint}</p>}
        </>
      )}
    </div>
  )
}
