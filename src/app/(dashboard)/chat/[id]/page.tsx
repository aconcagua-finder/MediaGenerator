import { notFound } from "next/navigation"
import { getChat } from "@/lib/actions/chats"
import { getApiKeys } from "@/lib/actions/api-keys"
import { ChatShell } from "@/components/chat/chat-shell"

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getChat(id)
  if (!data) notFound()

  const keys = await getApiKeys()
  const hasOpenRouterKey = keys.some((k) => k.provider === "openrouter" && k.isActive)

  return (
    <ChatShell
      chat={{
        id: data.chat.id,
        title: data.chat.title,
        model: data.chat.model,
        systemPrompt: data.chat.systemPrompt,
        settings: (data.chat.settings as Record<string, unknown>) || null,
      }}
      initialMessages={data.messages}
      hasOpenRouterKey={hasOpenRouterKey}
    />
  )
}
