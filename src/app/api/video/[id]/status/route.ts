import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { videoGenerations } from "@/lib/db/schema"
import { finalizeVideoGeneration } from "@/lib/video/finalize"
import { headers } from "next/headers"

/**
 * Поллинг статуса видео-генерации с клиента.
 * Авторизация + проверка доступа, дальше — общий `finalizeVideoGeneration`
 * (тот же код использует cron-реконсилятор, см. `@/lib/video/finalize`).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }

    // Лёгкая проверка доступа (сама финализация перечитывает строку целиком)
    const [gen] = await db
      .select({ userId: videoGenerations.userId })
      .from(videoGenerations)
      .where(eq(videoGenerations.id, id))

    if (!gen) {
      return NextResponse.json({ error: "Генерация не найдена" }, { status: 404 })
    }
    const isAdmin = session.user.role === "admin"
    if (gen.userId !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
    }

    const out = await finalizeVideoGeneration(id)

    switch (out.status) {
      case "not_found":
        return NextResponse.json({ error: "Генерация не найдена" }, { status: 404 })
      case "done":
        return NextResponse.json({ status: "done", video: out.video, cost: out.cost, voiceOver: out.voiceOver })
      case "error":
        return NextResponse.json({ status: "error", error: out.error })
      case "processing":
      default:
        return NextResponse.json(
          out.transientError
            ? { status: "processing", state: out.state, transientError: out.transientError }
            : { status: "processing", state: out.state }
        )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Внутренняя ошибка"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
