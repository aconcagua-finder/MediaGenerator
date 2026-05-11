import { listChats } from "@/lib/actions/chats"
import { ChatListSidebar } from "@/components/chat/chat-list-sidebar"

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const chats = await listChats()

  return (
    <div className="-mx-6 -mb-6 flex min-h-0 flex-1 overflow-hidden border-t border-white/[0.08] bg-black/30 backdrop-blur-sm">
      <ChatListSidebar chats={chats} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
