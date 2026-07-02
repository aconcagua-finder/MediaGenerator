import { describe, it, expect } from "vitest"
import { computeNextRunAt } from "@/lib/monitoring/pipeline"
import type { MonitoringTemplate } from "@/lib/db/schema/monitoring"

function makeTemplate(overrides: Partial<MonitoringTemplate> = {}): MonitoringTemplate {
  return {
    id: "tpl-1",
    slug: null,
    title: "test",
    description: "",
    isBuiltin: false,
    isActive: true,
    mode: "feed",
    sources: [],
    topics: [],
    classifier: null,
    defaultIntervalDays: 1,
    tgMaxPages: 5,
    schedule: { enabled: false, intervalHours: 24, hourUtc: 6 },
    lastRunAt: null,
    nextRunAt: null,
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as MonitoringTemplate
}

/** Удобный билдер UTC-даты — чтобы тесты читались как "30 мая 2026 06:00 UTC". */
function utc(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min, 0, 0))
}

describe("computeNextRunAt", () => {
  it("возвращает null если расписание выключено", () => {
    const t = makeTemplate({ schedule: { enabled: false, intervalHours: 24, hourUtc: 6 } })
    expect(computeNextRunAt(t)).toBeNull()
  })

  describe("interval=24 (ежедневное расписание)", () => {
    const t = makeTemplate({
      schedule: { enabled: true, intervalHours: 24, hourUtc: 6 },
    })

    it("baseTime раньше hourUtc сегодня → запуск сегодня в hourUtc", () => {
      // 29 мая 03:30 UTC, расписание «в 06:00 UTC» → ближайший слот сегодня в 06:00
      const next = computeNextRunAt(t, utc(2026, 5, 29, 3, 30))
      expect(next).toEqual(utc(2026, 5, 29, 6))
    })

    it("baseTime ПОСЛЕ hourUtc сегодня → запуск ЗАВТРА в hourUtc (а не через 2 дня)", () => {
      // 29 мая 08:47 UTC, расписание «в 06:00» → завтра 30 мая 06:00.
      // Регрессия: старый алгоритм отдавал 31 мая, пропуская день.
      const next = computeNextRunAt(t, utc(2026, 5, 29, 8, 47))
      expect(next).toEqual(utc(2026, 5, 30, 6))
    })

    it("baseTime ровно в hourUtc:00 → запуск завтра (>=, не >)", () => {
      // Если pipeline закончился ровно в 06:00:00, мы не хотим тут же
      // получить «next через 0 миллисекунд» — это завтра в 06:00.
      const next = computeNextRunAt(t, utc(2026, 5, 29, 6))
      expect(next).toEqual(utc(2026, 5, 30, 6))
    })

    it("при опоздании на сутки next всё равно на следующий слот, не на «через сутки»", () => {
      // Сценарий: docker был выключен трое суток, cron поднялся 31 мая 12:00.
      // Запуск с trigger=scheduled. next должен быть 1 июня 06:00, не 2 июня.
      const next = computeNextRunAt(t, utc(2026, 5, 31, 12))
      expect(next).toEqual(utc(2026, 6, 1, 6))
    })

    it("работает с hourUtc=0 (ночной слот)", () => {
      const tMidnight = makeTemplate({
        schedule: { enabled: true, intervalHours: 24, hourUtc: 0 },
      })
      // 29 мая 03:30 → next = 30 мая 00:00
      const next = computeNextRunAt(tMidnight, utc(2026, 5, 29, 3, 30))
      expect(next).toEqual(utc(2026, 5, 30, 0))
    })

    it("работает с hourUtc=23 (поздний слот)", () => {
      const tLate = makeTemplate({
        schedule: { enabled: true, intervalHours: 24, hourUtc: 23 },
      })
      // 29 мая 03:30 → сегодня в 23:00 ещё впереди
      expect(computeNextRunAt(tLate, utc(2026, 5, 29, 3, 30))).toEqual(utc(2026, 5, 29, 23))
      // 29 мая 23:30 → завтра в 23:00
      expect(computeNextRunAt(tLate, utc(2026, 5, 29, 23, 30))).toEqual(utc(2026, 5, 30, 23))
    })
  })

  describe("interval > 24 (через несколько дней)", () => {
    it("interval=48 → шаг 2 дня", () => {
      const t = makeTemplate({
        schedule: { enabled: true, intervalHours: 48, hourUtc: 6 },
      })
      // 29 мая 08:47 → 31 мая 06:00 (через 2 дня)
      expect(computeNextRunAt(t, utc(2026, 5, 29, 8, 47))).toEqual(utc(2026, 5, 31, 6))
    })

    it("interval=72 → шаг 3 дня", () => {
      const t = makeTemplate({
        schedule: { enabled: true, intervalHours: 72, hourUtc: 6 },
      })
      // 29 мая 08:47 → 1 июня 06:00 (через 3 дня)
      expect(computeNextRunAt(t, utc(2026, 5, 29, 8, 47))).toEqual(utc(2026, 6, 1, 6))
    })

    it("interval=36 (нестандартное значение) округляется вверх до 2 дней", () => {
      const t = makeTemplate({
        schedule: { enabled: true, intervalHours: 36, hourUtc: 6 },
      })
      // ceil(36/24) = 2 дня
      expect(computeNextRunAt(t, utc(2026, 5, 29, 8, 47))).toEqual(utc(2026, 5, 31, 6))
    })
  })

  describe("clamping", () => {
    it("intervalHours < 24 поднимается до 24", () => {
      // intervalHours=1 не должно давать «через час»; clamp до 24 → шаг 1 день
      const t = makeTemplate({ schedule: { enabled: true, intervalHours: 1, hourUtc: 6 } })
      // 29 мая 08:47 → 30 мая 06:00 (через 1 день, а не через 1 час)
      expect(computeNextRunAt(t, utc(2026, 5, 29, 8, 47))).toEqual(utc(2026, 5, 30, 6))
    })

    it("hourUtc вне [0..23] клипается", () => {
      const tHigh = makeTemplate({
        schedule: { enabled: true, intervalHours: 24, hourUtc: 30 },
      })
      const next = computeNextRunAt(tHigh, utc(2026, 5, 29, 8, 47))
      expect(next!.getUTCHours()).toBe(23)
    })
  })
})
