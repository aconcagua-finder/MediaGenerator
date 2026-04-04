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
 * Заполнить таблицу model_registry начальными данными.
 * Добавляет только отсутствующие модели (по provider + modelId).
 */
export async function seedModels() {
  const existing = await db
    .select({ provider: modelRegistry.provider, modelId: modelRegistry.modelId })
    .from(modelRegistry)

  const existingSet = new Set(existing.map((m) => `${m.provider}:${m.modelId}`))

  const toInsert = SEED_MODELS
    .filter((m) => !existingSet.has(`${m.provider}:${m.modelId}`))
    .map((m) => ({
      provider: m.provider,
      modelId: m.modelId,
      displayName: m.displayName,
      description: m.description,
      paramsSchema: m.paramsSchema,
      pricing: m.pricing,
      isActive: true,
    }))

  if (toInsert.length === 0) return { seeded: false, count: 0 }

  await db.insert(modelRegistry).values(toInsert)

  return { seeded: true, count: toInsert.length }
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
