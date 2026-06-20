import { describe, it, expect } from "vitest"
import {
  auditTextPricing,
  auditModelSet,
  type TextPriceRow,
  type LiveTextPrice,
} from "@/lib/cron/registry-audit"

function liveMap(entries: Record<string, LiveTextPrice>): Map<string, LiveTextPrice> {
  return new Map(Object.entries(entries))
}

const ROW = (over: Partial<TextPriceRow> = {}): TextPriceRow => ({
  id: "x/m",
  name: "M",
  input: 1,
  output: 2,
  ...over,
})

describe("auditTextPricing", () => {
  it("не шумит, когда цены совпадают", () => {
    const r = auditTextPricing([ROW()], liveMap({ "x/m": { input: 1, output: 2 } }))
    expect(r.missing).toHaveLength(0)
    expect(r.drift).toHaveLength(0)
  })

  it("игнорирует мелкое округление (0.43 ↔ 0.435)", () => {
    const r = auditTextPricing(
      [ROW({ id: "d", input: 0.43, output: 0.87 })],
      liveMap({ d: { input: 0.435, output: 0.87 } }),
    )
    expect(r.drift).toHaveLength(0)
  })

  it("ловит крупный дрейф цены (output 6 → 2.5)", () => {
    const r = auditTextPricing(
      [ROW({ id: "g", input: 1.25, output: 6 })],
      liveMap({ g: { input: 1.25, output: 2.5 } }),
    )
    expect(r.drift).toHaveLength(1)
    expect(r.drift[0]).toMatchObject({ id: "g", field: "output", was: 6, now: 2.5 })
  })

  it("absMin отсекает крупный относительный, но грошовый абсолютный сдвиг", () => {
    // was 0.01 → now 0.015: +50% относительно, но абсолют 0.005 < 0.01 → не алертим
    const r = auditTextPricing(
      [ROW({ id: "tiny", input: 0.01, output: 0.01 })],
      liveMap({ tiny: { input: 0.015, output: 0.01 } }),
    )
    expect(r.drift).toHaveLength(0)
  })

  it("помечает модель пропавшей из API", () => {
    const r = auditTextPricing([ROW({ id: "gone", name: "Gone" })], liveMap({}))
    expect(r.missing).toEqual([{ id: "gone", name: "Gone" }])
    expect(r.drift).toHaveLength(0)
  })

  it("не падает на нечисловой live-цене", () => {
    const r = auditTextPricing([ROW({ id: "n" })], liveMap({ n: { input: NaN, output: 2 } }))
    expect(r.drift).toHaveLength(0)
  })
})

describe("auditModelSet", () => {
  it("находит добавленные и удалённые", () => {
    const r = auditModelSet(
      ["a", "b"],
      [{ id: "b", name: "B" }, { id: "c", name: "C new" }],
    )
    expect(r.removed).toEqual(["a"])
    expect(r.added).toEqual([{ id: "c", name: "C new" }])
  })

  it("полное совпадение — пусто", () => {
    const r = auditModelSet(["a"], [{ id: "a" }])
    expect(r.removed).toHaveLength(0)
    expect(r.added).toHaveLength(0)
  })

  it("подставляет id вместо имени, если name пуст", () => {
    const r = auditModelSet([], [{ id: "x/y" }])
    expect(r.added).toEqual([{ id: "x/y", name: "x/y" }])
  })
})
