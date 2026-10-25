import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { fetchPopularVoices, fetchVoiceCatalog } from "@/lib/providers/elevenlabs"
import { parseCatalogQuery } from "@/lib/providers/elevenlabs-voices"
import { ELEVENLABS_STS_MODEL, getVoiceEngine, voiceEngineNoKeyMessage } from "@/lib/providers/voice-change-models"
import { VOICE_MODELS, elevenLabsVerificationModel } from "@/lib/providers/voice-models"
import { humanizeVideoError } from "@/lib/video/humanize-error"

export const runtime = "nodejs"

/**
 * Каталог голосов ElevenLabs для замены голоса и озвучки (прокси, ключ наружу не уходит).
 *
 *   ?popular=1[&model=eleven_v4]       → { female, male } — топ русских голосов, проверенных
 *                                        на русском для модели (по умолчанию STS — замена голоса)
 *   ?scope=ru|library|standard&gender=&age=&search=&page=&pageSize= → { voices, hasMore, page }
 *
 * Без ключа ElevenLabs — 400 с `code: "no_key"` (UI показывает подсказку).
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  const engine = getVoiceEngine("elevenlabs")!
  const apiKey = await getDecryptedApiKey(session.user.id, engine.provider)
  if (!apiKey) {
    return NextResponse.json({ error: voiceEngineNoKeyMessage(engine), code: "no_key" }, { status: 400 })
  }

  const sp = request.nextUrl.searchParams
  try {
    if (sp.get("popular") === "1") {
      // Модель озвучки → модель, по которой ElevenLabs публикует проверку русского
      const tts = VOICE_MODELS.find((m) => m.elevenlabs?.modelId === sp.get("model"))
      const verifyModel = (tts && elevenLabsVerificationModel(tts)) || ELEVENLABS_STS_MODEL
      return NextResponse.json(await fetchPopularVoices(apiKey, verifyModel))
    }
    return NextResponse.json(await fetchVoiceCatalog(apiKey, parseCatalogQuery(sp)))
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Не удалось загрузить голоса"
    console.error("[video/voice-change/voices]", raw)
    const message = humanizeVideoError(raw)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
