"use client"

import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type {
  ContentRubricPrompts,
  ContentRubricSettings,
} from "@/lib/db/schema"

interface RubricAssistantDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (draft: {
    slug: string
    title: string
    description: string
    collection: string | null
    settings: ContentRubricSettings
    prompts: ContentRubricPrompts
  }) => void
}

const SAMPLES = [
  "Дайджест новостей маркетинга и SMM за неделю, для контент-менеджеров и маркетологов",
  "Разбор апдейтов налогового кодекса РФ для бухгалтеров",
  "Новости про электромобили и аккумуляторные технологии для энтузиастов и инвесторов",
  "Обзоры IT-вакансий, зарплат и тенденций рынка для разработчиков и тимлидов",
]

export function RubricAssistantDialog({
  open,
  onOpenChange,
  onApply,
}: RubricAssistantDialogProps) {
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [rationale, setRationale] = useState("")

  const submit = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) {
      toast.error("Опиши, какую рубрику хочешь")
      return
    }
    setBusy(true)
    setRationale("")
    try {
      const response = await fetch("/api/content/rubrics/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed }),
      })
      const data = (await response.json()) as {
        draft?: {
          slug: string
          title: string
          description: string
          collection?: string | null
          settings: ContentRubricSettings
          prompts: ContentRubricPrompts
          rationale: string
        }
        error?: string
      }
      if (!response.ok || !data.draft) {
        toast.error(data.error || "Ассистент не смог собрать рубрику")
        return
      }
      setRationale(data.draft.rationale || "")
      onApply({
        slug: data.draft.slug,
        title: data.draft.title,
        description: data.draft.description,
        collection: data.draft.collection || null,
        settings: data.draft.settings,
        prompts: data.draft.prompts,
      })
      toast.success("Черновик готов", {
        description: "Проверь и подкорректируй поля перед сохранением.",
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Сетевая ошибка")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="size-4 text-amber-300" />
              Ассистент рубрики
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-neutral-400">
            Опиши на русском, какую рубрику ты хочешь — тематика, аудитория, формат, источники.
            Модель подберёт домены поиска, дефолтные параметры и составит промпты.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="rubric-desc">Описание рубрики</Label>
            <Textarea
              id="rubric-desc"
              rows={5}
              value={description}
              placeholder="Например: SMM-дайджест по новостям e-commerce для маркетплейс-селлеров, формат Telegram, длина 1500 символов."
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-neutral-500">Быстрые шаблоны:</div>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDescription(s)}
                  disabled={busy}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {rationale && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200">
              <span className="font-medium">Что собрали:</span> {rationale}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Закрыть
            </Button>
            <Button onClick={() => void submit(description)} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-3.5" />
              )}
              Сгенерить черновик
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
