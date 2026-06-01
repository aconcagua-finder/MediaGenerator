import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { draftChannel } from "@/lib/content/channel-assistant"

export const runtime = "nodejs"
export const maxDuration = 180

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  if (session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Только админ может создавать каналы через ассистента" },
      { status: 403 },
    )
  }

  const body = (await request.json().catch(() => null)) as { description?: string } | null
  if (!body?.description?.trim()) {
    return NextResponse.json(
      { error: "Опиши канал — тематика, аудитория, формат" },
      { status: 400 },
    )
  }

  try {
    const draft = await draftChannel({
      userId: session.user.id,
      description: body.description.trim(),
    })
    return NextResponse.json({ draft })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Не удалось сгенерировать"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
