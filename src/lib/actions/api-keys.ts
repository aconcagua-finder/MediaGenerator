"use server"

import { eq, and } from "drizzle-orm"
import { db } from "../db"
import { apiKeys } from "../db/schema"
import { encrypt, decrypt, getKeyHint } from "../utils/crypto"
import { getProvider } from "../providers/registry"
import { auth } from "../auth"
import { headers } from "next/headers"

/**
 * Получить список API ключей текущего пользователя (без расшифровки)
 */
export async function getApiKeys() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  const keys = await db
    .select({
      id: apiKeys.id,
      provider: apiKeys.provider,
      keyHint: apiKeys.keyHint,
      isActive: apiKeys.isActive,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.createdBy, session.user.id))

  return keys
}

/**
 * Сохранить или обновить API ключ провайдера
 */
export async function saveApiKey(provider: string, rawKey: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  // Валидация ключа
  const providerAdapter = getProvider(provider)
  const isValid = await providerAdapter.validateKey(rawKey)
  if (!isValid) {
    return { success: false, error: "Ключ недействителен. Проверьте правильность ключа." }
  }

  const encryptedKey = encrypt(rawKey)
  const keyHint = getKeyHint(rawKey)

  // Проверяем, есть ли уже ключ для этого провайдера
  const existing = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.provider, provider),
        eq(apiKeys.createdBy, session.user.id)
      )
    )
    .limit(1)

  if (existing.length > 0) {
    // Обновляем существующий
    await db
      .update(apiKeys)
      .set({ encryptedKey, keyHint, isActive: true })
      .where(eq(apiKeys.id, existing[0].id))
  } else {
    // Создаём новый
    await db.insert(apiKeys).values({
      provider,
      encryptedKey,
      keyHint,
      isActive: true,
      createdBy: session.user.id,
    })
  }

  return { success: true }
}

/**
 * Удалить API ключ
 */
export async function deleteApiKey(keyId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  await db
    .delete(apiKeys)
    .where(
      and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.createdBy, session.user.id)
      )
    )

  return { success: true }
}

/**
 * Получить расшифрованный API ключ для провайдера (только серверное использование!)
 */
export async function getDecryptedApiKey(
  userId: string,
  provider: string
): Promise<string | null> {
  const keys = await db
    .select({ encryptedKey: apiKeys.encryptedKey })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.provider, provider),
        eq(apiKeys.createdBy, userId),
        eq(apiKeys.isActive, true)
      )
    )
    .limit(1)

  if (keys.length === 0) return null

  return decrypt(keys[0].encryptedKey)
}
