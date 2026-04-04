"use server"

import { eq, desc, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "../db"
import { notifications } from "../db/schema"
import { requireAdmin } from "../utils/admin-guard"

/**
 * Получить все уведомления (только для admin)
 */
export async function getNotifications() {
  await requireAdmin()

  return db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
}

/**
 * Получить количество непрочитанных уведомлений
 */
export async function getUnreadNotificationCount() {
  try {
    await requireAdmin()
  } catch {
    return 0
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(eq(notifications.isRead, false))

  return result?.count ?? 0
}

/**
 * Отметить уведомление как прочитанное
 */
export async function markNotificationAsRead(id: string) {
  await requireAdmin()

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, id))

  revalidatePath("/settings")
  return { success: true }
}

/**
 * Отметить все уведомления как прочитанные
 */
export async function markAllNotificationsAsRead() {
  await requireAdmin()

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.isRead, false))

  revalidatePath("/settings")
  return { success: true }
}

/**
 * Создать уведомление (внутренний вызов, без проверки auth)
 */
export async function createNotification(data: {
  type: string
  title: string
  message: string
}) {
  await db.insert(notifications).values(data)
}
