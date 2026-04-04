import { getGenerations } from "@/lib/actions/generations"
import { HistoryView } from "@/components/history/history-view"

export default async function HistoryPage() {
  const result = await getGenerations({ limit: 20, offset: 0 })

  // Собираем уникальных провайдеров из генераций
  const providers = [...new Set(result.items.map((g) => g.provider))]

  return (
    <div className="flex flex-col gap-6 py-6">
      <div>
        <h1 className="text-xl font-bold text-white">История</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Все ваши генерации изображений
        </p>
      </div>

      <HistoryView
        initialGenerations={result.items}
        initialTotal={result.total}
        providers={providers}
      />
    </div>
  )
}
