"use server"

import { eq, and, desc, sql, ilike, inArray } from "drizzle-orm"
import { db } from "../db"
import { generations, images, user } from "../db/schema"
import { auth } from "../auth"
import { headers } from "next/headers"

export interface GenerationWithImages {
  id: string
  provider: string
  model: string
  prompt: string
  params: unknown
  status: string
  imagesCount: number
  cost: string | null
  errorMessage: string | null
  createdAt: Date
  completedAt: Date | null
  userName?: string
  userEmail?: string
  images: {
    id: string
    s3Url: string
    width: number | null
    height: number | null
  }[]
}

/**
 * Получить историю генераций с фильтрами и пагинацией.
 * Админ с showAll=true видит генерации всех пользователей.
 */
export async function getGenerations(opts: {
  limit?: number
  offset?: number
  provider?: string
  model?: string
  status?: string
  search?: string
  showAll?: boolean
}): Promise<{ items: GenerationWithImages[]; total: number }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  const { limit = 20, offset = 0, provider, model, status, search, showAll } = opts
  const isAdmin = session.user.role === "admin"
  const viewAll = isAdmin && showAll

  const conditions = [eq(generations.hidden, false)]

  // Обычный пользователь видит только свои генерации
  if (!viewAll) {
    conditions.push(eq(generations.userId, session.user.id))
  }

  if (provider) conditions.push(eq(generations.provider, provider))
  if (model) conditions.push(eq(generations.model, model))
  if (status) conditions.push(eq(generations.status, status))
  if (search) conditions.push(ilike(generations.prompt, `%${search}%`))

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // Получаем генерации с данными пользователя (для админа)
  const [items, countResult] = await Promise.all([
    db
      .select({
        id: generations.id,
        userId: generations.userId,
        provider: generations.provider,
        model: generations.model,
        prompt: generations.prompt,
        params: generations.params,
        status: generations.status,
        imagesCount: generations.imagesCount,
        cost: generations.cost,
        errorMessage: generations.errorMessage,
        createdAt: generations.createdAt,
        completedAt: generations.completedAt,
        userName: user.name,
        userEmail: user.email,
      })
      .from(generations)
      .innerJoin(user, eq(generations.userId, user.id))
      .where(whereClause)
      .orderBy(desc(generations.createdAt))
      .limit(limit)
      .offset(offset),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(generations)
      .where(whereClause),
  ])

  // Получаем изображения для этих генераций
  const generationIds = items.map((g) => g.id)
  const allImages =
    generationIds.length > 0
      ? await db
          .select({
            id: images.id,
            generationId: images.generationId,
            s3Url: images.s3Url,
            width: images.width,
            height: images.height,
          })
          .from(images)
          .where(inArray(images.generationId, generationIds))
      : []

  // Группируем изображения по генерациям
  const imagesByGeneration = new Map<string, typeof allImages>()
  for (const img of allImages) {
    const list = imagesByGeneration.get(img.generationId) || []
    list.push(img)
    imagesByGeneration.set(img.generationId, list)
  }

  return {
    items: items.map((gen) => ({
      id: gen.id,
      provider: gen.provider,
      model: gen.model,
      prompt: gen.prompt,
      params: gen.params,
      status: gen.status,
      imagesCount: gen.imagesCount,
      cost: gen.cost,
      errorMessage: gen.errorMessage,
      createdAt: gen.createdAt,
      completedAt: gen.completedAt,
      ...(viewAll ? { userName: gen.userName, userEmail: gen.userEmail } : {}),
      images: (imagesByGeneration.get(gen.id) || []).map((img) => ({
        id: img.id,
        s3Url: img.s3Url,
        width: img.width,
        height: img.height,
      })),
    })),
    total: countResult[0]?.count ?? 0,
  }
}

/**
 * Скрыть записи генераций из истории (soft delete).
 * Изображения в библиотеке и S3 остаются нетронутыми.
 */
export async function deleteGenerations(generationIds: string[]) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  if (generationIds.length === 0) return { deleted: 0 }

  const isAdmin = session.user.role === "admin"

  const conditions = [inArray(generations.id, generationIds)]
  if (!isAdmin) {
    conditions.push(eq(generations.userId, session.user.id))
  }

  const result = await db
    .update(generations)
    .set({ hidden: true })
    .where(and(...conditions))
    .returning({ id: generations.id })

  return { deleted: result.length }
}
