import type { SourceKind } from "./source-limits"

/**
 * Клиентская загрузка исходного файла в `POST /api/video/source` через XHR
 * (fetch не умеет прогресс загрузки). Тело — сырой файл, имя — в query.
 */

export interface UploadedSource {
  id: string
  kind: SourceKind
  durationSeconds: number
  width: number | null
  height: number | null
  hasAudio: boolean
  sizeBytes: number
}

export function uploadSourceFile(
  file: File,
  kind: SourceKind,
  onProgress?: (fraction: number) => void,
): { promise: Promise<UploadedSource>; abort: () => void } {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<UploadedSource>((resolve, reject) => {
    xhr.open("POST", `/api/video/source?kind=${kind}&name=${encodeURIComponent(file.name)}`)
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        // не JSON — покажем общую ошибку ниже
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as unknown as UploadedSource)
      } else {
        const fallback =
          xhr.status === 413
            ? "Файл слишком большой"
            : xhr.status === 401
              ? "Сессия истекла — войдите заново"
              : `Ошибка загрузки (${xhr.status})`
        reject(new Error(typeof data.error === "string" ? data.error : fallback))
      }
    }
    xhr.onerror = () => reject(new Error("Сетевая ошибка при загрузке файла"))
    xhr.onabort = () => reject(new Error("Загрузка отменена"))
    xhr.send(file)
  })
  return { promise, abort: () => xhr.abort() }
}

/** Метаданные файла в браузере: длительность и размер кадра (для быстрой проверки до загрузки) */
export function readMediaMeta(
  file: File,
  kind: SourceKind,
): Promise<{ durationSeconds: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement(kind === "video" ? "video" : "audio")
    el.preload = "metadata"
    const done = () => URL.revokeObjectURL(url)
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement
      resolve({
        durationSeconds: el.duration,
        width: kind === "video" ? v.videoWidth : 0,
        height: kind === "video" ? v.videoHeight : 0,
      })
      done()
    }
    el.onerror = () => {
      done()
      reject(new Error("Браузер не смог прочитать файл. Проверьте, что это mp4, mov или webm."))
    }
    el.src = url
  })
}
