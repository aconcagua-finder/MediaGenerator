import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { isOverBudget } from "@/lib/utils/chat-cost"
import { generateCoverImage } from "@/lib/content/cover-image"

export const runtime = "nodejs"
export const maxDuration = 300

interface Context {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, ctx: Context) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  const [u] = await db
    .select({
      banned: user.banned,
      banReason: user.banReason,
      costLimit: user.costLimit,
      totalSpent: user.totalSpent,
    })
    .from(user)
    .where(eq(user.id, session.user.id))

  if (u?.banned) {
    return NextResponse.json(
      {
        error: u.banReason
          ? `Аккаунт заблокирован: ${u.banReason}`
          : "Аккаунт заблокирован",
      },
      { status: 403 },
    )
  }
  if (session.user.role !== "admin" && u) {
    const spent = parseFloat(u.totalSpent) || 0
    const limit = parseFloat(u.costLimit) || 0
    if (isOverBudget(spent, limit)) {
      return NextResponse.json(
        { error: `Бюджет исчерпан ($${limit.toFixed(2)}).` },
        { status: 429 },
      )
    }
  }

  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string
    style?: "3d_with_text" | "minimalist" | "photo"
    provider?: string
    model?: string
  }
  const { id } = await ctx.params
  try {
    const result = await generateCoverImage({
      runId: id,
      userId: session.user.id,
      promptOverride: body.prompt,
      style: body.style,
      provider: body.provider,
      model: body.model,
    })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Не удалось создать обложку"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
