import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { monitoringRuns } from "@/lib/db/schema/monitoring"
import { getSession } from "@/lib/auth-server"

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  await db
    .update(monitoringRuns)
    .set({ viewedAt: new Date() })
    .where(and(eq(monitoringRuns.id, id), eq(monitoringRuns.userId, session.user.id)))
  return NextResponse.json({ ok: true })
}
