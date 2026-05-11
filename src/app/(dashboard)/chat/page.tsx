import { MessageSquare } from "lucide-react"

export default function ChatIndexPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 rounded-2xl bg-x-blue/10 p-4">
        <MessageSquare className="size-8 text-x-blue" />
      </div>
      <h1 className="mb-2 text-xl font-bold text-white">Чат с нейросетями</h1>
      <p className="max-w-md text-sm text-neutral-500">
        Работайте с текстом через топовые модели — Claude, GPT, Gemini, Grok. Один интерфейс,
        умные настройки, удобный копирайтинг. Создайте новый чат слева.
      </p>
    </div>
  )
}
