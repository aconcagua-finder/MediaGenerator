import { SparklesIcon } from "lucide-react"

export default function GeneratePage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <SparklesIcon className="mx-auto size-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Генерация</h1>
        <p className="mt-2 text-muted-foreground">
          Здесь будет интерфейс генерации изображений
        </p>
      </div>
    </div>
  )
}
