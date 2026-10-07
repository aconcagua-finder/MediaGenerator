import { describe, it, expect } from "vitest"
import { planSeeding, isDiscoveryStub, type ExistingRegistryRow } from "@/lib/providers/seed-plan"
import type { SeedModel } from "@/lib/providers/seed-models"

const seed = (modelId: string): SeedModel => ({
  provider: "openrouter",
  modelId,
  displayName: modelId,
  description: "",
  paramsSchema: { aspect_ratio: { type: "select", options: ["1:1"], default: "1:1" } },
  pricing: { perImage: 0.01 },
})

const row = (over: Partial<ExistingRegistryRow>): ExistingRegistryRow => ({
  id: "id-1",
  provider: "openrouter",
  modelId: "a/b",
  isActive: false,
  paramsSchema: {},
  pricing: {},
  ...over,
})

describe("seed-plan — заглушки крона model-check", () => {
  it("неактивная строка с пустыми схемой и ценой — заглушка", () => {
    expect(isDiscoveryStub(row({}))).toBe(true)
  })

  it("активная строка — не заглушка", () => {
    expect(isDiscoveryStub(row({ isActive: true }))).toBe(false)
  })

  it("отключённая админом полноценная модель — не заглушка", () => {
    expect(isDiscoveryStub(row({ paramsSchema: { a: 1 }, pricing: { perImage: 0.04 } }))).toBe(false)
    // схема пустая (модель без параметров), но цена заполнена
    expect(isDiscoveryStub(row({ pricing: { perImage: 0 } }))).toBe(false)
  })

  it("отсутствующая модель вставляется, заглушка апгрейдится, готовая строка не трогается", () => {
    const plan = planSeeding(
      [
        row({ id: "stub", modelId: "stub/model" }),
        row({ id: "ok", modelId: "ok/model", isActive: true, paramsSchema: { x: 1 }, pricing: { perImage: 1 } }),
      ],
      [seed("new/model"), seed("stub/model"), seed("ok/model")],
    )
    expect(plan.toInsert.map((m) => m.modelId)).toEqual(["new/model"])
    expect(plan.toUpgrade).toEqual([{ id: "stub", seed: expect.objectContaining({ modelId: "stub/model" }) }])
  })

  it("повторный прогон после апгрейда ничего не меняет (идемпотентность)", () => {
    const s = seed("stub/model")
    const upgraded = row({
      id: "stub",
      modelId: "stub/model",
      isActive: true,
      paramsSchema: s.paramsSchema,
      pricing: s.pricing,
    })
    const plan = planSeeding([upgraded], [s])
    expect(plan.toInsert).toHaveLength(0)
    expect(plan.toUpgrade).toHaveLength(0)
  })

  it("другой провайдер с тем же modelId — отдельная модель", () => {
    const plan = planSeeding([row({ provider: "bfl", modelId: "flux-2-pro" })], [
      { ...seed("flux-2-pro"), provider: "openrouter" },
    ])
    expect(plan.toInsert).toHaveLength(1)
  })
})
