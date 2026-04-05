"use client"

import { useState } from "react"
import {
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
  ChevronRight,
  Images,
  Lock,
  LockOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { FolderItem } from "@/lib/actions/folders"

interface FolderTreeProps {
  folders: FolderItem[]
  activeFolderId: string | null // null = "Все", "root" = корень без папки
  onSelectFolder: (id: string | null) => void
  onCreateFolder: (name: string, parentId?: string | null) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  onSetPassword?: (id: string) => void
  onRemovePassword?: (id: string) => void
}

export function FolderTree({
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onSetPassword,
  onRemovePassword,
}: FolderTreeProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  // Строим дерево из плоского списка
  const rootFolders = folders.filter((f) => !f.parentId)
  const childrenMap = new Map<string, FolderItem[]>()
  for (const folder of folders) {
    if (folder.parentId) {
      const children = childrenMap.get(folder.parentId) || []
      children.push(folder)
      childrenMap.set(folder.parentId, children)
    }
  }

  function handleCreateSubmit() {
    const name = newFolderName.trim()
    if (name) {
      onCreateFolder(name)
      setNewFolderName("")
      setIsCreating(false)
    }
  }

  function handleRenameSubmit(id: string) {
    const name = editName.trim()
    if (name) {
      onRenameFolder(id, name)
      setEditingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          Папки
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => setIsCreating(true)}
        >
          <FolderPlus className="size-3.5" />
        </Button>
      </div>

      <ScrollArea className="max-h-[400px]">
        {/* "Все изображения" */}
        <button
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
            activeFolderId === null
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50"
          }`}
          onClick={() => onSelectFolder(null)}
        >
          <Images className="size-4 shrink-0" />
          <span>Все изображения</span>
        </button>

        {/* "Без папки" */}
        <button
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
            activeFolderId === "root"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50"
          }`}
          onClick={() => onSelectFolder("root")}
        >
          <Folder className="size-4 shrink-0" />
          <span>Без папки</span>
        </button>

        {/* Дерево папок */}
        {rootFolders.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            children={childrenMap}
            activeFolderId={activeFolderId}
            editingId={editingId}
            editName={editName}
            onSelect={onSelectFolder}
            onStartEdit={(id, name) => {
              setEditingId(id)
              setEditName(name)
            }}
            onEditNameChange={setEditName}
            onRenameSubmit={handleRenameSubmit}
            onCancelEdit={() => setEditingId(null)}
            onDelete={onDeleteFolder}
            onSetPassword={onSetPassword}
            onRemovePassword={onRemovePassword}
            depth={0}
          />
        ))}

        {/* Форма создания новой папки */}
        {isCreating && (
          <div className="mt-1 px-2">
            <Input
              autoFocus
              placeholder="Название папки"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateSubmit()
                if (e.key === "Escape") setIsCreating(false)
              }}
              onBlur={() => {
                if (!newFolderName.trim()) setIsCreating(false)
              }}
              className="h-8 text-sm"
            />
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function FolderNode({
  folder,
  children,
  activeFolderId,
  editingId,
  editName,
  onSelect,
  onStartEdit,
  onEditNameChange,
  onRenameSubmit,
  onCancelEdit,
  onDelete,
  onSetPassword,
  onRemovePassword,
  depth,
}: {
  folder: FolderItem
  children: Map<string, FolderItem[]>
  activeFolderId: string | null
  editingId: string | null
  editName: string
  onSelect: (id: string) => void
  onStartEdit: (id: string, name: string) => void
  onEditNameChange: (name: string) => void
  onRenameSubmit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
  onSetPassword?: (id: string) => void
  onRemovePassword?: (id: string) => void
  depth: number
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isActive = activeFolderId === folder.id
  const subFolders = children.get(folder.id) || []
  const hasChildren = subFolders.length > 0

  const isEditing = editingId === folder.id

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={`group/folder flex w-full items-center gap-1 rounded-md py-1.5 text-sm transition-colors ${
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
            style={{ paddingLeft: `${(depth + 1) * 8 + 8}px`, paddingRight: '4px' }}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-1"
              onClick={() => onSelect(folder.id)}
            >
              {hasChildren && (
                <ChevronRight
                  className={`size-3 shrink-0 transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsExpanded(!isExpanded)
                  }}
                />
              )}
              {isActive ? (
                <FolderOpen className="size-4 shrink-0" />
              ) : (
                <Folder className="size-4 shrink-0" />
              )}
              {isEditing ? (
                <Input
                  autoFocus
                  value={editName}
                  onChange={(e) => onEditNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onRenameSubmit(folder.id)
                    if (e.key === "Escape") onCancelEdit()
                  }}
                  onBlur={() => onRenameSubmit(folder.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-6 text-sm"
                />
              ) : (
                <>
                  <span className="truncate">{folder.name}</span>
                  {folder.hasPassword && <Lock className="size-3 shrink-0 text-neutral-500" />}
                </>
              )}
            </button>
            {/* Кнопки при ховере */}
            {!isEditing && (
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/folder:opacity-100">
                {folder.hasPassword ? (
                  <button
                    className="flex size-5 items-center justify-center rounded text-neutral-500 hover:bg-white/10 hover:text-foreground"
                    title="Снять пароль"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemovePassword?.(folder.id)
                    }}
                  >
                    <LockOpen className="size-3" />
                  </button>
                ) : (
                  <button
                    className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    title="Установить пароль"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSetPassword?.(folder.id)
                    }}
                  >
                    <Lock className="size-3" />
                  </button>
                )}
                <button
                  className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  title="Переименовать"
                  onClick={(e) => {
                    e.stopPropagation()
                    onStartEdit(folder.id, folder.name)
                  }}
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  title="Удалить папку"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(folder.id)
                  }}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            )}
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => onStartEdit(folder.id, folder.name)}
          >
            <Pencil className="mr-2 size-4" />
            Переименовать
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive"
            onClick={() => onDelete(folder.id)}
          >
            <Trash2 className="mr-2 size-4" />
            Удалить
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Дочерние папки */}
      {isExpanded &&
        subFolders.map((child) => (
          <FolderNode
            key={child.id}
            folder={child}
            children={children}
            activeFolderId={activeFolderId}
            editingId={editingId}
            editName={editName}
            onSelect={onSelect}
            onStartEdit={onStartEdit}
            onEditNameChange={onEditNameChange}
            onRenameSubmit={onRenameSubmit}
            onCancelEdit={onCancelEdit}
            onDelete={onDelete}
            onSetPassword={onSetPassword}
            onRemovePassword={onRemovePassword}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}
