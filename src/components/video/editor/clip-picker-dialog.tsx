"use client"

import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { listVideosForPicker, type PickerVideo } from "@/lib/actions/videos"
import { fmtDuration } from "./types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (clips: PickerVideo[]) => void
}

export function ClipPickerDialog({ open, onOpenChange, onAdd }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Добавить клипы</DialogTitle>
        </DialogHeader>
        {/* Внутренний body монтируется заново при каждом открытии → свежая загрузка
            и сброс выбора без setState-в-эффекте */}
        {open && <PickerBody onAdd={onAdd} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function PickerBody({
  onAdd,
  onCancel,
}: {
  onAdd: (clips: PickerVideo[]) => void
  onCancel: () => void
}) {
  const [clips, setClips] = useState<PickerVideo[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    listVideosForPicker(100)
      .then((rows) => alive && setClips(rows))
      .catch(() => alive && setClips([]))
    return () => {
      alive = false
    }
  }, [])

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function confirm() {
    if (!clips) return
    const byId = new Map(clips.map((c) => [c.id, c]))
    const picked = selected.map((id) => byId.get(id)).filter(Boolean) as PickerVideo[]
    if (picked.length > 0) onAdd(picked)
  }

  return (
    <>
      <div className="max-h-[55vh] overflow-y-auto">
        {clips === null ? (
          <div className="flex items-center justify-center py-16 text-neutral-500">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : clips.length === 0 ? (
          <p className="py-16 text-center text-sm text-neutral-500">
            Нет готовых видео. Сгенерируйте клипы во вкладке «Видео».
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {clips.map((c) => {
              const isSel = selected.includes(c.id)
              const order = selected.indexOf(c.id) + 1
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={`group relative overflow-hidden rounded-lg border text-left transition-all ${
                    isSel ? "border-x-blue ring-1 ring-x-blue" : "border-white/[0.1] hover:border-white/[0.25]"
                  }`}
                >
                  <video
                    src={`/api/videos/${c.id}#t=0.1`}
                    preload="metadata"
                    muted
                    playsInline
                    className="aspect-video w-full bg-black object-cover"
                  />
                  {isSel && (
                    <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-x-blue text-[10px] font-bold text-white">
                      {order}
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-3">
                    <span className="truncate text-[11px] text-white" title={c.label}>
                      {c.label}
                    </span>
                    {c.durationSeconds != null && (
                      <span className="shrink-0 text-[10px] text-neutral-300">
                        {fmtDuration(c.durationSeconds)}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="-mx-4 -mb-4 flex items-center justify-end gap-2 rounded-b-xl border-t bg-muted/50 p-4">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Отмена
        </Button>
        <Button size="sm" onClick={confirm} disabled={selected.length === 0}>
          <Check className="mr-1.5 size-4" />
          Добавить{selected.length > 0 ? ` (${selected.length})` : ""}
        </Button>
      </div>
    </>
  )
}
