import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { selectActiveCover } from "@/lib/content/cover-image"

export const runtime = "nodejs"

interface Context {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, ctx: Context) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as { imageId?: string } | null
  if (!body?.imageId) {
    return NextResponse.json({ error: "Нужен imageId" }, { status: 400 })
  }
  const { id } = await ctx.params
  try {
    await selectActiveCover({
      runId: id,
      userId: session.user.id,
      imageId: body.imageId,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Не удалось выбрать обложку"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
