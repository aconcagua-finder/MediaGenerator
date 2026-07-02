import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { monitoringItems, monitoringRuns } from "@/lib/db/schema/monitoring"
import { getSession } from "@/lib/auth-server"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  let body: { favorite?: boolean }
  try {
    body = (await request.json()) as { favorite?: boolean }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const favorite = !!body.favorite

  // Проверяем, что item принадлежит run этого пользователя
  const rows = await db
    .select({ id: monitoringItems.id })
    .from(monitoringItems)
    .innerJoin(monitoringRuns, eq(monitoringItems.runId, monitoringRuns.id))
    .where(and(eq(monitoringItems.id, id), eq(monitoringRuns.userId, session.user.id)))
    .limit(1)
  if (rows.length === 0) {
    return NextResponse.json({ error: "Не найден" }, { status: 404 })
  }

  await db
    .update(monitoringItems)
    .set({
      isFavorite: favorite,
      favoritedAt: favorite ? new Date() : null,
    })
    .where(eq(monitoringItems.id, id))

  return NextResponse.json({ ok: true, favorite })
}
