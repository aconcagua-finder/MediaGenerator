import { NextRequest, NextResponse } from "next/server"
import { and, eq, inArray, or } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  videos,
  videoGenerations,
  videoCompositions,
  videoCompositionSegments,
  user,
} from "@/lib/db/schema"
import { headers } from "next/headers"
import { runComposeJob, deriveCanvas, MAX_SEGMENTS, type Orientation } from "@/lib/video/compose"

interface ComposeSegmentInput {
  sourceVideoId?: string
  trimStart?: number | null
  trimEnd?: number | null
  mute?: boolean
}

interface ComposeBody {
  title?: string
  output?: {
    orientation?: string
    fps?: number
    audio?: boolean
  }
  segments?: ComposeSegmentInput[]
}

/**
 * Запуск склейки видео. Валидирует владение всеми исходными клипами, создаёт
 * job-строку + EDL-сегменты и СРАЗУ запускает локальный ffmpeg-рендер в фоне
 * (`void runComposeJob`). Клиент дальше опрашивает `/api/video/compose/[id]/status`.
 * Стоимости нет — рендер локальный.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }
    const uid = session.user.id

    const body = (await request.json()) as ComposeBody
    const rawSegments = Array.isArray(body.segments) ? body.segments : []

    if (rawSegments.length < 1) {
      return NextResponse.json({ error: "Добавьте хотя бы один клип" }, { status: 400 })
    }
    if (rawSegments.length > MAX_SEGMENTS) {
      return NextResponse.json(
        { error: `Слишком много клипов (максимум ${MAX_SEGMENTS})` },
        { status: 400 },
      )
    }

    // Нормализация сегментов + валидация обрезки
    const segments = rawSegments.map((s) => {
      const trimStart = numOrNull(s.trimStart)
      const trimEnd = numOrNull(s.trimEnd)
      return {
        sourceVideoId: String(s.sourceVideoId || ""),
        trimStart: trimStart != null && trimStart > 0 ? trimStart : null,
        trimEnd: trimEnd != null && trimEnd > 0 ? trimEnd : null,
        mute: Boolean(s.mute),
      }
    })

    if (segments.some((s) => !s.sourceVideoId)) {
      return NextResponse.json({ error: "Не указан исходный клип у сегмента" }, { status: 400 })
    }
    for (const s of segments) {
      if (s.trimStart != null && s.trimEnd != null && s.trimEnd <= s.trimStart) {
        return NextResponse.json(
          { error: "Конец обрезки должен быть больше начала" },
          { status: 400 },
        )
      }
    }

    // Бан
    const [userData] = await db
      .select({ banned: user.banned, banReason: user.banReason })
      .from(user)
      .where(eq(user.id, uid))
    if (userData?.banned) {
      return NextResponse.json(
        { error: userData.banReason ? `Аккаунт заблокирован: ${userData.banReason}` : "Аккаунт заблокирован" },
        { status: 403 },
      )
    }

    // Владение всеми исходниками (клип принадлежит либо генерации, либо склейке)
    const ids = [...new Set(segments.map((s) => s.sourceVideoId))]
    const owned = await db
      .select({ id: videos.id })
      .from(videos)
      .leftJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
      .leftJoin(videoCompositions, eq(videos.compositionId, videoCompositions.id))
      .where(
        and(
          inArray(videos.id, ids),
          or(eq(videoGenerations.userId, uid), eq(videoCompositions.userId, uid)),
        ),
      )
    const ownedSet = new Set(owned.map((v) => v.id))
    if (ids.some((id) => !ownedSet.has(id))) {
      return NextResponse.json({ error: "Нет доступа к одному из клипов" }, { status: 403 })
    }

    // Параметры вывода (холст задаётся сервером по ориентации — контроль памяти)
    const orientation: Orientation = body.output?.orientation === "portrait" ? "portrait" : "landscape"
    const canvas = deriveCanvas(orientation)
    const fps = typeof body.output?.fps === "number" ? Math.min(60, Math.max(1, Math.round(body.output.fps))) : 30
    const audio = body.output?.audio !== false
    const params = { orientation, width: canvas.width, height: canvas.height, fps, audio }

    // Создаём job + сегменты
    const [comp] = await db
      .insert(videoCompositions)
      .values({
        userId: uid,
        title: body.title?.trim() || null,
        params,
        status: "processing",
      })
      .returning({ id: videoCompositions.id })

    await db.insert(videoCompositionSegments).values(
      segments.map((s, i) => ({
        compositionId: comp.id,
        sourceVideoId: s.sourceVideoId,
        position: i,
        trimStartSeconds: s.trimStart,
        trimEndSeconds: s.trimEnd,
        mute: s.mute,
      })),
    )

    // Запускаем рендер в фоне (не блокируем ответ)
    void runComposeJob(comp.id)

    return NextResponse.json({ compositionId: comp.id, status: "processing" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}
