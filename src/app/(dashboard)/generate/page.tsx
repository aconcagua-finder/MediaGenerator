import { getActiveModels, seedModels } from "@/lib/actions/models"
import { getApiKeys } from "@/lib/actions/api-keys"
import { GenerateForm } from "@/components/generate/generate-form"

export default async function GeneratePage() {
  // Seed моделей при первом запуске
  await seedModels()

  const [models, keys] = await Promise.all([
    getActiveModels(),
    getApiKeys(),
  ])

  // Формируем map: provider -> есть ли ключ
  const hasApiKeys: Record<string, boolean> = {}
  for (const provider of Object.keys(models)) {
    hasApiKeys[provider] = keys.some(
      (k) => k.provider === provider && k.isActive
    )
  }

  return (
    <div className="space-y-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Генерация</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Создавайте изображения с помощью нейросетей
        </p>
      </div>

      <GenerateForm models={models} hasApiKeys={hasApiKeys} />
    </div>
  )
}
