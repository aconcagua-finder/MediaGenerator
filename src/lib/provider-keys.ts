import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { apiKeys, user } from "@/lib/db/schema"

/**
 * Есть ли активный ключ провайдера для пользователя (свой или любого админа).
 * Без расшифровки — для условного показа функций в UI (напр. fal.ai).
 */
export async function hasActiveProviderKey(userId: string, provider: string): Promise<boolean> {
  const own = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.provider, provider), eq(apiKeys.createdBy, userId), eq(apiKeys.isActive, true))
    )
    .limit(1)
  if (own.length > 0) return true

  const admin = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .innerJoin(user, eq(apiKeys.createdBy, user.id))
    .where(and(eq(apiKeys.provider, provider), eq(user.role, "admin"), eq(apiKeys.isActive, true)))
    .limit(1)
  return admin.length > 0
}
