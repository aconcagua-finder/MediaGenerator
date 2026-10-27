import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { loadVoiceHistory } from "@/lib/voice/history-query"

const PAGE_SIZE = 8
const MAX_PAGE_SIZE = 50
const UUID = /^[0-9a-f-]{36}$/i

/**
 * «Мои озвучки» на /voice: озвучки ТЕКУЩЕГО пользователя (у админа тоже только
 * свои), новые сверху, страницами. `GET /api/voice/history?offset=0&limit=8` →
 * `{ items, hasMore, total }`; `?ids=a,b` — только эти записи (досмотреть «в работе»).
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  const sp = request.nextUrl.searchParams
  const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(sp.get("limit") ?? "", 10) || PAGE_SIZE))
  const idsParam = sp.get("ids")
  const ids = idsParam ? idsParam.split(",").filter((id) => UUID.test(id)).slice(0, MAX_PAGE_SIZE) : undefined

  return NextResponse.json(await loadVoiceHistory(session.user.id, { offset, limit, ids }))
}
