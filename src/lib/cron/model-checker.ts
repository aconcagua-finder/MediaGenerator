import { eq, and } from "drizzle-orm"
import { db } from "../db"
import { modelRegistry, user } from "../db/schema"
import { getDecryptedApiKey } from "../actions/api-keys"
import { createNotification } from "../actions/notifications"
import { getProviderIds, getProvider, PROVIDER_INFO } from "../providers/registry"

/**
 * Проверяет обновления моделей у всех провайдеров.
 * Вызывается через POST /api/cron/model-check
 */
export async function checkModelsForUpdates() {
  const providerIds = getProviderIds()

  // Находим первого админа для получения API ключей
  const [adminUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "admin"))
    .limit(1)

  if (!adminUser) {
    return { error: "Нет администраторов в системе", checked: 0, newModels: 0, removedModels: 0 }
  }

  let totalNew = 0
  let totalRemoved = 0
  let checked = 0

  for (const providerId of providerIds) {
    try {
      const apiKey = await getDecryptedApiKey(adminUser.id, providerId)
      if (!apiKey) continue

      const provider = getProvider(providerId)
      const apiModels = await provider.listModels(apiKey)

      const existingModels = await db
        .select()
        .from(modelRegistry)
        .where(eq(modelRegistry.provider, providerId))

      const existingModelIds = new Set(existingModels.map((m) => m.modelId))
      const apiModelIds = new Set(apiModels.map((m) => m.modelId))

      // Новые модели (есть в API, нет в БД)
      const newModels = apiModels.filter((m) => !existingModelIds.has(m.modelId))

      // Удалённые модели (есть в БД, нет в API, и ранее проверялись)
      const removedModels = existingModels.filter(
        (m) => !apiModelIds.has(m.modelId) && m.lastCheckedAt !== null
      )

      // Вставляем новые модели
      for (const model of newModels) {
        // Проверяем что точно нет дубликата
        const [exists] = await db
          .select({ id: modelRegistry.id })
          .from(modelRegistry)
          .where(
            and(
              eq(modelRegistry.provider, providerId),
              eq(modelRegistry.modelId, model.modelId)
            )
          )
          .limit(1)

        if (!exists) {
          await db.insert(modelRegistry).values({
            provider: providerId,
            modelId: model.modelId,
            displayName: model.displayName,
            description: model.description || null,
            paramsSchema: {},
            pricing: {},
            isActive: false,
            lastCheckedAt: new Date(),
          })
        }
      }

      // Обновляем lastCheckedAt для существующих
      for (const model of existingModels) {
        if (apiModelIds.has(model.modelId)) {
          await db
            .update(modelRegistry)
            .set({ lastCheckedAt: new Date() })
            .where(eq(modelRegistry.id, model.id))
        }
      }

      const providerName = PROVIDER_INFO[providerId]?.name || providerId

      if (newModels.length > 0) {
        const names = newModels.map((m) => m.displayName).join(", ")
        await createNotification({
          type: "model_update",
          title: `Новые модели: ${providerName}`,
          message: `Добавлены модели: ${names}. Перейдите в настройки для активации.`,
        })
      }

      if (removedModels.length > 0) {
        const names = removedModels.map((m) => m.displayName).join(", ")
        await createNotification({
          type: "model_update",
          title: `Удалены модели: ${providerName}`,
          message: `Модели больше не доступны: ${names}.`,
        })
      }

      totalNew += newModels.length
      totalRemoved += removedModels.length
      checked++
    } catch (err) {
      console.error(`[model-checker] Ошибка проверки ${providerId}:`, err)
    }
  }

  return { checked, newModels: totalNew, removedModels: totalRemoved }
}
