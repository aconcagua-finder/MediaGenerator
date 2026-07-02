import { describe, it, expect } from "vitest"
import { calculateChatCost, isOverBudget } from "@/lib/utils/chat-cost"

describe("calculateChatCost", () => {
  it("корректно считает стоимость для Claude Sonnet 4.6 (3$/15$ за М токенов)", () => {
    // 1 000 input + 500 output токенов: (1000/1M * 3) + (500/1M * 15)
    // = 0.003 + 0.0075 = 0.0105
    const cost = calculateChatCost(1000, 500, { input: 3, output: 15 })
    expect(cost).toBeCloseTo(0.0105, 6)
  })

  it("даёт 0, если токенов нет", () => {
    expect(calculateChatCost(0, 0, { input: 3, output: 15 })).toBe(0)
  })

  it("ровно считает выходные токены для дешёвой модели (Gemini Flash Lite)", () => {
    // 100 000 output токенов * 1.5$/М = $0.15
    expect(calculateChatCost(0, 100_000, { input: 0.25, output: 1.5 })).toBeCloseTo(0.15, 6)
  })

  it("не падает на отрицательных значениях — клиппирует к нулю", () => {
    expect(calculateChatCost(-1, -1, { input: 3, output: 15 })).toBe(0)
  })

  it("масштабируется для больших чисел", () => {
    // 1М input токенов * 5$ + 1М output * 25$ = $30
    expect(calculateChatCost(1_000_000, 1_000_000, { input: 5, output: 25 })).toBeCloseTo(30, 6)
  })
})

describe("isOverBudget", () => {
  it("false когда лимит не задан (0)", () => {
    expect(isOverBudget(100, 0)).toBe(false)
    expect(isOverBudget(0.5, 0)).toBe(false)
  })

  it("true когда потрачено >= лимит", () => {
    expect(isOverBudget(0.1, 0.1)).toBe(true)
    expect(isOverBudget(1.5, 1.0)).toBe(true)
  })

  it("false когда потрачено меньше лимита", () => {
    expect(isOverBudget(0.099, 0.1)).toBe(false)
    expect(isOverBudget(0, 1)).toBe(false)
  })

  it("устойчив к NaN/Infinity", () => {
    expect(isOverBudget(NaN, 1)).toBe(false)
    expect(isOverBudget(0.5, NaN)).toBe(false)
    expect(isOverBudget(Infinity, 1)).toBe(false)
  })
})
