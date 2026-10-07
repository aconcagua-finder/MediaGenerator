import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// /api/media-link — публичные ссылки на файлы для внешних провайдеров (OpenRouter, fal.ai):
// авторизуются секретным токеном в URL, сессии у провайдера нет.
const publicPaths = ["/login", "/register", "/api/auth", "/api/cron", "/api/media-link"]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Пропускаем публичные пути
  const isPublic = publicPaths.some((path) => pathname.startsWith(path))
  if (isPublic) {
    return NextResponse.next()
  }

  // Проверяем наличие сессионной куки Better Auth
  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value ||
    request.cookies.get("__Secure-better-auth.session_token")?.value

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Все пути кроме статики, иначе браузер не увидит фавикон/логотип/иконки
     * на /login и других публичных страницах.
     *
     * api/video/source исключён намеренно: proxy буферизует тело запроса в памяти
     * (по умолчанию 10 МБ, остальное молча обрезает), а это загрузка видео до
     * 100 МБ потоком. Сессия проверяется самим route-handler'ом.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo.webp|logo.png|robots.txt|api/video/source).*)",
  ],
}
