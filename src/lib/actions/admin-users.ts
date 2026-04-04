"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "../db"
import { user } from "../db/schema"
import { requireAdmin } from "../utils/admin-guard"

/**
 * Получить список всех пользователей (только для admin)
 */
export async function getUsers() {
  await requireAdmin()

  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      dailyLimit: user.dailyLimit,
      banned: user.banned,
      banReason: user.banReason,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(user.createdAt)
}

/**
 * Изменить роль пользователя
 */
export async function updateUserRole(userId: string, role: "admin" | "user") {
  const session = await requireAdmin()

  if (session.user.id === userId) {
    return { success: false, error: "Нельзя изменить свою роль" }
  }

  await db.update(user).set({ role }).where(eq(user.id, userId))
  revalidatePath("/settings")
  return { success: true }
}

/**
 * Установить дневной лимит генераций
 */
export async function updateUserDailyLimit(userId: string, limit: number) {
  await requireAdmin()

  if (limit < 0) {
    return { success: false, error: "Лимит не может быть отрицательным" }
  }

  await db
    .update(user)
    .set({ dailyLimit: limit })
    .where(eq(user.id, userId))

  revalidatePath("/settings")
  return { success: true }
}

/**
 * Заблокировать пользователя
 */
export async function banUser(userId: string, reason?: string) {
  const session = await requireAdmin()

  if (session.user.id === userId) {
    return { success: false, error: "Нельзя заблокировать себя" }
  }

  await db
    .update(user)
    .set({ banned: true, banReason: reason || null })
    .where(eq(user.id, userId))

  revalidatePath("/settings")
  return { success: true }
}

/**
 * Разблокировать пользователя
 */
export async function unbanUser(userId: string) {
  await requireAdmin()

  await db
    .update(user)
    .set({ banned: false, banReason: null })
    .where(eq(user.id, userId))

  revalidatePath("/settings")
  return { success: true }
}
