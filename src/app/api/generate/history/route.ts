import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getGenerations } from "@/lib/actions/generations"
import { buildImageHistory } from "@/lib/images/history"

const PAGE_SIZE = 8
const MAX_PAGE_SIZE = 50

/**
 * «Мои картинки» на /generate: генерации изображений ТЕКУЩЕГО пользователя
 * (у админа тоже только свои — без showAll), тот же слой данных, что у /history.
 * `GET /api/generate/history?offset=0&limit=8` → `{ items, hasMore, total }`.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  const sp = request.nextUrl.searchParams
  const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(sp.get("limit") ?? "", 10) || PAGE_SIZE))

  const { items, total } = await getGenerations({ limit, offset, showAll: false })
  return NextResponse.json({
    items: buildImageHistory(items),
    hasMore: offset + items.length < total,
    total,
  })
}
