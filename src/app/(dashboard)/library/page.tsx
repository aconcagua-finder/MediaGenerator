import { getImages } from "@/lib/actions/images"
import { getFolders } from "@/lib/actions/folders"
import { LibraryView } from "@/components/library/library-view"

export default async function LibraryPage() {
  const [imagesResult, folders] = await Promise.all([
    getImages({ limit: 40, offset: 0 }),
    getFolders(),
  ])

  return (
    <div className="flex flex-col gap-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Библиотека</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ваши сгенерированные изображения
        </p>
      </div>

      <LibraryView
        initialImages={imagesResult.items}
        initialTotal={imagesResult.total}
        initialFolders={folders}
      />
    </div>
  )
}
