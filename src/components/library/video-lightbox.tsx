"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X, Download, FolderInput, Trash2, Copy, Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import type { VideoLibraryItem } from "@/lib/actions/videos"

interface VideoLightboxProps {
  video: VideoLibraryItem
  onClose: () => void
  onDelete: () => void
  onMove: () => void
}

function formatSize(bytes: number | null): string | null {
  if (!bytes) return null
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export function VideoLightbox({ video, onClose, onDelete, onMove }: VideoLightboxProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  function copyPrompt() {
    navigator.clipboard.writeText(video.generation.prompt)
    toast.success("Промпт скопирован")
  }

  const p = (video.generation.params || {}) as {
    duration?: number
    resolution?: string
    aspect_ratio?: string
    generate_audio?: boolean
  }
  const size = formatSize(video.sizeBytes)
  const resolution =
    p.resolution || (video.width && video.height ? `${video.width}×${video.height}` : null)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] max-w-[90vw] gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Видео */}
        <video
          src={`/api/videos/${video.id}`}
          controls
          autoPlay
          playsInline
          className="max-h-[85vh] rounded-lg bg-black object-contain"
        />

        {/* Боковая панель с деталями */}
        <div className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto rounded-lg bg-card p-4 md:flex">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Детали</h3>
            <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>

          {/* Промпт */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Промпт</span>
              <Button variant="ghost" size="icon" className="size-5" onClick={copyPrompt}>
                <Copy className="size-3" />
              </Button>
            </div>
            <p className="max-h-[30vh] overflow-y-auto text-sm leading-relaxed">
              {video.generation.prompt}
            </p>
          </div>

          {/* Метаданные */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Модель</span>
              <Badge variant="secondary" className="truncate">{video.generation.model}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Провайдер</span>
              <span>{video.generation.provider}</span>
            </div>
            {video.generation.cost != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Стоимость</span>
                <span>
                  {video.generation.cost > 0
                    ? `$${video.generation.cost.toFixed(3)}`
                    : "бесплатно"}
                </span>
              </div>
            )}
            {video.durationSeconds != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Длительность</span>
                <span>{video.durationSeconds} сек</span>
              </div>
            )}
            {resolution && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Разрешение</span>
                <span>{resolution}</span>
              </div>
            )}
            {p.aspect_ratio && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Соотношение</span>
                <span>{p.aspect_ratio}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Звук</span>
              <span className="flex items-center gap-1">
                {video.hasAudio ? (
                  <><Volume2 className="size-3.5" /> есть</>
                ) : (
                  <><VolumeX className="size-3.5" /> нет</>
                )}
              </span>
            </div>
            {size && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Файл</span>
                <span>{size}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Дата</span>
              <span>{new Date(video.createdAt).toLocaleDateString("ru-RU")}</span>
            </div>
          </div>

          {/* Действия */}
          <div className="mt-auto flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const link = document.createElement("a")
                link.href = `/api/videos/${video.id}`
                link.download = `video-${video.id}.mp4`
                link.click()
              }}
            >
              <Download className="mr-2 size-4" />
              Скачать
            </Button>
            <Button variant="outline" size="sm" onClick={onMove}>
              <FolderInput className="mr-2 size-4" />
              В папку
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="mr-2 size-4" />
              Удалить
            </Button>
          </div>
        </div>

        {/* Мобильные кнопки */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-2 p-3 md:hidden">
          <a
            href={`/api/videos/${video.id}`}
            download={`video-${video.id}.mp4`}
            className="inline-flex h-8 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Скачать
          </a>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
