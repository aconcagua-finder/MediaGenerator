import { NextRequest, NextResponse } from "next/server"
import { serveMediaLink } from "@/lib/media-link/serve"
import { mediaLinkDeps } from "@/lib/media-link/links"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ПУБЛИЧНЫЙ маршрут без авторизации (исключён в proxy.ts): отдаёт файл из S3 по
 * секретному токену (256 бит, живёт 24 ч, отзывается при завершении задачи).
 * Нужен внешним провайдерам, которые принимают вход только по публичному
 * HTTPS-URL: `/api/media-link/{token}/{filename}`. Имя файла косметическое.
 * Любая неудача (формат, неизвестный/просроченный/отозванный токен) — 404.
 */
async function handle(request: NextRequest, slug: string[], method: "GET" | "HEAD") {
  const token = slug[0] ?? ""
  const result = await serveMediaLink(
    { token, range: request.headers.get("range"), method },
    mediaLinkDeps,
  )
  return new NextResponse(result.body as unknown as BodyInit | null, {
    status: result.status,
    headers: result.headers,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params
  return handle(request, slug, "GET")
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params
  return handle(request, slug, "HEAD")
}
