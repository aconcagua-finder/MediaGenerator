import { getActiveModels, seedModels } from "@/lib/actions/models"
import { getApiKeys } from "@/lib/actions/api-keys"
import { GenerateForm } from "@/components/generate/generate-form"

export default async function GeneratePage() {
  await seedModels()

  const [models, keys] = await Promise.all([
    getActiveModels(),
    getApiKeys(),
  ])

  const hasApiKeys: Record<string, boolean> = {}
  for (const provider of Object.keys(models)) {
    hasApiKeys[provider] = keys.some(
      (k) => k.provider === provider && k.isActive
    )
  }

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-xl font-bold text-white">Генерация</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Создавайте изображения с помощью нейросетей
        </p>
      </div>

      <GenerateForm models={models} hasApiKeys={hasApiKeys} />
    </div>
  )
}
