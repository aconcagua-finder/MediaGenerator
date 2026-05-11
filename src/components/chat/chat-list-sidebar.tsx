"use client"

import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { Plus, MessageSquare, Trash2, Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { createChat, deleteChat } from "@/lib/actions/chats"
import { toast } from "sonner"

interface ChatListItem {
  id: string
  title: string
  model: string
  updatedAt: Date
}

interface ChatListSidebarProps {
  chats: ChatListItem[]
}

const COLLAPSED_KEY = "mg_chat_sidebar_collapsed"

function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "только что"
  if (diffMin < 60) return `${diffMin} мин назад`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} ч назад`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD} дн назад`
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
}

export function ChatListSidebar({ chats }: ChatListSidebarProps) {
  const router = useRouter()
  const params = useParams() as { id?: string }
  const activeId = params.id
  const [isPending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  // initial=true чтобы при гидратации SSR не показал развёрнутый, если в LS свёрнутый —
  // на первом клиентском рендере подхватим из LS.
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSED_KEY)
    if (saved === "1") setCollapsed(true)
    setMounted(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0")
      return next
    })
  }

  async function handleNewChat() {
    setCreating(true)
    try {
      const chat = await createChat()
      router.push(`/chat/${chat.id}`)
    } catch (err) {
      toast.error("Не удалось создать чат", {
        description: err instanceof Error ? err.message : "ошибка",
      })
    } finally {
      setCreating(false)
    }
  }

  function handleDelete(id: string, title: string) {
    if (!confirm(`Удалить чат "${title}"?`)) return
    startTransition(async () => {
      try {
        await deleteChat(id)
        if (activeId === id) {
          router.push("/chat")
        }
      } catch (err) {
        toast.error("Не удалось удалить", {
          description: err instanceof Error ? err.message : "ошибка",
        })
      }
    })
  }

  // До монтирования LS — рендерим стандартный (развёрнутый) вид, чтобы не было flicker
  if (!mounted || !collapsed) {
    return (
      <aside className="flex h-full w-60 shrink-0 flex-col border-r border-white/[0.08] bg-white/[0.01]">
        <div className="flex items-center justify-between gap-1 border-b border-white/[0.08] px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Чаты
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleNewChat}
              disabled={creating}
              className="flex size-7 items-center justify-center rounded-md text-x-blue transition-colors hover:bg-x-blue/15 disabled:opacity-50"
              aria-label="Новый чат"
              title="Новый чат"
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            </button>
            <button
              onClick={toggleCollapsed}
              className="flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/[0.04] hover:text-white"
              aria-label="Свернуть список"
              title="Свернуть"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {chats.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-neutral-500">
              Нет чатов.
              <br />
              Создайте первый.
            </div>
          ) : (
            <ul className="space-y-0.5 px-2">
              {chats.map((chat) => (
                <li key={chat.id} className="group relative">
                  <Link
                    href={`/chat/${chat.id}`}
                    className={`flex items-start gap-2 rounded-lg px-2 py-2 transition-colors ${
                      activeId === chat.id
                        ? "bg-x-blue/15 text-white"
                        : "text-neutral-300 hover:bg-white/[0.04]"
                    }`}
                  >
                    <MessageSquare className="mt-0.5 size-3.5 shrink-0 opacity-60" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate pr-6 text-sm font-medium">{chat.title}</div>
                      <div className="truncate text-[10px] text-neutral-500">
                        {formatRelative(chat.updatedAt)}
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => handleDelete(chat.id, chat.title)}
                    disabled={isPending}
                    className="absolute right-1 top-1.5 rounded p-1 text-neutral-500 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    aria-label="Удалить чат"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    )
  }

  // Свёрнутый вид — тонкая полоска с иконками
  return (
    <aside className="flex h-full w-12 shrink-0 flex-col items-center border-r border-white/[0.08] bg-white/[0.01] py-3">
      <button
        onClick={toggleCollapsed}
        className="mb-2 flex size-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/[0.04] hover:text-white"
        aria-label="Развернуть список"
        title="Развернуть"
      >
        <PanelLeftOpen className="size-4" />
      </button>
      <button
        onClick={handleNewChat}
        disabled={creating}
        className="mb-2 flex size-9 items-center justify-center rounded-lg bg-x-blue text-white transition-colors hover:bg-x-blue-hover disabled:opacity-50"
        aria-label="Новый чат"
        title="Новый чат"
      >
        {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
      </button>

      <div className="mt-1 flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5">
        {chats.map((chat) => (
          <Link
            key={chat.id}
            href={`/chat/${chat.id}`}
            title={chat.title}
            className={`flex size-9 items-center justify-center rounded-lg transition-colors ${
              activeId === chat.id
                ? "bg-x-blue/15 text-white"
                : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <MessageSquare className="size-4" />
          </Link>
        ))}
      </div>
    </aside>
  )
}
