import type { SeedModel } from "./seed-models"

export interface ExistingRegistryRow {
  id: string
  provider: string
  modelId: string
  isActive: boolean
  paramsSchema: unknown
  pricing: unknown
}

export interface SeedPlan {
  toInsert: SeedModel[]
  /** Строки-заглушки (создал крон model-check) → заполнить данными сида и включить */
  toUpgrade: Array<{ id: string; seed: SeedModel }>
}

function isEmptyObject(v: unknown): boolean {
  return v == null || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0)
}

/**
 * Заглушка крона `model-check`: авто-обнаруженная модель вставляется неактивной,
 * с пустой схемой параметров И пустой ценой. Админ мог отключить полноценную модель —
 * у неё цена заполнена, такие строки не трогаем (даже если схема пустая, как у
 * моделей без параметров).
 */
export function isDiscoveryStub(
  row: Pick<ExistingRegistryRow, "isActive" | "paramsSchema" | "pricing">,
): boolean {
  return !row.isActive && isEmptyObject(row.paramsSchema) && isEmptyObject(row.pricing)
}

/**
 * Что сделать при сидировании: вставить отсутствующие модели и «оживить» заглушки.
 * Без этого модель, которую крон успел вставить ДО сида, навсегда остаётся скрытой
 * с пустыми параметрами (insert-only сид её пропускает).
 */
export function planSeeding(existing: ExistingRegistryRow[], seeds: SeedModel[]): SeedPlan {
  const byKey = new Map(existing.map((r) => [`${r.provider}:${r.modelId}`, r]))
  const toInsert: SeedModel[] = []
  const toUpgrade: SeedPlan["toUpgrade"] = []

  for (const seed of seeds) {
    const row = byKey.get(`${seed.provider}:${seed.modelId}`)
    if (!row) {
      toInsert.push(seed)
    } else if (isDiscoveryStub(row)) {
      toUpgrade.push({ id: row.id, seed })
    }
  }
  return { toInsert, toUpgrade }
}
