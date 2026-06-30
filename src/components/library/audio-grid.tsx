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
import type { AudioLibraryItem } from "@/lib/actions/audios"

interface AudioGridProps {
  audios: AudioLibraryItem[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onDelete: (ids: string[]) => void
  onMove: (ids: string[]) => void
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export function AudioGrid({ audios, selectedIds, onToggleSelect, onDelete, onMove }: AudioGridProps) {
  if (audios.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <p className="text-muted-foreground">Нет аудио в этой папке</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {audios.map((a) => (
        <AudioCard
          key={a.id}
          audio={a}
          isSelected={selectedIds.has(a.id)}
          onToggleSelect={() => onToggleSelect(a.id)}
          onDelete={() => onDelete([a.id])}
          onMove={() => onMove([a.id])}
        />
      ))}
    </div>
  )
}

function AudioCard({
  audio,
  isSelected,
  onToggleSelect,
  onDelete,
  onMove,
}: {
  audio: AudioLibraryItem
  isSelected: boolean
  onToggleSelect: () => void
  onDelete: () => void
  onMove: () => void
}) {
  const format = audio.format || "mp3"

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={`group relative overflow-hidden rounded-lg border bg-white/[0.02] p-3 transition-all ${
            isSelected ? "ring-2 ring-primary" : "border-white/[0.12] hover:ring-1 hover:ring-muted-foreground/30"
          }`}
        >
          <div className="flex items-start gap-2">
            <div
              className={`mt-0.5 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
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
                className="pointer-events-none size-5 border-white/40 data-[state=checked]:bg-primary"
              />
            </div>
            <p className="min-w-0 flex-1 line-clamp-2 text-xs text-neutral-300" title={audio.generation.text}>
              {audio.generation.text}
            </p>
          </div>

          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={`/api/audios/${audio.id}`} controls preload="none" className="mt-2 w-full" />

          <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-500">
            <span className="truncate">{audio.generation.voice}</span>
            <span className="ml-auto shrink-0 uppercase">{format}</span>
            {audio.durationSeconds != null && <span className="shrink-0">{audio.durationSeconds}с</span>}
            {audio.sizeBytes != null && <span className="shrink-0">{fmtSize(audio.sizeBytes)}</span>}
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => {
            const link = document.createElement("a")
            link.href = `/api/audios/${audio.id}`
            link.download = `voice-${audio.id}.${format}`
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
