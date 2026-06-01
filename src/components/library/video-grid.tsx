"use client"

import { Download, FolderInput, Trash2, Play } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { VideoLibraryItem } from "@/lib/actions/videos"

interface VideoGridProps {
  videos: VideoLibraryItem[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpenLightbox: (video: VideoLibraryItem) => void
  onDelete: (ids: string[]) => void
  onMove: (ids: string[]) => void
}

export function VideoGrid({
  videos,
  selectedIds,
  onToggleSelect,
  onOpenLightbox,
  onDelete,
  onMove,
}: VideoGridProps) {
  if (videos.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <p className="text-muted-foreground">Нет видео в этой папке</p>
      </div>
    )
  }

  return (
    <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
      {videos.map((v) => (
        <VideoCard
          key={v.id}
          video={v}
          isSelected={selectedIds.has(v.id)}
          onToggleSelect={() => onToggleSelect(v.id)}
          onOpenLightbox={() => onOpenLightbox(v)}
          onDelete={() => onDelete([v.id])}
          onMove={() => onMove([v.id])}
        />
      ))}
    </div>
  )
}

function VideoCard({
  video,
  isSelected,
  onToggleSelect,
  onOpenLightbox,
  onDelete,
  onMove,
}: {
  video: VideoLibraryItem
  isSelected: boolean
  onToggleSelect: () => void
  onOpenLightbox: () => void
  onDelete: () => void
  onMove: () => void
}) {
  const aspectRatio = video.width && video.height ? `${video.width} / ${video.height}` : "16 / 9"

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={`group relative mb-3 break-inside-avoid overflow-hidden rounded-lg border transition-all ${
            isSelected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-muted-foreground/30"
          }`}
        >
          {/* Чекбокс выбора */}
          <div
            className={`absolute left-2 top-2 z-20 transition-opacity ${
              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onToggleSelect()
            }}
          >
            <Checkbox
              checked={isSelected}
              tabIndex={-1}
              className="pointer-events-none size-5 border-white/70 bg-black/40 data-[state=checked]:bg-primary"
            />
          </div>

          {/* Первый кадр видео + оверлей play; клик открывает лайтбокс */}
          <div className="relative cursor-pointer" onClick={onOpenLightbox}>
            <video
              src={`/api/videos/${video.id}#t=0.1`}
              preload="metadata"
              muted
              playsInline
              className="w-full bg-black"
              style={{ aspectRatio }}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm transition-transform group-hover:scale-110">
                <Play className="size-5 translate-x-0.5 fill-white text-white" />
              </span>
            </div>
            {video.durationSeconds != null && (
              <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                {video.durationSeconds}с
              </span>
            )}
          </div>

          {/* Подпись при наведении */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
            <p className="truncate text-xs text-white">{video.generation.model}</p>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={onOpenLightbox}>Просмотр</ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            const link = document.createElement("a")
            link.href = `/api/videos/${video.id}`
            link.download = `video-${video.id}.mp4`
            link.click()
          }}
        >
          <Download className="mr-2 size-4" />
          Скачать
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onMove}>
          <FolderInput className="mr-2 size-4" />
          Переместить в папку
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 size-4" />
          Удалить
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
