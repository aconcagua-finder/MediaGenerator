import { Loader2 } from "lucide-react"

export default function DashboardLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  )
}
