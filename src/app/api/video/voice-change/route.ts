import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { videos, videoGenerations, videoCompositions, videoSources } from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { hasActiveProviderKey } from "@/lib/provider-keys"
import { falSubmit } from "@/lib/providers/video/fal-video"
import {
  buildVoiceChangeInput,
  estimateVoiceChangeCost,
  getVoiceEngine,
  resolveVoicePreset,
} from "@/lib/providers/voice-change-models"
import { downloadToFile, ensureBucket, upload } from "@/lib/storage/s3"
import { createMediaLink } from "@/lib/media-link/links"
import { releaseGenerationResources } from "@/lib/video/finalize"
import { LINK_TTL_MS } from "@/lib/media-link/token"
import { extractAudio } from "@/lib/video/ffmpeg-audio"
import { probeFile } from "@/lib/video/probe"
import { checkVideoLimits } from "@/lib/video/limits"
import { fileExtension } from "@/lib/video/source-limits"
import { humanizeVideoError } from "@/lib/video/humanize-error"

export const runtime = "nodejs"
export const maxDuration = 120

interface VoiceChangeBody {
  /** id видео из библиотеки (`videos.id`) */
  videoId: string
  engine: string
  /** Имя пресета голоса (см. voice-change-models.ts) */
  voice?: string
  /** Chatterbox: id загруженного образца голоса (`POST /api/video/source?kind=audio`) */
  sampleSourceId?: string
}

