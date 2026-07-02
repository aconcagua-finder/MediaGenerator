"use client"

import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { applyChannelDraft } from "@/lib/actions/content"
import type { ChannelFull } from "./rubrics-editor"
import type {
  ContentRubricPrompts,
  ContentRubricSettings,
} from "@/lib/db/schema"

interface ChannelAssistantDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Колбэк после успешного создания: канал и список созданных рубрик. */
  onCreated: (channel: ChannelFull, rubrics: unknown[]) => void
}

const SAMPLES = [
  "Канал про криптовалюты для DeFi-энтузиастов: новости проектов, разборы протоколов, аналитика рынка",
  "Корпоративный блог IT-агентства: кейсы клиентов, технические разборы, новости индустрии",
  "Личный блог тренера по плаванию: тренировочные программы, разбор техники, психология подготовки",
  "Канал по налогам для самозанятых: новости ФНС, разборы судебной практики, чек-листы",
]

export function ChannelAssistantDialog({
  open,
  onOpenChange,
  onCreated,
}: ChannelAssistantDialogProps) {
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<"input" | "preview">("input")
  interface DraftShape {
    channel: {
      slug: string
      title: string
      description: string
      icon: string
      voiceProfile: string
      defaultSettings: ContentRubricSettings
    }
    rubrics: Array<{
      slug: string
      title: string
      description: string
      settingsOverride?: Partial<ContentRubricSettings>
      prompts: ContentRubricPrompts
    }>
    rationale: string
  }
  const [draft, setDraft] = useState<DraftShape | null>(null)

  const generate = async () => {
    if (!description.trim()) {
      toast.error("Опиши канал — пара фраз о тематике и аудитории")
      return
    }
    setBusy(true)
    try {
      const response = await fetch("/api/content/channels/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      })
      const data = (await response.json()) as {
        draft?: DraftShape
        error?: string
      }
      if (!response.ok || !data.draft) {
        toast.error(data.error || "Не удалось собрать канал")
        return
      }
      setDraft(data.draft)
      setStage("preview")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Сетевая ошибка")
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const result = await applyChannelDraft(draft)
      toast.success(`Канал «${result.channel.title}» создан`, {
        description: `${result.rubrics.length} рубрик внутри. Проверь и подкорректируй.`,
      })
      onCreated(
        {
          id: result.channel.id,
          slug: result.channel.slug,
          title: result.channel.title,
          description: result.channel.description || "",
          icon: result.channel.icon,
          defaultSettings: result.channel.defaultSettings,
          voiceProfile: result.channel.voiceProfile || "",
          isActive: result.channel.isActive,
        },
        result.rubrics,
      )
      // Сбрасываем состояние диалога
      setDescription("")
      setDraft(null)
      setStage("input")
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось применить")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return
        if (!v) {
          setStage("input")
          setDraft(null)
        }
        onOpenChange(v)
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="size-4 text-amber-300" />
              Ассистент канала
            </span>
          </DialogTitle>
        </DialogHeader>

        {stage === "input" && (
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <p className="text-sm text-neutral-400">
              Опиши канал в одном-двух предложениях: тематика, аудитория, площадка, стиль.
              Модель соберёт канал и 3-5 рубрик с готовыми промптами и доменами.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="channel-desc">Описание канала</Label>
              <Textarea
                id="channel-desc"
                rows={5}
                value={description}
                placeholder="Например: SMM-канал про маркетплейсы для селлеров. Telegram, посты до 1500 знаков, без эмодзи в тексте."
                onChange={(e) => setDescription(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs text-neutral-500">Шаблоны:</div>
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
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Закрыть
              </Button>
              <Button onClick={() => void generate()} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 size-3.5" />
                )}
                Сгенерить
              </Button>
            </div>
          </div>
        )}

        {stage === "preview" && draft && (
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="rounded-md border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{draft.channel.icon || "📡"}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">
                    {draft.channel.title}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    slug: <code>{draft.channel.slug}</code>
                  </div>
                </div>
              </div>
              {draft.channel.description && (
                <p className="mt-2 text-sm text-neutral-300">{draft.channel.description}</p>
              )}
              {draft.channel.voiceProfile && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-neutral-400">
                    Стилевой профиль (voice)
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">
                    {draft.channel.voiceProfile}
                  </p>
                </details>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-neutral-400">
                Рубрики в канале ({draft.rubrics.length})
              </div>
              <ul className="space-y-2">
                {draft.rubrics.map((r) => (
                  <li
                    key={r.slug}
                    className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2.5"
                  >
                    <div className="text-sm font-medium text-neutral-100">{r.title}</div>
                    <div className="text-[11px] text-neutral-500">
                      slug: <code>{r.slug}</code>
                    </div>
                    {r.description && (
                      <p className="mt-1 text-xs leading-snug text-neutral-400">
                        {r.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {draft.rationale && (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs text-emerald-200">
                <span className="font-medium">Что собрал:</span> {draft.rationale}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => {
                  setStage("input")
                  setDraft(null)
                }}
                disabled={busy}
              >
                Назад
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                  Закрыть
                </Button>
                <Button onClick={() => void apply()} disabled={busy}>
                  {busy ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 size-3.5" />
                  )}
                  Создать канал и рубрики
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
