"use client"

import { useState, useCallback } from "react"
import { Check, Download, FolderInput, Trash2, MoreHorizontal } from "lucide-react"
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
  const [isLoaded, setIsLoaded] = useState(false)

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={`group relative aspect-square overflow-hidden rounded-lg border bg-muted transition-all ${
            isSelected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-muted-foreground/30"
          }`}
        >
          {/* Чекбокс выбора */}
          <div
            className={`absolute left-2 top-2 z-10 transition-opacity ${
              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect()
            }}
          >
            <Checkbox
              checked={isSelected}
              className="size-5 border-white/70 bg-black/40 data-[state=checked]:bg-primary"
            />
          </div>

          {/* Изображение */}
          {!isLoaded && (
            <div className="absolute inset-0 animate-pulse bg-muted" />
          )}
          <img
            src={`/api/images/${image.id}`}
            alt={image.generation.prompt.slice(0, 50)}
            className="size-full cursor-pointer object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            onLoad={() => setIsLoaded(true)}
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
