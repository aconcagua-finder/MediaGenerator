"use client"

import { Download, FolderInput, Trash2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { ImageWithGeneration } from "@/lib/actions/images"

interface ImageGridProps {
  images: ImageWithGeneration[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpenLightbox: (image: ImageWithGeneration) => void
  onDelete: (ids: string[]) => void
  onMove: (ids: string[]) => void
}

export function ImageGrid({
  images,
  selectedIds,
  onToggleSelect,
  onOpenLightbox,
  onDelete,
  onMove,
}: ImageGridProps) {
  if (images.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <p className="text-muted-foreground">Нет изображений</p>
      </div>
    )
  }

  return (
    <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4">
      {images.map((img) => (
        <ImageCard
          key={img.id}
          image={img}
          isSelected={selectedIds.has(img.id)}
          onToggleSelect={() => onToggleSelect(img.id)}
          onOpenLightbox={() => onOpenLightbox(img)}
          onDelete={() => onDelete([img.id])}
          onMove={() => onMove([img.id])}
        />
      ))}
    </div>
  )
}

function ImageCard({
  image,
  isSelected,
  onToggleSelect,
  onOpenLightbox,
  onDelete,
  onMove,
}: {
  image: ImageWithGeneration
  isSelected: boolean
  onToggleSelect: () => void
  onOpenLightbox: () => void
  onDelete: () => void
  onMove: () => void
}) {
  // Aspect ratio из метаданных, fallback на 1:1
  const w = image.width || 1024
  const h = image.height || 1024
  const aspectRatio = `${w} / ${h}`

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

          {/* Изображение с натуральным aspect ratio */}
          <img
            src={`/api/images/${image.id}`}
            alt={image.generation.prompt.slice(0, 50)}
            className="w-full cursor-pointer bg-white/[0.03]"
            style={{ aspectRatio }}
            loading="lazy"
            onClick={onOpenLightbox}
          />

          {/* Подпись при наведении */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
            <p className="truncate text-xs text-white">
              {image.generation.model}
            </p>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={onOpenLightbox}>
          Просмотр
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            const link = document.createElement("a")
            link.href = `/api/images/${image.id}`
            link.download = `image-${image.id}.png`
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
        <ContextMenuItem
          className="text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="mr-2 size-4" />
          Удалить
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
