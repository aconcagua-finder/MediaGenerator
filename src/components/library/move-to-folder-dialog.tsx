"use client"

import { useState } from "react"
import { Folder, FolderPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { FolderItem } from "@/lib/actions/folders"

interface MoveToFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: FolderItem[]
  onMove: (folderId: string | null) => void
  onCreateAndMove: (folderName: string) => void
  imageCount: number
}

export function MoveToFolderDialog({
  open,
  onOpenChange,
  folders,
  onMove,
  onCreateAndMove,
  imageCount,
}: MoveToFolderDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState("")

  function handleMove() {
    onMove(selectedFolderId)
    onOpenChange(false)
  }

  function handleCreateAndMove() {
    const name = newName.trim()
    if (name) {
      onCreateAndMove(name)
      setNewName("")
      setIsCreating(false)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Переместить в папку</DialogTitle>
          <DialogDescription>
            {imageCount} {imageCount === 1 ? "изображение" : "изображений"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-1">
            {/* Корень (без папки) */}
            <button
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                selectedFolderId === null
                  ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                  : "text-muted-foreground hover:bg-white/5"
              }`}
              onClick={() => setSelectedFolderId(null)}
            >
              <Folder className="size-4" />
              Без папки
            </button>

            {folders.map((folder) => (
              <button
                key={folder.id}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  selectedFolderId === folder.id
                    ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                    : "text-muted-foreground hover:bg-white/5"
                }`}
                onClick={() => setSelectedFolderId(folder.id)}
              >
                <Folder className="size-4" />
                {folder.name}
              </button>
            ))}
          </div>
        </ScrollArea>

        {isCreating ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Новая папка"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateAndMove()
                if (e.key === "Escape") setIsCreating(false)
              }}
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={handleCreateAndMove}>
              Создать
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreating(true)}
          >
            <FolderPlus className="mr-2 size-4" />
            Новая папка
          </Button>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleMove}>
            Переместить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