/**
 * Доступна ли замена голоса (есть ли активный ключ fal.ai) — UI скрывает кнопку,
 * пока ключа нет.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  const available = await hasActiveProviderKey(session.user.id, "fal")
  return NextResponse.json({ available })
}

/**
 * Пост-шаг «Заменить голос» на готовом видео библиотеки (через fal.ai).
 * Звук вынимается ffmpeg'ом → уходит в fal (по временной публичной ссылке) →
 * по готовности `finalize.ts` подкладывает новый звук под исходное видео
 * (`-c:v copy`) и сохраняет как НОВОЕ видео. Задача — обычная строка
 * `video_generations` (mode `voice`), поэтому статус/cron/биллинг общие.
 *
 * ❗ НЕ ПРОВЕРЕНО живым вызовом (нет ключа fal).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }
    const isAdmin = session.user.role === "admin"

    const body = (await request.json()) as VoiceChangeBody
    const engine = getVoiceEngine(body.engine)
    if (!body.videoId || !engine) {
      return NextResponse.json({ error: "Укажите видео и движок замены голоса" }, { status: 400 })
    }

    // Видео принадлежит либо генерации, либо склейке (см. videos_owner_xor)
    const [video] = await db
      .select({
        s3Key: videos.s3Key,
        hasAudio: videos.hasAudio,
        genOwnerId: videoGenerations.userId,
        compOwnerId: videoCompositions.userId,
      })
      .from(videos)
      .leftJoin(videoGenerations, eq(videos.videoGenerationId, videoGenerations.id))
      .leftJoin(videoCompositions, eq(videos.compositionId, videoCompositions.id))
      .where(eq(videos.id, body.videoId))
    if (!video) {
      return NextResponse.json({ error: "Видео не найдено" }, { status: 404 })
    }
    const ownerId = video.genOwnerId ?? video.compOwnerId
    if (ownerId !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
    }
    if (!video.hasAudio) {
      return NextResponse.json({ error: "В этом видео нет звука — менять голос не у чего" }, { status: 400 })
    }

    // Образец голоса (только движки, которые его умеют)
    let sample: { id: string; s3Key: string; contentType: string; sizeBytes: number } | null = null
    if (body.sampleSourceId) {
      if (!engine.supportsSample) {
        return NextResponse.json(
          { error: `${engine.name} не умеет брать голос из образца. Выберите готовый голос или Chatterbox HD.` },
          { status: 400 }
        )
      }
      const [row] = await db.select().from(videoSources).where(eq(videoSources.id, body.sampleSourceId))
      if (!row || row.kind !== "audio") {
        return NextResponse.json({ error: "Образец голоса не найден — загрузите его заново" }, { status: 404 })
      }
      if (row.userId !== session.user.id) {
        return NextResponse.json({ error: "Нет доступа к файлу" }, { status: 403 })
      }
      if (Date.now() - row.createdAt.getTime() > LINK_TTL_MS) {
        return NextResponse.json({ error: "Образец голоса устарел — загрузите его заново" }, { status: 410 })
      }
      sample = { id: row.id, s3Key: row.s3Key, contentType: row.contentType, sizeBytes: row.sizeBytes }
    }

    const apiKey = await getDecryptedApiKey(session.user.id, "fal")
    if (!apiKey) {
      return NextResponse.json(
        { error: "Нужен ключ fal.ai. Администратор добавляет его в Настройках." },
        { status: 400 }
      )
    }

    const genId = randomUUID()
    const workDir = await mkdtemp(join(tmpdir(), "mg-voice-"))
    try {
      // Достаём звук из видео
      const videoPath = join(workDir, "video.mp4")
      const audioPath = join(workDir, "audio.mp3")
      await downloadToFile(video.s3Key, videoPath)
      const probe = await probeFile(videoPath)
      if (!probe || !probe.hasAudio) {
        return NextResponse.json({ error: "Не удалось найти звук в видео" }, { status: 400 })
      }
      const audioSeconds = probe.durationSeconds
      const estimate = estimateVoiceChangeCost(engine, audioSeconds)

      const limitFailure = await checkVideoLimits({ userId: session.user.id, isAdmin, estimate })
      if (limitFailure) {
        return NextResponse.json({ error: limitFailure.error }, { status: limitFailure.status })
      }

      await extractAudio(videoPath, audioPath)
      const audioBuffer = await readFile(audioPath)
      const audioKey = `video-sources/${genId}/audio.mp3`
      await ensureBucket()
      await upload(audioKey, audioBuffer, "audio/mpeg")

      const preset = resolveVoicePreset(engine, body.voice)
      await db.insert(videoGenerations).values({
        id: genId,
        userId: session.user.id,
        provider: "fal",
        model: engine.endpoint,
        prompt: sample
          ? `Замена голоса: свой образец (${engine.name})`
          : `Замена голоса: ${preset.label} (${engine.name})`,
        mode: "voice",
        params: {
          duration: audioSeconds,
          source_video_id: body.videoId,
          engine: engine.id,
          voice: sample ? null : preset.id,
          sample_source_id: sample?.id ?? null,
        },
        status: "processing",
      })

      try {
        const audioUrl = await createMediaLink({
          s3Key: audioKey,
          contentType: "audio/mpeg",
          sizeBytes: audioBuffer.length,
          purpose: "voice-audio",
          userId: session.user.id,
          generationId: genId,
          filename: "audio.mp3",
        })
        const sampleUrl = sample
          ? await createMediaLink({
              s3Key: sample.s3Key,
              contentType: sample.contentType,
              sizeBytes: sample.sizeBytes,
              purpose: "voice-sample",
              userId: session.user.id,
              generationId: genId,
              filename: `sample.${fileExtension(sample.s3Key) || "mp3"}`,
            })
          : undefined

        const input = buildVoiceChangeInput({
          engine,
          audioUrl,
          presetId: preset.id,
          sampleUrl,
        })
        const submitted = await falSubmit(engine.endpoint, input, apiKey)

        await db
          .update(videoGenerations)
          .set({
            providerJobId: submitted.requestId,
            params: {
              duration: audioSeconds,
              source_video_id: body.videoId,
              engine: engine.id,
              voice: sample ? null : preset.id,
              sample_source_id: sample?.id ?? null,
              providerState: { statusUrl: submitted.statusUrl, responseUrl: submitted.responseUrl },
            },
          })
          .where(eq(videoGenerations.id, genId))

        return NextResponse.json({
          videoGenerationId: genId,
          status: "processing",
          estimatedCost: estimate,
        })
      } catch (submitError) {
        const raw = submitError instanceof Error ? submitError.message : "Не удалось отправить задачу"
        console.error(`[video/voice-change] ${engine.endpoint}:`, raw)
        const message = humanizeVideoError(raw)
        await db
          .update(videoGenerations)
          .set({ status: "error", errorMessage: message, completedAt: new Date() })
          .where(eq(videoGenerations.id, genId))
        await releaseGenerationResources(genId)
        return NextResponse.json({ error: message }, { status: 502 })
      }
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {})
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
