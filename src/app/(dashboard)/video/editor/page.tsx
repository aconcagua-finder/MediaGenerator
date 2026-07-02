import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getPickerVideosByIds, type PickerVideo } from "@/lib/actions/videos"
import { VideoEditor } from "@/components/video/editor/video-editor"

/**
 * Редактор склейки видео. Предзаполняется клипами из `?clips=id1,id2` (например,
 * при переходе из библиотеки по кнопке «Склеить»). Можно открыть и пустым —
 * клипы добавляются кнопкой «+ Добавить».
 */
export default async function VideoEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ clips?: string }>
}) {
  const sp = await searchParams
  const ids = (sp.clips || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)

  let initialClips: PickerVideo[] = []
  if (ids.length > 0) {
    const found = await getPickerVideosByIds(ids)
    const byId = new Map(found.map((v) => [v.id, v]))
    initialClips = ids.map((id) => byId.get(id)).filter((v): v is PickerVideo => Boolean(v))
  }

  return (
    <div className="space-y-6 py-6">
      <div>
        <Link
          href="/video"
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
        >
          <ArrowLeft className="size-3.5" />
          К генерации видео
        </Link>
        <h1 className="text-xl font-bold text-white">Редактор · склейка</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Соберите несколько готовых клипов в одно видео: выберите порядок, при необходимости подрежьте.
          Готовый файл появится в библиотеке. Склейка бесплатна.
        </p>
      </div>

      <VideoEditor initialClips={initialClips} />
    </div>
  )
}
