"use client"

import { useRef } from "react"
import { ImagePlus, Loader2, X, AlertCircle } from "lucide-react"
import type { Attachment } from "@/hooks/use-image-attachments"

interface AttachmentTrayProps {
  attachments: Attachment[]
  onRemove: (localId: string) => void
  onPick: (files: FileList) => void
  disabled?: boolean
  /** Подсказка-плейсхолдер, когда пусто (опционально). Скрываем, если не нужна. */
  hint?: string
}

/**
 * Лента превью-карточек прикреплённых картинок + кнопка "+" для выбора файла.
 *
 * Используем native input[type=file] (скрытый), а не drag-drop сюда —
 * drag-drop поднят на уровень самой формы (textarea/контейнер).
 */
export function AttachmentTray({
  attachments,
  onRemove,
  onPick,
  disabled,
  hint,
}: AttachmentTrayProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (attachments.length === 0 && !hint && disabled) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {attachments.map((att) => (
        <AttachmentChip key={att.localId} attachment={att} onRemove={onRemove} />
      ))}

      {!disabled && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/[0.14] bg-white/[0.02] text-neutral-500 transition-colors hover:border-x-blue/40 hover:bg-x-blue/5 hover:text-x-blue"
            title="Добавить картинку (или вставьте из буфера / перетащите файл)"
            aria-label="Добавить картинку"
          >
            <ImagePlus className="size-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onPick(e.target.files)
              }
              // Сбрасываем, чтобы повторный выбор того же файла триггерил change
              e.target.value = ""
            }}
          />
        </>
      )}

      {attachments.length === 0 && hint && (
        <span className="text-[11px] text-neutral-600">{hint}</span>
      )}
    </div>
  )
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment
  onRemove: (localId: string) => void
}) {
  const { previewUrl, status, errorMessage, filename } = attachment
  return (
    <div
      className={`group relative size-16 shrink-0 overflow-hidden rounded-lg border ${
        status === "error" ? "border-red-500/40" : "border-white/[0.12]"
      } bg-white/[0.02]`}
      title={filename}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewUrl}
        alt={filename}
        className={`size-full object-cover ${
          status === "uploading" ? "opacity-50" : "opacity-100"
        }`}
      />

      {status === "uploading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Loader2 className="size-4 animate-spin text-white" />
        </div>
      )}

      {status === "error" && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-red-500/15"
          title={errorMessage || "Ошибка загрузки"}
        >
          <AlertCircle className="size-5 text-red-300" />
        </div>
      )}

      <button
        type="button"
        onClick={() => onRemove(attachment.localId)}
        className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        title="Удалить"
        aria-label={`Удалить ${filename}`}
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
