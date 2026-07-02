import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { and, eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { contentRuns, contentTopics } from "@/lib/db/schema"

export const runtime = "nodejs"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  const { id } = await ctx.params
  const [run] = await db
    .select()
    .from(contentRuns)
    .where(and(eq(contentRuns.id, id), eq(contentRuns.userId, session.user.id)))
    .limit(1)
  if (!run) {
    return NextResponse.json({ error: "Запуск не найден" }, { status: 404 })
  }
  const [publishedRow] = await db
    .select({ id: contentTopics.id })
    .from(contentTopics)
    .where(and(eq(contentTopics.runId, id), eq(contentTopics.published, true)))
    .limit(1)
  return NextResponse.json({ run: { ...run, isPublished: Boolean(publishedRow) } })
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  const { id } = await ctx.params
  await db
    .delete(contentRuns)
    .where(and(eq(contentRuns.id, id), eq(contentRuns.userId, session.user.id)))
  return NextResponse.json({ ok: true })
}
