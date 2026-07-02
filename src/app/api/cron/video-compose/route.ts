import { NextRequest, NextResponse } from "next/server"
import { reconcileStaleCompositions } from "@/lib/video/compose"

/**
 * Cron-эндпоинт. Запускается каждые 15 минут из docker-compose cron-сервиса.
 * Добивает зависшие склейки (перезапускает прерванные processing, помечает
 * ошибкой зависшие saving) и чистит осиротевшие /tmp-папки. Страховка на случай
 * смерти контейнера посреди рендера — внешнего провайдера для re-poll тут нет.
 *
 * ❗ Добавление этой строки в cron-команду требует `--force-recreate cron`
 * (см. CLAUDE.md, правило мониторинга #12).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const summary = await reconcileStaleCompositions()
  if (summary.resumed > 0 || summary.failedStale > 0 || summary.cleanedTemp > 0) {
    console.log("[video/compose-reconcile]", JSON.stringify(summary))
  }
  return NextResponse.json(summary)
}
