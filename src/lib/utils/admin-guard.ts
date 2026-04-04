import { auth } from "../auth"
import { headers } from "next/headers"

/**
 * Проверяет что текущий пользователь — администратор.
 * Выбрасывает ошибку если нет сессии или роль не admin.
 * Возвращает сессию для дальнейшего использования.
 */
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    throw new Error("Не авторизован")
  }

  if (session.user.role !== "admin") {
    throw new Error("Недостаточно прав")
  }

  return session
}
