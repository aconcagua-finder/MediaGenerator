import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { loadVideoHistory } from "@/lib/video/history-query"

const PAGE_SIZE = 8
const MAX_PAGE_SIZE = 50

/**
 * «Мои последние генерации» на /video: свежие видео-генерации ТЕКУЩЕГО
 * пользователя (у админа тоже только свои), новые сверху, страницами.
 * `GET /api/video/history?offset=0&limit=8` → `{ items, hasMore, total }` (страница
 * маленькая: секция догружает остальное при прокрутке).
 *
 * Сам запрос — `loadVideoHistory`.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  const uid = session.user.id
  const sp = request.nextUrl.searchParams
  const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(sp.get("limit") ?? "", 10) || PAGE_SIZE))

  return NextResponse.json(await loadVideoHistory(uid, offset, limit))
}
