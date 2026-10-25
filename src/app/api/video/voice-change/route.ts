import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { hasActiveProviderKey } from "@/lib/provider-keys"
import { startVoiceChange } from "@/lib/video/voice-change"
import { VOICE_CHANGE_ENGINES } from "@/lib/providers/voice-change-models"

export const runtime = "nodejs"
export const maxDuration = 180

interface VoiceChangeBody {
  /** id видео из библиотеки (`videos.id`) */
  videoId: string
  engine: string
  /** Пресет голоса (Chatterbox) или voice_id ElevenLabs (см. voice-change-models.ts) */
  voice?: string
  /** ElevenLabs: имя выбранного голоса (подпись задачи) */
  voiceName?: string
  /** ElevenLabs: тонкие настройки (санитизируются на сервере) */
  settings?: unknown
  /** Chatterbox: id загруженного образца голоса (`POST /api/video/source?kind=audio`) */
  sampleSourceId?: string
}

/**
 * Доступна ли замена голоса: по движкам (ElevenLabs — ключ ElevenLabs,
 * Chatterbox HD — ключ fal.ai). UI скрывает кнопку, пока нет ни одного ключа,
 * и делает серым движок без ключа.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  const userId = session.user.id
  const providers = [...new Set(VOICE_CHANGE_ENGINES.map((e) => e.provider))]
  const keys = new Map(
    await Promise.all(providers.map(async (p) => [p, await hasActiveProviderKey(userId, p)] as const)),
  )
  const engines = Object.fromEntries(VOICE_CHANGE_ENGINES.map((e) => [e.id, keys.get(e.provider) ?? false]))
  return NextResponse.json({ available: Object.values(engines).some(Boolean), engines })
}

/**
 * Пост-шаг «Заменить голос» на готовом видео библиотеки (ElevenLabs или fal.ai).
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
      voiceName: body.voiceName,
      settings: body.settings,
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
