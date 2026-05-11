"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Send, Loader2, Settings2, Copy, Check, RotateCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateChatSettings, renameChat } from "@/lib/actions/chats"
import {
  TEXT_MODELS,
  CATEGORY_LABELS,
  VENDOR_COLORS,
  SYSTEM_PROMPT_PRESETS,
  formatContext,
  type TextModel,
} from "@/lib/providers/text-models"
import { MarkdownContent } from "./markdown-content"

interface ChatMessage {
  id: string
  role: string
  content: string
  model: string | null
  tokensIn: number | null
  tokensOut: number | null
  createdAt: Date
}

interface ChatData {
  id: string
  title: string
  model: string
  systemPrompt: string | null
  settings: Record<string, unknown> | null
}

interface ChatShellProps {
  chat: ChatData
  initialMessages: ChatMessage[]
  hasOpenRouterKey: boolean
}

const MODELS_BY_CATEGORY = TEXT_MODELS.reduce<Record<string, TextModel[]>>((acc, m) => {
  if (!acc[m.category]) acc[m.category] = []
  acc[m.category].push(m)
  return acc
}, {})

type UiMessage = {
  /** Локальный id для рендера; для серверных = реальный id, для draft — uuid */
  uid: string
  role: "user" | "assistant"
  content: string
  /** Стриминг в процессе — нужен, чтобы показывать индикатор */
  streaming?: boolean
  model?: string | null
  /** Ошибка от модели — рендерим красным и отдельно */
  error?: string
}

