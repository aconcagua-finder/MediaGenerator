import { NextRequest, NextResponse } from "next/server"
import { reconcileStaleVideoJobs } from "@/lib/video/finalize"

/**
 * Cron-эндпоинт. Запускается каждые 15 минут из docker-compose cron-сервиса.
 * Доводит «зависшие» видео-задачи до терминального состояния независимо от
 * клиентского поллинга (если вкладку закрыли — задача всё равно финализируется:
 * mp4 скачается в S3 при успехе или зафиксируется ошибка при фейле провайдера).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const summary = await reconcileStaleVideoJobs()
  if (summary.swept > 0 || summary.orphanedMarked > 0) {
    console.log("[video/reconcile]", JSON.stringify(summary))
  }
  return NextResponse.json(summary)
}
