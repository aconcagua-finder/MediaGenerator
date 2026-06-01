import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  monitoringRuns,
  monitoringTemplates,
  type MonitoringTemplate,
} from "@/lib/db/schema/monitoring"
import { getSession } from "@/lib/auth-server"
import { safeRunPipeline } from "@/lib/monitoring/pipeline"

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const templateId = url.searchParams.get("templateId")
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? 20))

  const whereClause = templateId
    ? and(eq(monitoringRuns.userId, session.user.id), eq(monitoringRuns.templateId, templateId))
    : eq(monitoringRuns.userId, session.user.id)

  const runs = await db
    .select()
    .from(monitoringRuns)
    .where(whereClause)
    .orderBy(desc(monitoringRuns.createdAt))
    .limit(limit)
  return NextResponse.json({ runs })
}

interface RunInput {
  templateId: string
  intervalDays?: number
  /** Альтернатива intervalDays — явный диапазон в ISO. */
  periodFrom?: string
  periodTo?: string
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: RunInput
  try {
    body = (await request.json()) as RunInput
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.templateId) {
    return NextResponse.json({ error: "templateId обязателен" }, { status: 400 })
  }

  const [template] = await db
    .select()
    .from(monitoringTemplates)
    .where(eq(monitoringTemplates.id, body.templateId))
    .limit(1)
  if (!template) return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 })
  if (!template.isActive) {
    return NextResponse.json({ error: "Шаблон отключён" }, { status: 400 })
  }
  if (template.sources.filter((s) => !s.disabled).length === 0) {
    return NextResponse.json(
      { error: "В шаблоне нет активных источников — добавьте хотя бы один" },
      { status: 400 },
    )
  }

  const now = new Date()
  let periodFrom: Date
  let periodTo: Date
  if (body.periodFrom && body.periodTo) {
    periodFrom = new Date(body.periodFrom)
    periodTo = new Date(body.periodTo)
    if (isNaN(periodFrom.getTime()) || isNaN(periodTo.getTime())) {
      return NextResponse.json({ error: "Некорректные даты" }, { status: 400 })
    }
    if (periodFrom >= periodTo) {
      return NextResponse.json({ error: "Начало периода должно быть раньше конца" }, { status: 400 })
    }
  } else {
    const days = Math.max(1, Math.min(30, body.intervalDays ?? template.defaultIntervalDays))
    periodTo = now
    periodFrom = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  }

  const [run] = await db
    .insert(monitoringRuns)
    .values({
      templateId: template.id,
      userId: session.user.id,
      trigger: "manual",
      status: "pending",
      mode: template.mode,
      periodFrom,
      periodTo,
    })
    .returning()

  safeRunPipeline({
    runId: run.id,
    template: template as MonitoringTemplate,
    userId: session.user.id,
    periodFrom,
    periodTo,
    trigger: "manual",
  })

  return NextResponse.json({ run })
}
