import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { contentRuns } from "@/lib/db/schema"

/** Если run висит в активном статусе дольше — считаем зависшим и помечаем error. */
const STALE_RUN_LIMIT_MS = 10 * 60 * 1000

export const runtime = "nodejs"

/**
 * Лёгкий polling-эндпоинт для списка запусков. Без артефактов и promptов —
 * только статус, стейдж, ошибка и стоимость. Если переданы ids — возвращаем
 * только их (используется, когда фронт хочет освежить часть списка).
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  const idsParam = request.nextUrl.searchParams.get("ids")
  const ids = idsParam ? idsParam.split(",").filter(Boolean).slice(0, 50) : null

  // Перед чтением — освобождаем висяки: если пайплайн упал/контейнер
  // рестартовал, run может остаться в активном статусе навсегда. Помечаем
  // такие записи как error через 10 минут. errorStage наследуем из текущего
  // stage в одном SQL-выражении.
  await db.execute(sql`
    UPDATE content_runs
    SET status = 'error',
        error_stage = COALESCE(stage, 'pending'),
        error_message = 'Запуск завис в активном статусе >10 минут. Возможно процесс прервался — повтори запуск.',
        finished_at = NOW()
    WHERE user_id = ${session.user.id}
      AND status IN ('pending', 'perplexity', 'reddit', 'topic', 'compression', 'writing')
      AND created_at < NOW() - INTERVAL '${sql.raw(String(STALE_RUN_LIMIT_MS))} milliseconds'
  `)

  const baseFilter = eq(contentRuns.userId, session.user.id)
  const where = ids && ids.length > 0
    ? and(baseFilter, inArray(contentRuns.id, ids))
    : baseFilter

  const rows = await db
    .select({
      id: contentRuns.id,
      rubricSlug: contentRuns.rubricSlug,
      status: contentRuns.status,
      stage: contentRuns.stage,
      errorStage: contentRuns.errorStage,
      errorMessage: contentRuns.errorMessage,
      postText: contentRuns.postText,
      costs: contentRuns.costs,
      createdAt: contentRuns.createdAt,
      finishedAt: contentRuns.finishedAt,
    })
    .from(contentRuns)
    .where(where)
    .orderBy(desc(contentRuns.createdAt))
    .limit(ids?.length ? ids.length : 50)

  return NextResponse.json({
    runs: rows.map((r) => ({
      id: r.id,
      rubricSlug: r.rubricSlug,
      status: r.status,
      stage: r.stage,
      errorStage: r.errorStage,
      errorMessage: r.errorMessage,
      postText: r.postText,
      totalCost: typeof r.costs?.total === "number" ? r.costs.total : null,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    })),
  })
}