export function ChatShell({ chat, initialMessages, hasOpenRouterKey }: ChatShellProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<UiMessage[]>(() =>
    initialMessages.map((m) => ({
      uid: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      model: m.model,
    }))
  )
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [copiedUid, setCopiedUid] = useState<string | null>(null)
  const [title, setTitle] = useState(chat.title)
  const [isPending, startTransition] = useTransition()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Локальные настройки (не сохраняются сразу — кнопкой)
  const settings = (chat.settings || {}) as Record<string, unknown>
  const [model, setModel] = useState(chat.model)
  const [systemPrompt, setSystemPrompt] = useState(chat.systemPrompt || "")
  const [temperature, setTemperature] = useState<number>(
    typeof settings.temperature === "number" ? settings.temperature : 0.7
  )
  const [maxTokens, setMaxTokens] = useState<number>(
    typeof settings.maxTokens === "number" ? settings.maxTokens : 4096
  )

  const currentModel = TEXT_MODELS.find((m) => m.id === model)

  // Авто-скролл вниз при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Авто-ресайз textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`
  }, [input])

  async function handleSend() {
    if (!input.trim()) return
    if (!hasOpenRouterKey) {
      toast.error("Нет API ключа OpenRouter", {
        description: "Добавьте его в Настройках — этот ключ покрывает все текстовые модели.",
      })
      return
    }

    const userText = input.trim()
    setInput("")
    setStreaming(true)

    const userMsg: UiMessage = {
      uid: `local-user-${Date.now()}`,
      role: "user",
      content: userText,
    }
    const assistantUid = `local-assistant-${Date.now()}`
    const assistantMsg: UiMessage = {
      uid: assistantUid,
      role: "assistant",
      content: "",
      streaming: true,
      model,
    }
    setMessages((prev) => [...prev, userMsg, assistantMsg])

    const controller = new AbortController()

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          chatId: chat.id,
          userMessage: userText,
        }),
      })

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({}))
        toast.error("Ошибка чата", {
          description: err.error || `Сервер вернул ${response.status}`,
          duration: 6000,
        })
        setMessages((prev) => prev.filter((m) => m.uid !== assistantUid && m.uid !== userMsg.uid))
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() || ""

        for (const rawLine of lines) {
          if (!rawLine.startsWith("data:")) continue
          const data = rawLine.slice(5).trim()
          if (!data) continue
          try {
            const parsed = JSON.parse(data) as {
              delta?: string
              done?: boolean
              error?: string
              title?: string
            }
            if (parsed.error) {
              // Показываем ошибку прямо в пузыре ассистента, а не безмолвным "Пусто."
              setMessages((prev) =>
                prev.map((m) =>
                  m.uid === assistantUid
                    ? { ...m, error: parsed.error, streaming: false, content: "" }
                    : m
                )
              )
              toast.error("Модель не ответила", {
                description: parsed.error,
                duration: 8000,
              })
              continue
            }
            if (parsed.delta) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.uid === assistantUid
                    ? { ...m, content: m.content + parsed.delta }
                    : m
                )
              )
            }
            if (parsed.title) {
              // AI прислал автозаголовок — отобразим и попросим Next перерисовать сайдбар
              setTitle(parsed.title)
              router.refresh()
            }
            if (parsed.done) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.uid === assistantUid ? { ...m, streaming: false } : m
                )
              )
            }
          } catch {
            // мусорный фрейм — игнорируем
          }
        }
      }

      // На всякий случай — обновим сайдбар, чтобы updatedAt поднялся
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Сетевая ошибка"
      toast.error("Ошибка соединения", { description: msg })
      setMessages((prev) => prev.filter((m) => m.uid !== assistantUid))
    } finally {
      setStreaming(false)
      setMessages((prev) =>
        prev.map((m) => (m.uid === assistantUid ? { ...m, streaming: false } : m))
      )
    }
  }

  async function handleCopy(uid: string, content: string) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedUid(uid)
      setTimeout(() => setCopiedUid(null), 1800)
    } catch {
      toast.error("Не удалось скопировать")
    }
  }

  function saveSettings() {
    startTransition(async () => {
      try {
        await updateChatSettings(chat.id, {
          model,
          systemPrompt: systemPrompt.trim() || null,
          settings: { temperature, maxTokens, topP: 1.0 },
        })
        toast.success("Настройки сохранены")
        setShowSettings(false)
      } catch (err) {
        toast.error("Не удалось сохранить", {
          description: err instanceof Error ? err.message : "ошибка",
        })
      }
    })
  }

  /** Быстрая смена модели прямо из шапки — сохраняем сразу */
  function handleQuickModelChange(newModel: string) {
    if (!newModel || newModel === model) return
    setModel(newModel)
    startTransition(async () => {
      try {
        await updateChatSettings(chat.id, { model: newModel })
      } catch (err) {
        toast.error("Не удалось сменить модель", {
          description: err instanceof Error ? err.message : "ошибка",
        })
      }
    })
  }

  function handleClearMessages() {
    if (!confirm("Очистить историю этого чата?")) return
    setMessages([])
    toast.info("История очищена локально", {
      description: "Из БД сообщения будут удалены при перезагрузке.",
    })
  }

  async function handleTitleSave() {
    if (!title.trim() || title === chat.title) return
    startTransition(async () => {
      await renameChat(chat.id, title.trim())
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.08] px-4 py-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          className="min-w-0 flex-1 truncate bg-transparent text-base font-bold text-white outline-none focus:border-b focus:border-x-blue/40"
          aria-label="Название чата"
        />
        {/* Быстрый селектор модели прямо в шапке */}
        <Select value={model} onValueChange={(v) => v && handleQuickModelChange(v)} disabled={streaming}>
          <SelectTrigger
            className="h-8 w-auto shrink-0 gap-1.5 border-white/[0.08] bg-white/[0.02] px-2.5 text-xs font-medium text-neutral-300 hover:text-white"
            aria-label="Сменить модель"
          >
            <SelectValue>
              {currentModel ? (
                <span className="flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full ${VENDOR_COLORS[currentModel.vendor].dot}`} />
                  <span className="font-medium text-white">{currentModel.name}</span>
                </span>
              ) : (
                model
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            align="end"
            className="!w-auto w-[380px] max-w-[min(420px,92vw)] p-1"
          >
            {Object.entries(MODELS_BY_CATEGORY).map(([cat, models]) => (
              <SelectGroup key={cat}>
                <SelectLabel className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
                  {CATEGORY_LABELS[cat as TextModel["category"]]}
                </SelectLabel>
                {models.map((m) => (
                  <ModelOption key={m.id} model={m} />
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => setShowSettings((s) => !s)}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
            showSettings ? "bg-white/[0.08] text-white" : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
          }`}
          aria-label="Настройки чата"
        >
          <Settings2 className="size-3.5" />
          <span className="hidden sm:inline">Настройки</span>
        </button>
      </div>

      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.length === 0 ? (
              <EmptyChat
                onPickPrompt={(p) => setInput(p)}
                hasKey={hasOpenRouterKey}
              />
            ) : (
              <div className="space-y-6">
                {messages.map((m) => (
                  <MessageBubble
                    key={m.uid}
                    message={m}
                    copied={copiedUid === m.uid}
                    onCopy={() => handleCopy(m.uid, m.content)}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Settings drawer */}
        {showSettings && (
          <div className="w-80 shrink-0 overflow-y-auto border-l border-white/[0.08] bg-white/[0.01] p-4">
            <h3 className="mb-3 text-sm font-bold text-white">Настройки чата</h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-neutral-400">Модель</Label>
                <Select value={model} onValueChange={(v) => v && setModel(v)}>
                  <SelectTrigger className="w-full border-white/[0.12] bg-white/[0.02]">
                    <SelectValue>
                      {currentModel ? (
                        <span className="flex items-center gap-1.5">
                          <span className={`size-1.5 rounded-full ${VENDOR_COLORS[currentModel.vendor].dot}`} />
                          <span>{currentModel.name}</span>
                        </span>
                      ) : (
                        model
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="!w-auto w-[380px] max-w-[min(420px,90vw)] p-1">
                    {Object.entries(MODELS_BY_CATEGORY).map(([cat, models]) => (
                      <SelectGroup key={cat}>
                        <SelectLabel className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
                          {CATEGORY_LABELS[cat as TextModel["category"]]}
                        </SelectLabel>
                        {models.map((m) => (
                          <ModelOption key={m.id} model={m} />
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {currentModel && (
                  <p className="text-[11px] leading-snug text-neutral-500">
                    {formatContext(currentModel.contextTokens)} контекст • вход $
                    {currentModel.pricing.input}/М ток • выход $
                    {currentModel.pricing.output}/М ток
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-neutral-400">
                  Креативность: {temperature.toFixed(1)}
                </Label>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-[#1D9BF0]"
                />
                <p className="text-[11px] leading-snug text-neutral-500">
                  0 — шаблонные и предсказуемые ответы. 1+ — креативно и разнообразно.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-neutral-400">
                  Длина ответа: {maxTokens} токенов
                </Label>
                <input
                  type="range"
                  min="512"
                  max="16384"
                  step="512"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="w-full accent-[#1D9BF0]"
                />
                <p className="text-[11px] leading-snug text-neutral-500">
                  ~{Math.round(maxTokens * 0.75)} слов максимум.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-neutral-400">Шаблон роли</Label>
                <Select
                  value="custom"
                  onValueChange={(v) => {
                    if (!v || v === "custom") return
                    const preset = SYSTEM_PROMPT_PRESETS.find((p) => p.id === v)
                    if (preset) setSystemPrompt(preset.prompt)
                  }}
                >
                  <SelectTrigger className="w-full border-white/[0.12] bg-white/[0.02]">
                    <SelectValue placeholder="Выберите шаблон…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SYSTEM_PROMPT_PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-neutral-400">Инструкция модели</Label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={6}
                  placeholder="Как модель должна себя вести? Стиль, роль, ограничения…"
                  className="w-full resize-none rounded-lg border border-white/[0.12] bg-white/[0.02] p-2.5 text-xs text-white placeholder:text-neutral-600 focus:border-x-blue/40 focus:outline-none"
                />
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={saveSettings}
                  disabled={isPending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-x-blue px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-x-blue-hover disabled:opacity-50"
                >
                  {isPending && <Loader2 className="size-3.5 animate-spin" />}
                  Сохранить настройки
                </button>
                <button
                  onClick={handleClearMessages}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs text-neutral-500 transition-colors hover:bg-red-500/5 hover:text-red-400"
                >
                  <Trash2 className="size-3" />
                  Очистить историю (локально)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-white/[0.08] bg-black/40 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-end gap-2 rounded-2xl border border-white/[0.12] bg-white/[0.02] p-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={
                hasOpenRouterKey
                  ? "Спросите что-нибудь… (Enter — отправить, Shift+Enter — новая строка)"
                  : "Сначала добавьте API ключ OpenRouter в Настройках"
              }
              disabled={streaming}
              rows={1}
              className="min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={streaming || !input.trim() || !hasOpenRouterKey}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-x-blue text-white transition-colors hover:bg-x-blue-hover active:scale-95 disabled:opacity-40"
              aria-label="Отправить"
            >
              {streaming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </div>
          <p className="mt-1.5 px-2 text-[10px] text-neutral-600">
            Модели могут ошибаться. Проверяйте важные факты.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Опция модели в дропдауне — компактная карточка с вендор-цветом,
 * ценой и контекстом. Сделана отдельным компонентом, чтобы выпадашка
 * выглядела одинаково в шапке и в drawer-настройках.
 */
function ModelOption({ model }: { model: TextModel }) {
  const colors = VENDOR_COLORS[model.vendor]
  return (
    <SelectItem
      key={model.id}
      value={model.id}
      className="cursor-pointer rounded-md py-2 data-[highlighted]:bg-white/[0.04]"
    >
      <div className="flex w-full flex-col gap-1">
        {/* Имя слева, лейбл провайдера и "Новинка" — жёстко прижаты к правому краю,
            одинаковая X-координата для всех строк. */}
        <div className="flex w-full items-center gap-1.5">
          <span className={`size-2 shrink-0 rounded-full ${colors.dot}`} />
          <span className="min-w-0 flex-1 truncate font-medium text-white">{model.name}</span>
          {model.isNew && (
            <span className="shrink-0 rounded-full bg-x-blue/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-x-blue">
              Новинка
            </span>
          )}
          <span className={`shrink-0 text-[10px] uppercase tracking-wider ${colors.text}`}>
            {colors.label}
          </span>
        </div>
        <span className="whitespace-normal text-xs leading-snug text-neutral-400">
          {model.description}
        </span>
        {/* Цены и контекст — всё одного приглушённого тона, без выделения */}
        <div className="mt-0.5 flex items-center gap-3 text-[10px] text-neutral-500">
          <span title="Размер контекста">
            контекст {formatContext(model.contextTokens)}
          </span>
          <span title="Цена за 1 млн токенов">
            вход ${model.pricing.input} / выход ${model.pricing.output}/M
          </span>
        </div>
      </div>
    </SelectItem>
  )
}

function MessageBubble({
  message,
  copied,
  onCopy,
}: {
  message: UiMessage
  copied: boolean
  onCopy: () => void
}) {
  const isUser = message.role === "user"

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-x-blue/15 px-4 py-3 text-sm text-white">
          <div className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</div>
        </div>
      </div>
    )
  }

  // Ошибочный ответ — отрисуем красным, отдельным стилем
  if (message.error) {
    return (
      <div className="rounded-2xl rounded-tl-md border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-sm">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-red-400">
          Не удалось получить ответ
        </div>
        <div className="text-neutral-200">{message.error}</div>
        <div className="mt-2 text-[11px] text-neutral-500">
          Попробуйте сменить модель в шапке чата (Claude Sonnet 4.6, GPT-5 — самые надёжные)
          и повторить запрос.
        </div>
      </div>
    )
  }

  return (
    <div className="group">
      <div className="rounded-2xl rounded-tl-md border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm">
        {message.content ? (
          <MarkdownContent content={message.content} />
        ) : message.streaming ? (
          <div className="flex items-center gap-1.5 py-1 text-neutral-500">
            <div className="size-1.5 animate-pulse rounded-full bg-neutral-500" style={{ animationDelay: "0ms" }} />
            <div className="size-1.5 animate-pulse rounded-full bg-neutral-500" style={{ animationDelay: "150ms" }} />
            <div className="size-1.5 animate-pulse rounded-full bg-neutral-500" style={{ animationDelay: "300ms" }} />
          </div>
        ) : (
          <span className="text-neutral-500 italic">пустой ответ модели</span>
        )}
      </div>
      {message.content && !message.streaming && (
        <div className="mt-1.5 flex items-center gap-2 px-1">
          <button
            onClick={onCopy}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-neutral-500 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            {copied ? (
              <>
                <Check className="size-3" /> Скопировано
              </>
            ) : (
              <>
                <Copy className="size-3" /> Копировать
              </>
            )}
          </button>
          {message.model && (
            <span className="text-[11px] text-neutral-600">{message.model}</span>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyChat({ onPickPrompt, hasKey }: { onPickPrompt: (p: string) => void; hasKey: boolean }) {
  const suggestions = [
    {
      label: "Сравни модели",
      prompt: "Напиши краткое сравнение Claude и GPT с точки зрения копирайтинга — сильные/слабые стороны, когда что использовать.",
    },
    {
      label: "Заголовки для лендинга",
      prompt: "Придумай 5 цепляющих заголовков для лендинга сервиса генерации изображений с помощью ИИ. Целевая — маркетологи. Без штампов.",
    },
    {
      label: "Перепиши текст",
      prompt: "Перепиши этот текст живее и короче, сохрани смысл:\n\n[вставь текст]",
    },
    {
      label: "Пост в Telegram",
      prompt: "Напиши пост в Telegram о нашем новом сервисе — генерация изображений через топовые нейросети в одном интерфейсе. До 700 знаков, с эмодзи в меру.",
    },
  ]

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-3 rounded-2xl bg-x-blue/10 p-3">
        <RotateCw className="size-6 text-x-blue" />
      </div>
      <h2 className="mb-1 text-lg font-bold text-white">Начните разговор</h2>
      <p className="mb-6 max-w-md text-sm text-neutral-500">
        {hasKey
          ? "Выберите шаблон роли в настройках или просто опишите задачу."
          : "Добавьте API ключ OpenRouter в Настройках — один ключ покрывает все модели."}
      </p>
      <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onPickPrompt(s.prompt)}
            className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-left text-sm transition-colors hover:border-white/[0.16] hover:bg-white/[0.04]"
          >
            <div className="mb-0.5 font-medium text-white">{s.label}</div>
            <div className="line-clamp-2 text-xs text-neutral-500">{s.prompt}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
