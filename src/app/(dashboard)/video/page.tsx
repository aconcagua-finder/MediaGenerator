import { getApiKeys } from "@/lib/actions/api-keys"
import { VideoForm } from "@/components/video/video-form"

export default async function VideoPage() {
  const keys = await getApiKeys()
  const hasOpenRouterKey = keys.some((k) => k.provider === "openrouter" && k.isActive)

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-xl font-bold text-white">Видео</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Генерация видео из текста или из картинки. Все модели — через OpenRouter, тем же ключом.
          Готовый клип можно сразу посмотреть и скачать.
        </p>
      </div>

      <VideoForm hasOpenRouterKey={hasOpenRouterKey} />
    </div>
  )
}
