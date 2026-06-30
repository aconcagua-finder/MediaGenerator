"use client"

import { useState, useCallback, useTransition } from "react"
import { toast } from "sonner"
import { FolderOpen } from "lucide-react"
import { AudioGrid } from "./audio-grid"
import { FolderTree } from "./folder-tree"
import { BulkActionsBar } from "./bulk-actions-bar"
import { MoveToFolderDialog } from "./move-to-folder-dialog"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  getAudios,
  moveAudios,
  deleteAudios,
  type AudioLibraryItem,
} from "@/lib/actions/audios"
import {
  getFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  type FolderItem,
} from "@/lib/actions/folders"

interface AudioLibraryProps {
  initialAudios: AudioLibraryItem[]
  initialTotal: number
  initialFolders: FolderItem[]
}

export function AudioLibrary({ initialAudios, initialTotal, initialFolders }: AudioLibraryProps) {
  const [audios, setAudios] = useState(initialAudios)
  const [total, setTotal] = useState(initialTotal)
  const [folders, setFolders] = useState(initialFolders)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [moveTargetIds, setMoveTargetIds] = useState<string[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  // Запароленные папки управляются во вкладке «Фото»; здесь их прячем
  const visibleFolders = folders.filter((f) => !f.hasPassword)

  const refreshAudios = useCallback(async (folderId: string | null) => {
    const folderParam = folderId === "root" ? null : folderId === null ? undefined : folderId
    const result = await getAudios({ folderId: folderParam as string | null | undefined })
    setAudios(result.items)
    setTotal(result.total)
    setSelectedIds(new Set())
  }, [])

  const refreshFolders = useCallback(async () => {
    setFolders(await getFolders())
  }, [])

  function handleSelectFolder(id: string | null) {
    setActiveFolderId(id)
    startTransition(() => {
      refreshAudios(id)
    })
  }

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSelectAll() {
    setSelectedIds(new Set(audios.map((a) => a.id)))
  }
  function handleDeselectAll() {
    setSelectedIds(new Set())
  }

  function handleOpenMoveDialog(ids: string[]) {
    setMoveTargetIds(ids)
    setMoveDialogOpen(true)
  }

  async function handleMove(folderId: string | null) {
    startTransition(async () => {
      await moveAudios(moveTargetIds, folderId)
      toast.success("Перемещено")
      await refreshAudios(activeFolderId)
    })
  }

  async function handleCreateAndMove(folderName: string) {
    startTransition(async () => {
      const folder = await createFolder(folderName)
      await moveAudios(moveTargetIds, folder.id)
      toast.success(`Создана папка «${folderName}» и перемещено`)
      await refreshFolders()
      await refreshAudios(activeFolderId)
    })
  }

  function handleOpenDeleteDialog(ids: string[]) {
    setDeleteTargetIds(ids)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    startTransition(async () => {
      const result = await deleteAudios(deleteTargetIds)
      toast.success(`Удалено: ${result.deleted}`)
      setDeleteDialogOpen(false)
      await refreshAudios(activeFolderId)
    })
  }

  function handleBulkDownload() {
    for (const id of selectedIds) {
      const link = document.createElement("a")
      link.href = `/api/audios/${id}`
      link.download = `voice-${id}`
      link.click()
    }
    toast.success(`Скачивание ${selectedIds.size} аудио`)
  }

  async function handleCreateFolder(name: string) {
    startTransition(async () => {
      await createFolder(name)
      toast.success(`Папка «${name}» создана`)
      await refreshFolders()
    })
  }

  async function handleRenameFolder(id: string, name: string) {
    startTransition(async () => {
      await renameFolder(id, name)
      await refreshFolders()
    })
  }

  async function handleDeleteFolder(id: string) {
    startTransition(async () => {
      await deleteFolder(id)
      toast.success("Папка удалена")
      if (activeFolderId === id) {
        setActiveFolderId(null)
        await refreshAudios(null)
      }
      await refreshFolders()
    })
  }

  return (
    <div className="flex h-full gap-4">
      {/* Левая панель — папки (десктоп) */}
      <div className="hidden w-56 shrink-0 md:block">
        <FolderTree
          folders={visibleFolders}
          activeFolderId={activeFolderId}
          onSelectFolder={handleSelectFolder}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          allLabel="Все аудио"
        />
      </div>

      {/* Основная область */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="outline" size="sm">
                  <FolderOpen className="mr-2 size-4" />
                  Папки
                </Button>
              }
            />
            <SheetContent side="left" className="w-64 p-4">
              <SheetHeader>
                <SheetTitle>Папки</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <FolderTree
                  folders={visibleFolders}
                  activeFolderId={activeFolderId}
                  onSelectFolder={handleSelectFolder}
                  onCreateFolder={handleCreateFolder}
                  onRenameFolder={handleRenameFolder}
                  onDeleteFolder={handleDeleteFolder}
                  allLabel="Все аудио"
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <BulkActionsBar
          selectedCount={selectedIds.size}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onDelete={() => handleOpenDeleteDialog([...selectedIds])}
          onMove={() => handleOpenMoveDialog([...selectedIds])}
          onDownload={handleBulkDownload}
        />

        <AudioGrid
          audios={audios}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onDelete={(ids) => handleOpenDeleteDialog(ids)}
          onMove={(ids) => handleOpenMoveDialog(ids)}
        />

        {total > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Показано {audios.length} из {total}
          </p>
        )}
      </div>

      <MoveToFolderDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        folders={visibleFolders}
        onMove={handleMove}
        onCreateAndMove={handleCreateAndMove}
        imageCount={moveTargetIds.length}
        nounOne="аудио"
        nounMany="аудио"
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить аудио?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет удалено {deleteTargetIds.length} аудио. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isPending}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
