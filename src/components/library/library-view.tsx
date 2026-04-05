"use client"

import { useState, useCallback, useTransition, useEffect } from "react"
import { toast } from "sonner"
import { FolderOpen } from "lucide-react"
import { ImageGrid } from "./image-grid"
import { FolderTree } from "./folder-tree"
import { BulkActionsBar } from "./bulk-actions-bar"
import { MoveToFolderDialog } from "./move-to-folder-dialog"
import { ImageLightbox } from "./image-lightbox"
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
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  setFolderPassword,
  removeFolderPassword,
  verifyFolderPassword,
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
  const [activeFolderId, setActiveFolderId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    const saved = localStorage.getItem("mg_activeFolder")
    if (!saved) return null
    // Не восстанавливаем зашифрованные папки — требуют пароль
    const folder = initialFolders.find((f) => f.id === saved)
    if (folder?.hasPassword) {
      localStorage.removeItem("mg_activeFolder")
      return null
    }
    return saved
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lightboxImage, setLightboxImage] =
    useState<ImageWithGeneration | null>(null)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [moveTargetIds, setMoveTargetIds] = useState<string[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()
  const [passwordDialogMode, setPasswordDialogMode] = useState<"set" | "remove" | "verify" | null>(null)
  const [passwordTargetId, setPasswordTargetId] = useState<string | null>(null)
  const [passwordInput, setPasswordInput] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [unlockedFolders, setUnlockedFolders] = useState<Set<string>>(new Set())

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

  // Загрузить сохранённую папку при монтировании
  useEffect(() => {
    if (activeFolderId) {
      startTransition(() => { refreshImages(activeFolderId) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Выбор папки (с проверкой пароля)
  function handleSelectFolder(id: string | null) {
    // Проверяем: есть ли пароль и разблокирована ли
    if (id && id !== "root") {
      const folder = folders.find((f) => f.id === id)
      if (folder?.hasPassword && !unlockedFolders.has(id)) {
        setPasswordTargetId(id)
        setPasswordDialogMode("verify")
        setPasswordInput("")
        setPasswordError("")
        return
      }
    }

    setActiveFolderId(id)
    // Не сохраняем зашифрованные папки — при возврате потребуется пароль
    const folder = id ? folders.find((f) => f.id === id) : null
    if (id && !folder?.hasPassword) {
      localStorage.setItem("mg_activeFolder", id)
    } else {
      localStorage.removeItem("mg_activeFolder")
    }
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

  // Пароль: установить
  function handleOpenSetPassword(id: string) {
    setPasswordTargetId(id)
    setPasswordDialogMode("set")
    setPasswordInput("")
    setPasswordConfirm("")
    setPasswordError("")
  }

  // Пароль: снять
  function handleOpenRemovePassword(id: string) {
    setPasswordTargetId(id)
    setPasswordDialogMode("remove")
    setPasswordInput("")
    setPasswordError("")
  }

  async function handlePasswordSubmit() {
    if (!passwordTargetId) return

    if (passwordDialogMode === "set") {
      if (passwordInput.length < 4) {
        setPasswordError("Минимум 4 символа")
        return
      }
      if (passwordInput !== passwordConfirm) {
        setPasswordError("Пароли не совпадают")
        return
      }
      startTransition(async () => {
        await setFolderPassword(passwordTargetId, passwordInput)
        toast.success("Пароль установлен")
        setPasswordDialogMode(null)
        await refreshFolders()
      })
    } else if (passwordDialogMode === "remove") {
      startTransition(async () => {
        const result = await removeFolderPassword(passwordTargetId, passwordInput)
        if (!result.success) {
          setPasswordError(result.error || "Неверный пароль")
          return
        }
        toast.success("Пароль снят")
        setPasswordDialogMode(null)
        await refreshFolders()
      })
    } else if (passwordDialogMode === "verify") {
      startTransition(async () => {
        const result = await verifyFolderPassword(passwordTargetId, passwordInput)
        if (!result.success) {
          setPasswordError(result.error || "Неверный пароль")
          return
        }
        // Разблокируем папку на текущую сессию
        setUnlockedFolders((prev) => new Set(prev).add(passwordTargetId))
        setPasswordDialogMode(null)
        // Теперь открываем папку (не сохраняем в localStorage — зашифрованная)
        setActiveFolderId(passwordTargetId)
        localStorage.removeItem("mg_activeFolder")
        startTransition(() => { refreshImages(passwordTargetId) })
      })
    }
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
      {/* Левая панель — папки (десктоп) */}
      <div className="hidden w-56 shrink-0 md:block">
        <FolderTree
          folders={folders}
          activeFolderId={activeFolderId}
          onSelectFolder={handleSelectFolder}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onSetPassword={handleOpenSetPassword}
          onRemovePassword={handleOpenRemovePassword}
        />
      </div>

      {/* Основная область */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Мобильная кнопка папок */}
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
                  folders={folders}
                  activeFolderId={activeFolderId}
                  onSelectFolder={(id) => {
                    handleSelectFolder(id)
                  }}
                  onCreateFolder={handleCreateFolder}
                  onRenameFolder={handleRenameFolder}
                  onDeleteFolder={handleDeleteFolder}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>

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

      {/* Диалог пароля */}
      <Dialog
        open={passwordDialogMode !== null}
        onOpenChange={(open) => { if (!open) setPasswordDialogMode(null) }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {passwordDialogMode === "set" && "Установить пароль"}
              {passwordDialogMode === "remove" && "Снять пароль"}
              {passwordDialogMode === "verify" && "Введите пароль"}
            </DialogTitle>
            <DialogDescription>
              {passwordDialogMode === "set" && (
                "Пароль нельзя будет восстановить. Если забудете — придётся удалить папку."
              )}
              {passwordDialogMode === "remove" && "Введите текущий пароль для снятия защиты."}
              {passwordDialogMode === "verify" && "Эта папка защищена паролем."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Пароль"
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError("") }}
              onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSubmit() }}
              autoFocus
            />
            {passwordDialogMode === "set" && (
              <Input
                type="password"
                placeholder="Подтвердите пароль"
                value={passwordConfirm}
                onChange={(e) => { setPasswordConfirm(e.target.value); setPasswordError("") }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSubmit() }}
              />
            )}
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogMode(null)}>
              Отмена
            </Button>
            <Button onClick={handlePasswordSubmit} disabled={isPending}>
              {passwordDialogMode === "set" && "Установить"}
              {passwordDialogMode === "remove" && "Снять пароль"}
              {passwordDialogMode === "verify" && "Открыть"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
