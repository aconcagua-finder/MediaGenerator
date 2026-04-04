import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const publicPaths = ["/login", "/register", "/api/auth"]

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
     * Все пути кроме:
     * - _next/static, _next/image (статика Next.js)
     * - favicon.ico, robots.txt и т.д.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
}
