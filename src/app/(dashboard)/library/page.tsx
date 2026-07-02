import { getImages } from "@/lib/actions/images"
import { getVideos } from "@/lib/actions/videos"
import { getFolders } from "@/lib/actions/folders"
import { getApiKeys } from "@/lib/actions/api-keys"
import { LibraryTabs } from "@/components/library/library-tabs"

export default async function LibraryPage() {
  const [imagesResult, videosResult, folders, keys] = await Promise.all([
    getImages({ limit: 40, offset: 0 }),
    getVideos({ limit: 40, offset: 0 }),
    getFolders(),
    getApiKeys(),
  ])

  const hasOpenAIKey = keys.some((k) => k.provider === "openai" && k.isActive)
  const hasOpenRouterKey = keys.some((k) => k.provider === "openrouter" && k.isActive)

  return (
    <div className="flex flex-col gap-6 py-6">
      <div>
        <h1 className="text-xl font-bold text-white">Библиотека</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Ваши сгенерированные изображения и видео
        </p>
      </div>

      <LibraryTabs
        initialImages={imagesResult.items}
        initialTotal={imagesResult.total}
        initialFolders={folders}
        hasOpenAIKey={hasOpenAIKey}
        hasOpenRouterKey={hasOpenRouterKey}
        initialVideos={videosResult.items}
        initialVideoTotal={videosResult.total}
      />
    </div>
  )
}
