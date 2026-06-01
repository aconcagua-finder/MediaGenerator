"use client"

import { useState, useCallback, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Download, Trash2, Volume2, VolumeX, Film } from "lucide-react"
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
import { getVideos, deleteVideos, type VideoLibraryItem } from "@/lib/actions/videos"

interface VideoLibraryProps {
  initialVideos: VideoLibraryItem[]
  initialTotal: number
}

export function VideoLibrary({ initialVideos, initialTotal }: VideoLibraryProps) {
  const [videos, setVideos] = useState(initialVideos)
  const [total, setTotal] = useState(initialTotal)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const refresh = useCallback(async () => {
    const result = await getVideos({})
    setVideos(result.items)
    setTotal(result.total)
  }, [])

  function handleDelete() {
    if (!deleteId) return
    const id = deleteId
    startTransition(async () => {
      await deleteVideos([id])
      toast.success("Видео удалено")
      setDeleteId(null)
      await refresh()
    })
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-white/[0.12] py-16 text-center">
        <Film className="size-8 text-neutral-600" />
        <p className="text-sm text-neutral-500">Здесь появятся ваши видео</p>
        <Link
          href="/video"
          className="rounded-full bg-x-blue px-4 py-1.5 text-sm font-bold text-white transition-colors hover:bg-x-blue-hover"
        >
          Сгенерировать видео
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => {
          const aspect =
            v.width && v.height ? `${v.width} / ${v.height}` : "16 / 9"
          return (
            <div
              key={v.id}
              className="group overflow-hidden rounded-lg border border-white/[0.12] bg-white/[0.02]"
            >
              <video
                src={`/api/videos/${v.id}`}
                controls
                preload="metadata"
                playsInline
                className="w-full bg-black"
                style={{ aspectRatio: aspect }}
              />
              <div className="flex items-center gap-2 px-3 py-2">
                <p
                  className="min-w-0 flex-1 truncate text-xs text-neutral-400"
                  title={v.generation.prompt}
                >
                  {v.generation.prompt}
                </p>
                {v.durationSeconds != null && (
                  <span className="shrink-0 text-[11px] text-neutral-500">
                    {v.durationSeconds}с
                  </span>
                )}
                {v.hasAudio ? (
                  <Volume2 className="size-3.5 shrink-0 text-neutral-500" />
                ) : (
                  <VolumeX className="size-3.5 shrink-0 text-neutral-600" />
                )}
                <a
                  href={`/api/videos/${v.id}`}
                  download={`video-${v.id}.mp4`}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white transition-colors hover:bg-x-blue"
                  title="Скачать"
                  aria-label="Скачать"
                >
                  <Download className="size-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setDeleteId(v.id)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-neutral-400 transition-colors hover:bg-red-500/80 hover:text-white"
                  title="Удалить"
                  aria-label="Удалить"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {total > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Показано {videos.length} из {total}
        </p>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить видео?</AlertDialogTitle>
            <AlertDialogDescription>
              Видео будет удалено безвозвратно. Это действие нельзя отменить.
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
    </>
  )
}
