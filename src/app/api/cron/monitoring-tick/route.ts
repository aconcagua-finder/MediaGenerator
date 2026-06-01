import { NextRequest, NextResponse } from "next/server"
import { and, eq, lte, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { monitoringRuns, monitoringTemplates } from "@/lib/db/schema/monitoring"
import { safeRunPipeline } from "@/lib/monitoring/pipeline"

/**
 * Cron-эндпоинт. Запускается каждые 15 минут из docker-compose cron-сервиса.
 * Находит все активные шаблоны с включённым расписанием, у которых next_run_at <= now(),
 * и стартует для них новые runs.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const due = await db
    .select()
    .from(monitoringTemplates)
    .where(
      and(
        eq(monitoringTemplates.isActive, true),
        isNotNull(monitoringTemplates.nextRunAt),
        lte(monitoringTemplates.nextRunAt, now),
      ),
    )

  const launched: Array<{ templateId: string; runId: string }> = []
  for (const template of due) {
    if (!template.schedule?.enabled) continue
    if (template.sources.filter((s) => !s.disabled).length === 0) continue

    const days = Math.max(1, Math.min(30, template.defaultIntervalDays))
    const periodTo = new Date()
    const periodFrom = new Date(periodTo.getTime() - days * 24 * 60 * 60 * 1000)

    const [run] = await db
      .insert(monitoringRuns)
      .values({
        templateId: template.id,
        userId: template.createdBy,
        trigger: "scheduled",
        status: "pending",
        mode: template.mode,
        periodFrom,
        periodTo,
      })
      .returning({ id: monitoringRuns.id })

    safeRunPipeline({
      runId: run.id,
      template,
      userId: template.createdBy,
      periodFrom,
      periodTo,
      trigger: "scheduled",
    })

    launched.push({ templateId: template.id, runId: run.id })
  }

  return NextResponse.json({ launched, count: launched.length })
}
