import { describe, it, expect } from "vitest"
import { humanizeVideoError } from "@/lib/video/humanize-error"

describe("humanizeVideoError", () => {
  it("маппит перегрузку Veo (high load) в подсказку про провайдера", () => {
    const raw =
      "The service is currently experiencing high load and cannot process your request. Please try again later. Operation ID: 5040193e-83ac-41d3"
    const out = humanizeVideoError(raw)
    expect(out).toContain("временно перегружен")
    expect(out).toContain("не вашего сервера")
    expect(out).not.toBe(raw)
  })

  it("маппит deadline exceeded в транзиентную подсказку", () => {
    expect(humanizeVideoError("Deadline exceeded. Please try again later.")).toContain(
      "временно перегружен"
    )
  })

  it("маппит контент-фильтр Veo", () => {
    const raw = "Video generation completed with no output (content may have been filtered)"
    const out = humanizeVideoError(raw)
    expect(out).toContain("фильтром модели")
    expect(out).not.toBe(raw)
  })

  it("незнакомую ошибку возвращает как есть (не прячет)", () => {
    const raw = "Unexpected codec error 0xdeadbeef"
    expect(humanizeVideoError(raw)).toBe(raw)
  })

  it("наши собственные сообщения не трогает", () => {
    const raw = "Загруженный кадр не найден"
    expect(humanizeVideoError(raw)).toBe(raw)
  })

  it("пустой ввод → дефолтное сообщение", () => {
    expect(humanizeVideoError("")).toBe("Генерация не удалась на стороне провайдера")
    expect(humanizeVideoError(null)).toBe("Генерация не удалась на стороне провайдера")
    expect(humanizeVideoError(undefined)).toBe("Генерация не удалась на стороне провайдера")
  })
})
