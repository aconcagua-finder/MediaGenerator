"use client"

import { CheckSquare, XSquare, FolderInput, Trash2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BulkActionsBarProps {
  selectedCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onDelete: () => void
  onMove: () => void
  onDownload: () => void
}

export function BulkActionsBar({
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onMove,
  onDownload,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2">
      <span className="text-sm font-medium">
        Выбрано: {selectedCount}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onSelectAll}>
          <CheckSquare className="mr-1 size-4" />
          Выбрать все
        </Button>
        <Button variant="ghost" size="sm" onClick={onDeselectAll}>
          <XSquare className="mr-1 size-4" />
          Снять выделение
        </Button>

        <div className="mx-2 h-6 w-px bg-border" />

        <Button variant="ghost" size="sm" onClick={onMove}>
          <FolderInput className="mr-1 size-4" />
          В папку
        </Button>
        <Button variant="ghost" size="sm" onClick={onDownload}>
          <Download className="mr-1 size-4" />
          Скачать
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="mr-1 size-4" />
          Удалить
        </Button>
      </div>
    </div>
  )
}
