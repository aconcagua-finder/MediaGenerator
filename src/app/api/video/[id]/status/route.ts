import { NextRequest, NextResponse } from "next/server"
import { eq, and, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { videoGenerations, videos, user } from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { getVideoProvider } from "@/lib/providers/video/registry"
import { getVideoModel, estimateVideoCost } from "@/lib/providers/video-models"
import { upload, ensureBucket } from "@/lib/storage/s3"
import { headers } from "next/headers"

const RES_HEIGHT: Record<string, number> = { "480p": 480, "720p": 720, "1080p": 1080, "4K": 2160 }

/** Примерные пиксельные размеры из разрешения + соотношения сторон (для вёрстки плеера) */
function dims(resolution?: string, aspect?: string): { width: number; height: number } {
  const h = RES_HEIGHT[resolution || "720p"] || 720
  const [aw, ah] = (aspect || "16:9").split(":").map(Number)
  const ratio = aw && ah ? aw / ah : 16 / 9
  const w = Math.round((h * ratio) / 2) * 2
  return { width: w, height: h }
}

interface VideoRow {
  id: string
  durationSeconds: number | null
  width: number | null
  height: number | null
  hasAudio: boolean
}

function videoDto(v: VideoRow) {
  return {
    id: v.id,
    url: `/api/videos/${v.id}`,
    durationSeconds: v.durationSeconds,
    width: v.width,
    height: v.height,
    hasAudio: v.hasAudio,
  }
}

async function findVideo(generationId: string): Promise<VideoRow | null> {
  const [v] = await db
    .select({
      id: videos.id,
      durationSeconds: videos.durationSeconds,
      width: videos.width,
      height: videos.height,
      hasAudio: videos.hasAudio,
    })
    .from(videos)
    .where(eq(videos.videoGenerationId, generationId))
    .limit(1)
  return v || null
}

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

    const [gen] = await db
      .select({
        id: videoGenerations.id,
        userId: videoGenerations.userId,
        provider: videoGenerations.provider,
        model: videoGenerations.model,
        status: videoGenerations.status,
        providerJobId: videoGenerations.providerJobId,
        params: videoGenerations.params,
        cost: videoGenerations.cost,
        errorMessage: videoGenerations.errorMessage,
      })
      .from(videoGenerations)
      .where(eq(videoGenerations.id, id))

    if (!gen) {
      return NextResponse.json({ error: "Генерация не найдена" }, { status: 404 })
    }
    const isAdmin = session.user.role === "admin"
    if (gen.userId !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
    }

    // Терминальные состояния
    if (gen.status === "done") {
      const v = await findVideo(gen.id)
      return NextResponse.json({
        status: "done",
        video: v ? videoDto(v) : null,
        cost: gen.cost ? parseFloat(gen.cost) : undefined,
      })
    }
    if (gen.status === "error") {
      return NextResponse.json({ status: "error", error: gen.errorMessage || "Ошибка генерации" })
    }
    // Другой запрос уже сохраняет результат
    if (gen.status === "saving") {
      const v = await findVideo(gen.id)
      return v
        ? NextResponse.json({ status: "done", video: videoDto(v), cost: gen.cost ? parseFloat(gen.cost) : undefined })
        : NextResponse.json({ status: "processing", state: "in_progress" })
    }

    // status === "processing": опрашиваем провайдера
    if (!gen.providerJobId) {
      return NextResponse.json({ status: "processing", state: "pending" })
    }

    const apiKey = await getDecryptedApiKey(gen.userId, gen.provider)
    if (!apiKey) {
      return NextResponse.json({ status: "processing", state: "pending" })
    }

    let poll
    try {
      poll = await getVideoProvider(gen.provider).poll(gen.providerJobId, apiKey)
    } catch (pollErr) {
      // Транзиентная ошибка опроса — не валим задачу, клиент повторит
      const msg = pollErr instanceof Error ? pollErr.message : "Ошибка опроса"
      return NextResponse.json({ status: "processing", state: "in_progress", transientError: msg })
    }

    if (poll.state === "pending" || poll.state === "in_progress") {
      return NextResponse.json({ status: "processing", state: poll.state })
    }

    if (poll.state === "failed" || poll.videoUrls.length === 0) {
      const errMsg = poll.error || "Провайдер вернул пустой результат"
      await db
        .update(videoGenerations)
        .set({ status: "error", errorMessage: errMsg, completedAt: new Date() })
        .where(and(eq(videoGenerations.id, gen.id), eq(videoGenerations.status, "processing")))
      return NextResponse.json({ status: "error", error: errMsg })
    }

    // poll.state === "completed": «забираем» задачу, чтобы не сохранить дважды
    const claimed = await db
      .update(videoGenerations)
      .set({ status: "saving" })
      .where(and(eq(videoGenerations.id, gen.id), eq(videoGenerations.status, "processing")))
      .returning({ id: videoGenerations.id })

    if (claimed.length === 0) {
      const v = await findVideo(gen.id)
      return v
        ? NextResponse.json({ status: "done", video: videoDto(v), cost: gen.cost ? parseFloat(gen.cost) : undefined })
        : NextResponse.json({ status: "processing", state: "in_progress" })
    }

    try {
      // Скачиваем mp4 и кладём в S3 (CDN-ссылки провайдера временные)
      const resp = await fetch(poll.videoUrls[0])
      if (!resp.ok) throw new Error(`Не удалось скачать видео (${resp.status})`)
      const buf = Buffer.from(await resp.arrayBuffer())

      await ensureBucket()
      const s3Key = `videos/${gen.id}/0.mp4`
      await upload(s3Key, buf, "video/mp4")

      const p = (gen.params || {}) as {
        duration?: number
        resolution?: string
        aspect_ratio?: string
        generate_audio?: boolean
      }
      const { width, height } = dims(p.resolution, p.aspect_ratio)

      const [savedVideo] = await db
        .insert(videos)
        .values({
          videoGenerationId: gen.id,
          s3Key,
          s3Url: s3Key,
          durationSeconds: p.duration ?? null,
          width,
          height,
          format: "mp4",
          hasAudio: Boolean(p.generate_audio),
          sizeBytes: buf.length,
        })
        .returning({ id: videos.id })

      // Стоимость: факт от провайдера, иначе оценка
      const model = getVideoModel(gen.model)
      const cost =
        typeof poll.cost === "number"
          ? poll.cost
          : model
            ? estimateVideoCost(model, p.duration ?? 0)
            : 0

      await db
        .update(videoGenerations)
        .set({ status: "done", cost: cost.toFixed(4), completedAt: new Date() })
        .where(eq(videoGenerations.id, gen.id))

      if (cost > 0) {
        await db
          .update(user)
          .set({ totalSpent: sql`${user.totalSpent}::numeric + ${cost.toFixed(4)}::numeric` })
          .where(eq(user.id, gen.userId))
      }

      return NextResponse.json({
        status: "done",
        video: videoDto({
          id: savedVideo.id,
          durationSeconds: p.duration ?? null,
          width,
          height,
          hasAudio: Boolean(p.generate_audio),
        }),
        cost,
      })
    } catch (saveErr) {
      const msg = saveErr instanceof Error ? saveErr.message : "Ошибка сохранения видео"
      console.error(`[video/status] save ${gen.id}:`, msg)
      await db
        .update(videoGenerations)
        .set({ status: "error", errorMessage: msg, completedAt: new Date() })
        .where(eq(videoGenerations.id, gen.id))
      return NextResponse.json({ status: "error", error: msg })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Внутренняя ошибка"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
