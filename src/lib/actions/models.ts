"use server"

import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "../db"
import { modelRegistry } from "../db/schema"
import { SEED_MODELS } from "../providers/seed-models"
import { planSeeding } from "../providers/seed-plan"
import { requireAdmin } from "../utils/admin-guard"

/**
 * OpenRouter-слаги, которые мы заменили на GA-версии (preview → GA).
 * `seedModels()` только добавляет, поэтому ранее засеянные preview-строки
 * остаются активными в селекторе. Деактивируем их идемпотентно при сидинге.
 */
const RETIRED_OPENROUTER_MODELS = [
  "google/gemini-3.1-flash-image-preview", // → google/gemini-3.1-flash-image (Nano Banana 2 GA)
  "google/gemini-3-pro-image-preview", // → google/gemini-3-pro-image (Nano Banana Pro GA)
]

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
 * Добавляет отсутствующие модели (по provider + modelId) и заполняет заглушки,
 * которые вставил крон model-check (неактивные, с пустыми параметрами и ценой).
 */
export async function seedModels() {
  const existing = await db
    .select({
      id: modelRegistry.id,
      provider: modelRegistry.provider,
      modelId: modelRegistry.modelId,
      isActive: modelRegistry.isActive,
      paramsSchema: modelRegistry.paramsSchema,
      pricing: modelRegistry.pricing,
    })
    .from(modelRegistry)

  // Деактивируем устаревшие preview-слаги (идемпотентно)
  await db
    .update(modelRegistry)
    .set({ isActive: false })
    .where(
      and(
        eq(modelRegistry.provider, "openrouter"),
        inArray(modelRegistry.modelId, RETIRED_OPENROUTER_MODELS),
      ),
    )

  // Крон model-check вставляет найденные модели неактивными и с пустой схемой —
  // «оживляем» такие заглушки данными сида, иначе модель остаётся скрытой навсегда.
  const { toInsert, toUpgrade } = planSeeding(existing, SEED_MODELS)

  for (const { id, seed } of toUpgrade) {
    await db
      .update(modelRegistry)
      .set({
        displayName: seed.displayName,
        description: seed.description,
        paramsSchema: seed.paramsSchema,
        pricing: seed.pricing,
        isActive: true,
      })
      .where(eq(modelRegistry.id, id))
  }

  if (toInsert.length > 0) {
    await db.insert(modelRegistry).values(
      toInsert.map((m) => ({
        provider: m.provider,
        modelId: m.modelId,
        displayName: m.displayName,
        description: m.description,
        paramsSchema: m.paramsSchema,
        pricing: m.pricing,
        isActive: true,
      })),
    )
  }

  const count = toInsert.length + toUpgrade.length
  if (count === 0) return { seeded: false, count: 0 }
  return { seeded: true, count }
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
