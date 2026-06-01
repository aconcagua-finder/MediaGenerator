import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { contentRubrics, user } from "@/lib/db/schema"
import { isOverBudget } from "@/lib/utils/chat-cost"
import { createPendingRun, runPipeline } from "@/lib/content/pipeline"
import { ensureContentDefaults } from "@/lib/content/seed"

export const runtime = "nodejs"
export const maxDuration = 60 // ответ возвращаем сразу, пайплайн в фоне

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  await ensureContentDefaults()

  const body = (await request.json().catch(() => null)) as
    | {
        rubricId?: string
        rubricSlug?: string
        channelId?: string
        topicHint?: string
        pipelineMode?: "full" | "express"
      }
    | null
  if (!body || (!body.rubricId && !body.rubricSlug && !body.channelId)) {
    return NextResponse.json(
      { error: "Нужен rubricId, rubricSlug или channelId (для свободного поста)" },
      { status: 400 },
    )
  }
  const topicHint = (body.topicHint || "").trim() || undefined
  const pipelineModeOverride =
    body.pipelineMode === "full" || body.pipelineMode === "express"
      ? body.pipelineMode
      : undefined

  // Проверка бюджета (как в /api/chat) — пайплайн дорогой
  const isAdmin = session.user.role === "admin"
  const [userData] = await db
    .select({
      banned: user.banned,
      banReason: user.banReason,
      costLimit: user.costLimit,
      totalSpent: user.totalSpent,
    })
    .from(user)
    .where(eq(user.id, session.user.id))

  if (userData?.banned) {
    return NextResponse.json(
      {
        error: userData.banReason
          ? `Аккаунт заблокирован: ${userData.banReason}`
          : "Аккаунт заблокирован",
      },
      { status: 403 },
    )
  }
  if (!isAdmin && userData) {
    const spent = parseFloat(userData.totalSpent) || 0
    const limit = parseFloat(userData.costLimit) || 0
    if (isOverBudget(spent, limit)) {
      return NextResponse.json(
        { error: `Бюджет исчерпан ($${limit.toFixed(2)}).` },
        { status: 429 },
      )
    }
  }

  let resolvedRubricId: string | undefined
  if (body.rubricId) {
    resolvedRubricId = body.rubricId
  } else if (body.rubricSlug) {
    const [r] = await db
      .select({ id: contentRubrics.id, isActive: contentRubrics.isActive })
      .from(contentRubrics)
      .where(eq(contentRubrics.slug, body.rubricSlug))
      .limit(1)
    if (!r) return NextResponse.json({ error: "Рубрика не найдена" }, { status: 404 })
    if (!r.isActive) return NextResponse.json({ error: "Рубрика отключена" }, { status: 400 })
    resolvedRubricId = r.id
  }

  let runResult: Awaited<ReturnType<typeof createPendingRun>>
  try {
    runResult = await createPendingRun({
      userId: session.user.id,
      rubricId: resolvedRubricId,
      channelId: !resolvedRubricId ? body.channelId : undefined,
      pipelineModeOverride,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Не удалось создать запуск"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  const { run, rubric: effectiveRubric } = runResult

  // Pipeline крутится в фоне, ответ возвращаем сразу.
  // Любая ошибка ниже фиксируется внутри runPipeline через failRun.
  void runPipeline({
    runId: run.id,
    userId: session.user.id,
    rubric: effectiveRubric,
    topicHint,
  }).catch((err) => {
    console.error("[content pipeline] uncaught error:", err)
  })

  return NextResponse.json({
    runId: run.id,
    status: run.status,
    stage: run.stage,
    rubricSlug: effectiveRubric.slug,
  })
}
