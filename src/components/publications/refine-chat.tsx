"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, MessageSquare, Send, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export interface RefineMessageItem {
  id: string
  role: "user" | "assistant"
  content: string
  postSnapshot: string | null
  createdAt: string
}

interface RefineChatProps {
  runId: string
  initialMessages: RefineMessageItem[]
  /** Колбэк когда модель вернула обновлённый пост — родитель должен подменить текст. */
  onPostUpdated: (newPost: string) => void
  /** Колбэк после изменения общей стоимости запуска. */
  onCostUpdated?: (newTotalCost: number) => void
  /** Заблокировать ввод (пайплайн ещё работает). */
  disabled?: boolean
}

const SUGGESTIONS = [
  "Сократи до 800 символов",
  "Переформулируй заголовок — сейчас слабый",
  "Добавь в конце короткий CTA",
  "Перепиши более нейтрально",
  "Сделай списком",
]

export function RefineChat({
  runId,
  initialMessages,
  onPostUpdated,
  onCostUpdated,
  disabled,
}: RefineChatProps) {
  const [messages, setMessages] = useState<RefineMessageItem[]>(initialMessages)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length])

  // Если родитель сменил runId — перезагружаем сообщения с сервера
  useEffect(() => {
    let cancelled = false
    fetch(`/api/content/runs/${runId}/refine`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { messages?: RefineMessageItem[] } | null) => {
        if (cancelled || !data?.messages) return
        setMessages(data.messages)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [runId])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setSending(true)
    // Оптимистично добавляем user message
    const tempId = `temp-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: "user",
        content: trimmed,
        postSnapshot: null,
        createdAt: new Date().toISOString(),
      },
    ])
    setInput("")
    try {
      const response = await fetch(`/api/content/runs/${runId}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      })
      const data = (await response.json()) as {
        reply?: string
        newPost?: string | null
        totalCost?: number
        error?: string
      }
      if (!response.ok) {
        toast.error(data.error || "Не удалось обработать запрос")
        // Откатываем оптимистичную запись
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        return
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `${tempId}-r`,
          role: "assistant",
          content: data.reply || "",
          postSnapshot: data.newPost || null,
          createdAt: new Date().toISOString(),
        },
      ])
      if (data.newPost) {
        onPostUpdated(data.newPost)
      }
      if (typeof data.totalCost === "number") {
        onCostUpdated?.(data.totalCost)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Сетевая ошибка")
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
      <header className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-400">
        <MessageSquare className="size-3.5" /> Чат-доработка
      </header>

      {messages.length === 0 && (
        <div className="space-y-2 py-2 text-sm text-neutral-400">
          <p>Скажи модели, что поправить в посте — и она перепишет.</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={disabled || sending}
                className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
              >
                <Sparkles className="size-3" />
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <ul className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-md border px-3 py-2 text-sm leading-relaxed",
                m.role === "user"
                  ? "ml-8 border-sky-500/30 bg-sky-500/5 text-sky-100"
                  : "mr-8 border-white/[0.06] bg-white/[0.03] text-neutral-100",
              )}
            >
              <div className="mb-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                {m.role === "user" ? "Ты" : "Редактор"}
              </div>
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
              {m.postSnapshot && (
                <div className="mt-1 text-[11px] text-emerald-300/80">
                  → пост обновлён ({m.postSnapshot.length} симв.)
                </div>
              )}
            </li>
          ))}
          <div ref={bottomRef} />
        </ul>
      )}

      <div className="flex items-end gap-2 pt-1">
        <Textarea
          rows={2}
          value={input}
          placeholder='Например: "сделай короче, до 800 символов"'
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send(input)
            }
          }}
          disabled={disabled || sending}
          className="flex-1 text-sm"
        />
        <Button onClick={() => void send(input)} disabled={disabled || sending || !input.trim()}>
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
      <p className="text-[11px] text-neutral-500">
        Cmd/Ctrl+Enter — отправить. Сообщение учитывается в общем бюджете аккаунта.
      </p>
    </div>
  )
}
