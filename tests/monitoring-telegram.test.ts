import { describe, it, expect } from "vitest"
import { normalizeTelegramHandle } from "@/lib/monitoring/sources/telegram"

describe("normalizeTelegramHandle", () => {
  it("принимает чистый handle", () => {
    expect(normalizeTelegramHandle("uprav_nalog")).toBe("uprav_nalog")
  })

  it("снимает префикс @", () => {
    expect(normalizeTelegramHandle("@PolinaBuh")).toBe("PolinaBuh")
  })

  it("разбирает t.me/ ссылку", () => {
    expect(normalizeTelegramHandle("https://t.me/Pegov_I")).toBe("Pegov_I")
  })

  it("разбирает t.me/s/ ссылку", () => {
    expect(normalizeTelegramHandle("https://t.me/s/klerkonline")).toBe("klerkonline")
  })

  it("обрезает мусор в конце", () => {
    expect(normalizeTelegramHandle("uprav_nalog?ref=xxx")).toBe("uprav_nalog")
  })

  it("снимает пробелы", () => {
    expect(normalizeTelegramHandle("  netipichniy_buh  ")).toBe("netipichniy_buh")
  })
})
