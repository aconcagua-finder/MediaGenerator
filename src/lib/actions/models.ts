"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "../db"
import { modelRegistry } from "../db/schema"
import { SEED_MODELS } from "../providers/seed-models"
import { requireAdmin } from "../utils/admin-guard"

/**
 * Получить все активные модели, сгруппированные по провайдерам
 */
export async function getActiveModels() {
  const models = await db
    .select()
    .from(modelRegistry)
    .where(eq(modelRegistry.isActive, true))

  // Группируем по провайдерам
  const grouped: Record<string, typeof models> = {}
  for (const model of models) {
    if (!grouped[model.provider]) {
      grouped[model.provider] = []
    }
    grouped[model.provider].push(model)
  }

  return grouped
}

/**
 * Получить конкретную модель по provider + modelId
 */
export async function getModel(provider: string, modelId: string) {
  const models = await db
    .select()
    .from(modelRegistry)
    .where(eq(modelRegistry.provider, provider))

  return models.find((m) => m.modelId === modelId) || null
}

/**
 * Заполнить таблицу model_registry начальными данными (если пуста)
 */
export async function seedModels() {
  const existing = await db.select({ id: modelRegistry.id }).from(modelRegistry).limit(1)
  if (existing.length > 0) return { seeded: false, count: 0 }

  const values = SEED_MODELS.map((m) => ({
    provider: m.provider,
    modelId: m.modelId,
    displayName: m.displayName,
    description: m.description,
    paramsSchema: m.paramsSchema,
    pricing: m.pricing,
    isActive: true,
  }))

  await db.insert(modelRegistry).values(values)

  return { seeded: true, count: values.length }
}

/**
 * Получить все модели (включая неактивные) для админ-панели
 */
export async function getAllModelsForAdmin() {
  await requireAdmin()

  return db
    .select()
    .from(modelRegistry)
    .orderBy(modelRegistry.provider, modelRegistry.displayName)
}

/**
 * Активировать модель
 */
export async function activateModel(id: string) {
  await requireAdmin()

  await db
    .update(modelRegistry)
    .set({ isActive: true })
    .where(eq(modelRegistry.id, id))

  revalidatePath("/settings")
  revalidatePath("/generate")
  return { success: true }
}

/**
 * Деактивировать модель
 */
export async function deactivateModel(id: string) {
  await requireAdmin()

  await db
    .update(modelRegistry)
    .set({ isActive: false })
    .where(eq(modelRegistry.id, id))

  revalidatePath("/settings")
  revalidatePath("/generate")
  return { success: true }
}
