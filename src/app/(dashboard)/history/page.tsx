import { HistoryIcon } from "lucide-react"

export default function HistoryPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <HistoryIcon className="mx-auto size-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">История</h1>
        <p className="mt-2 text-muted-foreground">
          Здесь будет история генераций
        </p>
      </div>
    </div>
  )
}
