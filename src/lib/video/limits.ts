import { and, eq, gte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { videoGenerations, user } from "@/lib/db/schema"

/**
 * Проверка пользовательских лимитов перед запуском платной видео-задачи
 * (бюджет, дневной и общий лимит генераций). Общая для генерации видео и для
 * замены голоса. Возвращает текст ошибки + HTTP-статус или null, если можно.
 */
export type LimitFailure = { status: 403 | 429; error: string }

export async function checkVideoLimits(opts: {
  userId: string
  isAdmin: boolean
  estimate: number
}): Promise<LimitFailure | null> {
  const [userData] = await db
    .select({
      dailyLimit: user.dailyLimit,
      costLimit: user.costLimit,
      totalSpent: user.totalSpent,
      maxGenerations: user.maxGenerations,
      banned: user.banned,
      banReason: user.banReason,
    })
    .from(user)
    .where(eq(user.id, opts.userId))

  if (userData?.banned) {
    return {
      status: 403,
      error: userData.banReason ? `Аккаунт заблокирован: ${userData.banReason}` : "Аккаунт заблокирован",
    }
  }
  if (opts.isAdmin || !userData) return null

  // Бюджет — видео платное, учитываем оценку стоимости
  const spent = parseFloat(userData.totalSpent) || 0
  const limit = parseFloat(userData.costLimit) || 0
  if (limit > 0 && spent + opts.estimate > limit) {
    return {
      status: 429,
      error: `Лимит бюджета исчерпан или клип слишком дорогой ($${limit.toFixed(2)}). Сократите длительность.`,
    }
  }

  // Дневной лимит — по таблице video_generations
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const [todayCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(videoGenerations)
    .where(and(eq(videoGenerations.userId, opts.userId), gte(videoGenerations.createdAt, todayStart)))
  if (todayCount.count >= userData.dailyLimit) {
    return { status: 429, error: `Дневной лимит видео исчерпан (${userData.dailyLimit})` }
  }

  // Общий лимит генераций
  if (userData.maxGenerations !== null) {
    const [totalCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(videoGenerations)
      .where(eq(videoGenerations.userId, opts.userId))
    if (totalCount.count >= userData.maxGenerations) {
      return { status: 429, error: `Общий лимит генераций исчерпан (${userData.maxGenerations})` }
    }
  }
  return null
}
