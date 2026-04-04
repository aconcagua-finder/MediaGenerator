import { getApiKeys } from "@/lib/actions/api-keys"
import { ApiKeyForm } from "@/components/settings/api-key-form"

export default async function SettingsPage() {
  const keys = await getApiKeys()

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Настройки</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Управление API ключами для провайдеров генерации изображений
        </p>
      </div>

      <ApiKeyForm initialKeys={keys} />
    </div>
  )
}
