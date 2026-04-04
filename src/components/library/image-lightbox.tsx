"use client"

import { X, Download, FolderInput, Trash2, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import type { ImageWithGeneration } from "@/lib/actions/images"

interface ImageLightboxProps {
  image: ImageWithGeneration
  onClose: () => void
  onDelete: () => void
  onMove: () => void
}

export function ImageLightbox({
  image,
  onClose,
  onDelete,
  onMove,
}: ImageLightboxProps) {
  function copyPrompt() {
    navigator.clipboard.writeText(image.generation.prompt)
    toast.success("Промпт скопирован")
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] max-w-[90vw] gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Изображение */}
        <img
          src={`/api/images/${image.id}`}
          alt={image.generation.prompt.slice(0, 80)}
          className="max-h-[85vh] rounded-lg object-contain"
        />

        {/* Боковая панель с информацией */}
        <div className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto rounded-lg bg-card p-4 md:flex">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Детали</h3>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Промпт */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Промпт</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-5"
                onClick={copyPrompt}
              >
                <Copy className="size-3" />
              </Button>
            </div>
            <p className="text-sm leading-relaxed">
              {image.generation.prompt}
            </p>
          </div>

          {/* Метаданные */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Модель</span>
              <Badge variant="secondary">{image.generation.model}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Провайдер</span>
              <span>{image.generation.provider}</span>
            </div>
            {image.width && image.height && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Размер</span>
                <span>{image.width}x{image.height}</span>
              </div>
            )}
            {image.sizeBytes && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Файл</span>
                <span>{(image.sizeBytes / 1024).toFixed(0)} KB</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Дата</span>
              <span>
                {new Date(image.createdAt).toLocaleDateString("ru-RU")}
              </span>
            </div>
          </div>

          {/* Действия */}
          <div className="mt-auto flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const link = document.createElement("a")
                link.href = `/api/images/${image.id}`
                link.download = `image-${image.id}.${image.format || "png"}`
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

        {/* Мобильные кнопки под изображением */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-2 p-3 md:hidden">
          <a
            href={`/api/images/${image.id}`}
            download={`image-${image.id}.${image.format || "png"}`}
            className="inline-flex h-8 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Скачать
          </a>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  )
}
