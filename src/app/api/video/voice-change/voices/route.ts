import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { fetchPopularVoices, fetchVoiceCatalog } from "@/lib/providers/elevenlabs"
import { parseCatalogQuery } from "@/lib/providers/elevenlabs-voices"
import { getVoiceEngine, voiceEngineNoKeyMessage } from "@/lib/providers/voice-change-models"
import { humanizeVideoError } from "@/lib/video/humanize-error"

export const runtime = "nodejs"

/**
 * Каталог голосов ElevenLabs для замены голоса (прокси, ключ наружу не уходит).
 *
 *   ?popular=1                         → { female, male } — топ русских голосов, проверенных на STS
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
      return NextResponse.json(await fetchPopularVoices(apiKey))
    }
    return NextResponse.json(await fetchVoiceCatalog(apiKey, parseCatalogQuery(sp)))
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Не удалось загрузить голоса"
    console.error("[video/voice-change/voices]", raw)
    const message = humanizeVideoError(raw)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
