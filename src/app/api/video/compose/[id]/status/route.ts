import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { videos, videoCompositions } from "@/lib/db/schema"
import { runComposeJob } from "@/lib/video/compose"
import { headers } from "next/headers"

/**
 * Поллинг статуса склейки с клиента. Рендер запускается eager из submit-роута,
 * поэтому здесь — чтение состояния. Дополнительно «подталкиваем» рендер, если
 * задача всё ещё `processing` (eager-старт мог не случиться — рестарт процесса,
 * другой инстанс): `runComposeJob` идемпотентен (мьютекс + DB-claim).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }

    const [comp] = await db
      .select({
        userId: videoCompositions.userId,
        status: videoCompositions.status,
        progress: videoCompositions.progress,
        errorMessage: videoCompositions.errorMessage,
      })
      .from(videoCompositions)
      .where(eq(videoCompositions.id, id))

    if (!comp) {
      return NextResponse.json({ error: "Склейка не найдена" }, { status: 404 })
    }
    const isAdmin = session.user.role === "admin"
    if (comp.userId !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
    }

    if (comp.status === "done") {
      const [v] = await db
        .select({
          id: videos.id,
          durationSeconds: videos.durationSeconds,
          width: videos.width,
          height: videos.height,
          hasAudio: videos.hasAudio,
        })
        .from(videos)
        .where(eq(videos.compositionId, id))
        .limit(1)
      return NextResponse.json({
        status: "done",
        video: v
          ? {
              id: v.id,
              url: `/api/videos/${v.id}`,
              durationSeconds: v.durationSeconds,
              width: v.width,
              height: v.height,
              hasAudio: v.hasAudio,
            }
          : null,
      })
    }

    if (comp.status === "error") {
      return NextResponse.json({ status: "error", error: comp.errorMessage || "Ошибка склейки" })
    }

    // processing / saving — подталкиваем рендер, отдаём прогресс
    if (comp.status === "processing") void runComposeJob(id)
    return NextResponse.json({ status: "processing", progress: comp.progress ?? 0 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Внутренняя ошибка"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
