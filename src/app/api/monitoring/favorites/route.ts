import { NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { monitoringItems, monitoringRuns, monitoringTemplates } from "@/lib/db/schema/monitoring"
import { getSession } from "@/lib/auth-server"

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Берём все избранные items пользователя через JOIN с runs (для фильтрации по user).
  const rows = await db
    .select({
      item: monitoringItems,
      runId: monitoringRuns.id,
      runCreatedAt: monitoringRuns.createdAt,
      templateId: monitoringTemplates.id,
      templateTitle: monitoringTemplates.title,
    })
    .from(monitoringItems)
    .innerJoin(monitoringRuns, eq(monitoringItems.runId, monitoringRuns.id))
    .innerJoin(monitoringTemplates, eq(monitoringRuns.templateId, monitoringTemplates.id))
    .where(and(eq(monitoringRuns.userId, session.user.id), eq(monitoringItems.isFavorite, true)))
    .orderBy(desc(monitoringItems.favoritedAt))
    .limit(500)

  return NextResponse.json({ favorites: rows })
}
