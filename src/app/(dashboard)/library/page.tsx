import { ImagesIcon } from "lucide-react"

export default function LibraryPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <ImagesIcon className="mx-auto size-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Библиотека</h1>
        <p className="mt-2 text-muted-foreground">
          Здесь будут ваши сгенерированные изображения
        </p>
      </div>
    </div>
  )
}
