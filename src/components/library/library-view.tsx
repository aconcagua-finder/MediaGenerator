"use client"

import { useState, useCallback, useTransition } from "react"
import { toast } from "sonner"
import { ImageGrid } from "./image-grid"
import { FolderTree } from "./folder-tree"
import { BulkActionsBar } from "./bulk-actions-bar"
import { MoveToFolderDialog } from "./move-to-folder-dialog"
import { ImageLightbox } from "./image-lightbox"
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
  getImages,
  moveImages,
  deleteImages,
  type ImageWithGeneration,
} from "@/lib/actions/images"
import {
  getFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  type FolderItem,
} from "@/lib/actions/folders"

interface LibraryViewProps {
  initialImages: ImageWithGeneration[]
  initialTotal: number
  initialFolders: FolderItem[]
}

export function LibraryView({
  initialImages,
  initialTotal,
  initialFolders,
}: LibraryViewProps) {
  const [images, setImages] = useState(initialImages)
  const [total, setTotal] = useState(initialTotal)
  const [folders, setFolders] = useState(initialFolders)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lightboxImage, setLightboxImage] =
    useState<ImageWithGeneration | null>(null)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [moveTargetIds, setMoveTargetIds] = useState<string[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  // Загрузка изображений для текущей папки
  const refreshImages = useCallback(
    async (folderId: string | null) => {
      const folderParam =
        folderId === "root" ? null : folderId === null ? undefined : folderId
      const result = await getImages({
        folderId: folderParam as string | null | undefined,
      })
      setImages(result.items)
      setTotal(result.total)
      setSelectedIds(new Set())
    },
    []
  )

  // Обновить список папок
  const refreshFolders = useCallback(async () => {
    const result = await getFolders()
    setFolders(result)
  }, [])

  // Выбор папки
  function handleSelectFolder(id: string | null) {
    setActiveFolderId(id)
    startTransition(() => {
      refreshImages(id)
    })
  }

  // Выбор/снятие отдельного изображения
  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Выбрать все
  function handleSelectAll() {
    setSelectedIds(new Set(images.map((img) => img.id)))
  }

  // Снять выделение
  function handleDeselectAll() {
    setSelectedIds(new Set())
  }

  // Открыть диалог перемещения
  function handleOpenMoveDialog(ids: string[]) {
    setMoveTargetIds(ids)
    setMoveDialogOpen(true)
  }

  // Переместить
  async function handleMove(folderId: string | null) {
    startTransition(async () => {
      await moveImages(moveTargetIds, folderId)
      toast.success("Перемещено")
      await refreshImages(activeFolderId)
    })
  }

  // Создать папку и переместить туда
  async function handleCreateAndMove(folderName: string) {
    startTransition(async () => {
      const folder = await createFolder(folderName)
      await moveImages(moveTargetIds, folder.id)
      toast.success(`Создана папка "${folderName}" и перемещено`)
      await refreshFolders()
      await refreshImages(activeFolderId)
    })
  }

  // Открыть подтверждение удаления
  function handleOpenDeleteDialog(ids: string[]) {
    setDeleteTargetIds(ids)
    setDeleteDialogOpen(true)
  }

  // Удалить
  async function handleDelete() {
    startTransition(async () => {
      const result = await deleteImages(deleteTargetIds)
      toast.success(`Удалено: ${result.deleted}`)
      setDeleteDialogOpen(false)
      // Закрыть лайтбокс если удалено открытое изображение
      if (lightboxImage && deleteTargetIds.includes(lightboxImage.id)) {
        setLightboxImage(null)
      }
      await refreshImages(activeFolderId)
    })
  }

  // Массовое скачивание (просто открываем каждое в новой вкладке)
  function handleBulkDownload() {
    for (const id of selectedIds) {
      const link = document.createElement("a")
      link.href = `/api/images/${id}`
      link.download = `image-${id}.png`
      link.click()
    }
    toast.success(`Скачивание ${selectedIds.size} изображений`)
  }

  // Папки: создание, переименование, удаление
  async function handleCreateFolder(name: string) {
    startTransition(async () => {
      await createFolder(name)
      toast.success(`Папка "${name}" создана`)
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
        await refreshImages(null)
      }
      await refreshFolders()
    })
  }

  return (
    <div className="flex h-full gap-4">
      {/* Левая панель — папки */}
      <div className="hidden w-56 shrink-0 md:block">
        <FolderTree
          folders={folders}
          activeFolderId={activeFolderId}
          onSelectFolder={handleSelectFolder}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
        />
      </div>

      {/* Основная область */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Панель массовых действий */}
        <BulkActionsBar
          selectedCount={selectedIds.size}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onDelete={() => handleOpenDeleteDialog([...selectedIds])}
          onMove={() => handleOpenMoveDialog([...selectedIds])}
          onDownload={handleBulkDownload}
        />

        {/* Сетка изображений */}
        <ImageGrid
          images={images}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onOpenLightbox={setLightboxImage}
          onDelete={(ids) => handleOpenDeleteDialog(ids)}
          onMove={(ids) => handleOpenMoveDialog(ids)}
        />

        {/* Подсчёт */}
        {total > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Показано {images.length} из {total}
          </p>
        )}
      </div>

      {/* Лайтбокс */}
      {lightboxImage && (
        <ImageLightbox
          image={lightboxImage}
          onClose={() => setLightboxImage(null)}
          onDelete={() => {
            handleOpenDeleteDialog([lightboxImage.id])
          }}
          onMove={() => {
            handleOpenMoveDialog([lightboxImage.id])
          }}
        />
      )}

      {/* Диалог перемещения */}
      <MoveToFolderDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        folders={folders}
        onMove={handleMove}
        onCreateAndMove={handleCreateAndMove}
        imageCount={moveTargetIds.length}
      />

      {/* Диалог подтверждения удаления */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить изображения?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет удалено {deleteTargetIds.length}{" "}
              {deleteTargetIds.length === 1 ? "изображение" : "изображений"}.
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
