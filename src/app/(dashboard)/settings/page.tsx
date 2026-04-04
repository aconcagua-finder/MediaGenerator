import { SettingsIcon } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <SettingsIcon className="mx-auto size-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Настройки</h1>
        <p className="mt-2 text-muted-foreground">
          Здесь будут API ключи и настройки
        </p>
      </div>
    </div>
  )
}
