"use client"

import { useEffect } from "react"
import { AlertCircle, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[Dashboard Error]", error)
  }, [error])

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="max-w-md">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="mx-auto mb-4 size-12 text-destructive" />
          <h2 className="text-lg font-semibold">Что-то пошло не так</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error.message || "Произошла непредвиденная ошибка"}
          </p>
          {error.digest && (
            <p className="mt-1 text-xs text-muted-foreground">
              Код ошибки: {error.digest}
            </p>
          )}
          <Button onClick={reset} className="mt-4">
            <RotateCw className="mr-2 size-4" />
            Попробовать снова
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
