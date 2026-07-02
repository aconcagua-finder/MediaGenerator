import { NextRequest, NextResponse } from "next/server"
import { and, asc, eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { monitoringItems, monitoringRuns } from "@/lib/db/schema/monitoring"
import { getSession } from "@/lib/auth-server"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const [run] = await db
    .select()
    .from(monitoringRuns)
    .where(and(eq(monitoringRuns.id, id), eq(monitoringRuns.userId, session.user.id)))
    .limit(1)
  if (!run) return NextResponse.json({ error: "Запуск не найден" }, { status: 404 })

  const items = await db
    .select()
    .from(monitoringItems)
    .where(eq(monitoringItems.runId, id))
    .orderBy(desc(monitoringItems.matchType), desc(monitoringItems.publishedAt), asc(monitoringItems.createdAt))

  return NextResponse.json({ run, items })
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const result = await db
    .delete(monitoringRuns)
    .where(and(eq(monitoringRuns.id, id), eq(monitoringRuns.userId, session.user.id)))
    .returning({ id: monitoringRuns.id })
  if (result.length === 0) return NextResponse.json({ error: "Запуск не найден" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
