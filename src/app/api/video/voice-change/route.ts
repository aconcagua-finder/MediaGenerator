import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { hasActiveProviderKey } from "@/lib/provider-keys"
import { startVoiceChange } from "@/lib/video/voice-change"

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
 * Вся логика — в `startVoiceChange` (её же зовёт автопереозвучка после v2v).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }
    const body = (await request.json()) as VoiceChangeBody
    const result = await startVoiceChange({
      userId: session.user.id,
      isAdmin: session.user.role === "admin",
      videoId: body.videoId,
      engine: body.engine,
      voice: body.voice,
      sampleSourceId: body.sampleSourceId,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({
      videoGenerationId: result.generationId,
      status: "processing",
      estimatedCost: result.estimate,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
