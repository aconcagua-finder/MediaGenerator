"use server"

import { eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "../db"
import { user, generations } from "../db/schema"
import { requireAdmin } from "../utils/admin-guard"

/**
 * Получить список всех пользователей (только для admin)
 */
export async function getUsers() {
  await requireAdmin()

  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      dailyLimit: user.dailyLimit,
      costLimit: user.costLimit,
      totalSpent: user.totalSpent,
      maxGenerations: user.maxGenerations,
      banned: user.banned,
      banReason: user.banReason,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(user.createdAt)

  // Подсчитаем общее количество генераций для каждого пользователя
  const genCounts = await db
    .select({
      userId: generations.userId,
      count: sql<number>`count(*)::int`,
    })
    .from(generations)
    .groupBy(generations.userId)

  const countMap = new Map(genCounts.map((g) => [g.userId, g.count]))

  return users.map((u) => ({
    ...u,
    totalGenerations: countMap.get(u.id) || 0,
  }))
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
 * Установить лимит бюджета
 */
export async function updateUserCostLimit(userId: string, limit: number) {
  await requireAdmin()

  if (limit < 0) {
    return { success: false, error: "Лимит не может быть отрицательным" }
  }

  await db
    .update(user)
    .set({ costLimit: limit.toFixed(4) })
    .where(eq(user.id, userId))

  revalidatePath("/settings")
  return { success: true }
}

/**
 * Установить общий лимит генераций (null = без ограничений)
 */
export async function updateUserMaxGenerations(userId: string, limit: number | null) {
  await requireAdmin()

  if (limit !== null && limit < 0) {
    return { success: false, error: "Лимит не может быть отрицательным" }
  }

  await db
    .update(user)
    .set({ maxGenerations: limit })
    .where(eq(user.id, userId))

  revalidatePath("/settings")
  return { success: true }
}

/**
 * Сбросить потраченную сумму пользователя
 */
export async function resetUserSpent(userId: string) {
  await requireAdmin()

  await db
    .update(user)
    .set({ totalSpent: "0.0000" })
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
