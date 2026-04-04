"use server"

import { eq, and, desc, sql, ilike, inArray } from "drizzle-orm"
import { db } from "../db"
import { generations, images } from "../db/schema"
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
  images: {
    id: string
    s3Url: string
    width: number | null
    height: number | null
  }[]
}

/**
 * Получить историю генераций с фильтрами и пагинацией
 */
export async function getGenerations(opts: {
  limit?: number
  offset?: number
  provider?: string
  model?: string
  status?: string
  search?: string
}): Promise<{ items: GenerationWithImages[]; total: number }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  const { limit = 20, offset = 0, provider, model, status, search } = opts

  const conditions = [eq(generations.userId, session.user.id)]

  if (provider) conditions.push(eq(generations.provider, provider))
  if (model) conditions.push(eq(generations.model, model))
  if (status) conditions.push(eq(generations.status, status))
  if (search) conditions.push(ilike(generations.prompt, `%${search}%`))

  // Получаем генерации
  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(generations)
      .where(and(...conditions))
      .orderBy(desc(generations.createdAt))
      .limit(limit)
      .offset(offset),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(generations)
      .where(and(...conditions)),
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
