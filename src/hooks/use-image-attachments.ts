"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/utils/validate-upload"

/**
 * Один элемент в локальном списке вложений. Может быть в одном из трёх состояний:
 * uploading — загружается в /api/uploads
 * ready     — успешно загружено, есть id, можно слать в чат/edit
 * error     — отвалилось, держим карточку с возможностью удалить/повторить
 */
export interface Attachment {
  /** Локальный уникальный id (uuid внутри клиента, не БД-id) */
  localId: string
  /** Object URL для предпросмотра (отзываем при удалении) */
  previewUrl: string
  /** Имя файла, если есть */
  filename: string
  status: "uploading" | "ready" | "error"
  /** ID в БД после успешной загрузки */
  serverId?: string
  /** Размеры из ответа /api/uploads */
  width?: number
  height?: number
  mimeType?: string
  errorMessage?: string
}

export interface UseImageAttachmentsOptions {
  /** Максимальное число одновременных вложений. По умолчанию 4. */
  maxCount?: number
  /**
   * Когда true — хук бездействует (вернёт early из add*),
   * это нужно, чтобы заблокировать ввод картинок для не-vision моделей.
   * Visually мы тоже скроем UI, но защитимся и здесь.
   */
  disabled?: boolean
  /** Колбэк после успешной загрузки — можно подсветить или авто-фокус. */
  onAdded?: (att: Attachment) => void
}

const ALLOWED_TYPES = Array.from(ALLOWED_MIME_TYPES)

function genId(): string {
  // crypto.randomUUID есть везде, кроме Safari < 15.4, но мы dark-theme = современный браузер
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Хук, поднимающий весь жизненный цикл "пользователь даёт файл — мы его кладём".
 *
 * Возвращает:
 * - attachments — массив для рендера
 * - readyIds — id успешных загрузок (это передаём в API)
 * - addFiles — добавить FileList/Files (из picker или drop)
 * - handlePaste — навесить на ClipboardEvent элемента ввода
 * - clear — очистить (вызывать после отправки сообщения)
 * - remove — удалить один по localId
 * - hasUploading — идёт ли сейчас загрузка (для блокировки submit)
 */
export function useImageAttachments(opts: UseImageAttachmentsOptions = {}) {
  const { maxCount = 4, disabled, onAdded } = opts
  const [attachments, setAttachments] = useState<Attachment[]>([])

  // Используем ref, чтобы внутри callback'ов всегда видеть актуальное состояние.
  // Синхронизируем в effect — нельзя писать в ref во время рендера.
  const attachmentsRef = useRef(attachments)
  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  const updateOne = useCallback((localId: string, patch: Partial<Attachment>) => {
    setAttachments((prev) =>
      prev.map((a) => (a.localId === localId ? { ...a, ...patch } : a))
    )
  }, [])

  const remove = useCallback((localId: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.localId === localId)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((a) => a.localId !== localId)
    })
  }, [])

  const clear = useCallback(() => {
    setAttachments((prev) => {
      for (const a of prev) URL.revokeObjectURL(a.previewUrl)
      return []
    })
  }, [])

  // Чистим object URLs при размонтировании, чтобы не текло
  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) URL.revokeObjectURL(a.previewUrl)
    }
  }, [])

  /** Загружает один файл и обновляет соответствующий локальный элемент. */
  const uploadOne = useCallback(
    async (file: File, localId: string, source: string) => {
      const fd = new FormData()
      fd.append("file", file, file.name || "upload")
      fd.append("source", source)
      try {
        const res = await fetch("/api/uploads", { method: "POST", body: fd })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          const msg = err.error || `Сервер вернул ${res.status}`
          updateOne(localId, { status: "error", errorMessage: msg })
          toast.error("Не удалось загрузить", { description: msg })
          return
        }
        const data = (await res.json()) as {
          id: string
          width: number
          height: number
          mimeType: string
        }
        updateOne(localId, {
          status: "ready",
          serverId: data.id,
          width: data.width,
          height: data.height,
          mimeType: data.mimeType,
        })
        if (onAdded) {
          const updated = attachmentsRef.current.find((a) => a.localId === localId)
          if (updated) onAdded({ ...updated, ...data, status: "ready", serverId: data.id })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "сетевая ошибка"
        updateOne(localId, { status: "error", errorMessage: msg })
        toast.error("Не удалось загрузить", { description: msg })
      }
    },
    [updateOne, onAdded]
  )

  /** Добавить файлы (из picker, drag-drop, paste). */
  const addFiles = useCallback(
    (files: FileList | File[] | null | undefined, source: "paste" | "drop" | "picker" = "picker") => {
      if (disabled) {
        toast.error("Эта модель не работает с картинками")
        return
      }
      if (!files) return
      const arr = Array.from(files)
      if (arr.length === 0) return

      const currentReady = attachmentsRef.current.filter((a) => a.status !== "error").length
      const room = Math.max(0, maxCount - currentReady)
      if (room === 0) {
        toast.error(`Можно прикрепить не более ${maxCount} картинок`)
        return
      }

      const toAdd: Attachment[] = []
      for (const file of arr.slice(0, room)) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          // Уведомление точечное, не глушим обработку остальных файлов
          toast.error(`${file.name || "файл"}: формат ${file.type || "unknown"} не поддерживается`, {
            description: "PNG, JPEG, WebP, GIF",
          })
          continue
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          const mb = (file.size / 1024 / 1024).toFixed(1)
          const limitMb = MAX_UPLOAD_BYTES / 1024 / 1024
          toast.error(`${file.name || "файл"}: ${mb} МБ`, {
            description: `Лимит — ${limitMb} МБ`,
          })
          continue
        }
        const localId = genId()
        toAdd.push({
          localId,
          previewUrl: URL.createObjectURL(file),
          filename: file.name || "screenshot",
          status: "uploading",
          mimeType: file.type,
        })
      }

      if (toAdd.length === 0) return
      if (arr.length > room) {
        toast.info(`Лимит — ${maxCount} картинок. Лишние не добавлены.`)
      }

      setAttachments((prev) => [...prev, ...toAdd])

      // Параллельно грузим всё, что прошло валидацию
      toAdd.forEach((att, i) => {
        const original = arr[i]
        uploadOne(original, att.localId, source)
      })
    },
    [disabled, maxCount, uploadOne]
  )

  /**
   * Обработчик paste. Достаёт картинки из ClipboardEvent и передаёт в addFiles.
   * Не вызываем preventDefault безусловно — если пользователь паттит текст,
   * мы должны пропустить событие, чтобы он попал в textarea.
   */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLElement>) => {
      if (disabled) return
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const f = item.getAsFile()
          if (f && f.type.startsWith("image/")) files.push(f)
        }
      }
      if (files.length === 0) return
      // Есть картинки → отменяем дефолт, чтобы они не вставились в textarea как мусор
      e.preventDefault()
      addFiles(files, "paste")
    },
    [disabled, addFiles]
  )

  const readyIds = attachments
    .filter((a) => a.status === "ready" && a.serverId)
    .map((a) => a.serverId!)

  const hasUploading = attachments.some((a) => a.status === "uploading")
  const hasReady = readyIds.length > 0

  return {
    attachments,
    readyIds,
    hasUploading,
    hasReady,
    addFiles,
    handlePaste,
    remove,
    clear,
  }
}
