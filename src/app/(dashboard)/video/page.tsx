import Link from "next/link"
import { Scissors } from "lucide-react"
import { getApiKeys } from "@/lib/actions/api-keys"
import { getSession } from "@/lib/auth-server"
import { hasActiveProviderKey } from "@/lib/provider-keys"
import { VideoForm } from "@/components/video/video-form"

export default async function VideoPage() {
  const keys = await getApiKeys()
  const hasOpenRouterKey = keys.some((k) => k.provider === "openrouter" && k.isActive)
  const session = await getSession()
  // fal.ai-функции (Kling Motion Control, замена голоса) видны только при активном ключе
  const hasFalKey = session?.user ? await hasActiveProviderKey(session.user.id, "fal") : false

  return (
    <div className="space-y-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Видео</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Генерация видео из текста или из картинки, а также режим «Видео → видео»: замена персонажа, одежды
            или обстановки в вашем ролике с сохранением движений. Модели — через OpenRouter, тем же ключом.
            Готовый клип можно сразу посмотреть и скачать.
          </p>
        </div>
        <Link
          href="/video/editor"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.02] px-4 text-sm font-medium text-neutral-300 transition-colors hover:border-x-blue/40 hover:text-white"
        >
          <Scissors className="size-4" />
          Редактор склейки
        </Link>
      </div>

      <VideoForm hasOpenRouterKey={hasOpenRouterKey} hasFalKey={hasFalKey} />
    </div>
  )
}
