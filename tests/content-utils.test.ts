import { describe, it, expect } from "vitest"
import {
  buildDateRange,
  formatSearchTemplate,
  normalizeTopic,
  parseJsonFromMessage,
  similarityRatio,
  stripThinkBlocks,
} from "@/lib/content/utils"
import { buildTopicSimilarityWarning, prependTopicToPost } from "@/lib/content/post-writer"

describe("buildDateRange", () => {
  it("subtracts days_back from today (UTC), inclusive", () => {
    const fake = new Date("2026-05-18T00:00:00Z")
    const r = buildDateRange(7, fake)
    expect(r.endDate).toBe("2026-05-18")
    expect(r.startDate).toBe("2026-05-11")
  })

  it("normalises to at least 1 day", () => {
    const fake = new Date("2026-05-18T00:00:00Z")
    const r = buildDateRange(0, fake)
    expect(r.startDate).toBe("2026-05-17")
    expect(r.endDate).toBe("2026-05-18")
  })
})

describe("formatSearchTemplate", () => {
  it("replaces both placeholders", () => {
    const tpl = "Find from {start_date} to {end_date}."
    const out = formatSearchTemplate(tpl, { startDate: "2026-05-01", endDate: "2026-05-08" })
    expect(out).toBe("Find from 2026-05-01 to 2026-05-08.")
  })

  it("leaves untouched when placeholders missing", () => {
    expect(formatSearchTemplate("plain prompt", { startDate: "a", endDate: "b" })).toBe(
      "plain prompt",
    )
  })
})

describe("normalizeTopic", () => {
  it("lowercases, strips punctuation, schwa-folds, collapses whitespace", () => {
    expect(normalizeTopic("  Ёлки-Палки!  Это,  Tест.  ")).toBe("елки палки это tест")
  })

  it("returns empty string for empty / whitespace", () => {
    expect(normalizeTopic("")).toBe("")
    expect(normalizeTopic("   ")).toBe("")
  })
})

describe("similarityRatio", () => {
  it("returns 0 on disjoint", () => {
    expect(similarityRatio("совсем разные", "totally different")).toBeLessThan(0.1)
  })

  it("detects near-duplicates above 0.7", () => {
    const a = "Использование Claude для проверки договоров"
    const b = "Использование Claude для анализа договоров"
    expect(similarityRatio(a, b)).toBeGreaterThan(0.6)
  })
})

describe("parseJsonFromMessage", () => {
  it("parses plain JSON", () => {
    expect(parseJsonFromMessage<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
  })

  it("parses JSON inside markdown fence", () => {
    const raw = '```json\n{"post":"hello"}\n```'
    expect(parseJsonFromMessage<{ post: string }>(raw)).toEqual({ post: "hello" })
  })

  it("recovers JSON when wrapped in prose", () => {
    const raw = 'Sure! Here is the result: {"x": 5} and that is all.'
    expect(parseJsonFromMessage<{ x: number }>(raw)).toEqual({ x: 5 })
  })

  it("throws on no JSON at all", () => {
    expect(() => parseJsonFromMessage("just text")).toThrow()
  })
})

describe("stripThinkBlocks", () => {
  it("removes <think>…</think> blocks (case-insensitive, multiline)", () => {
    const raw = "<think>internal\nreasoning</think>\n\nfinal answer"
    expect(stripThinkBlocks(raw)).toBe("final answer")
  })

  it("leaves text without think untouched", () => {
    expect(stripThinkBlocks("hello")).toBe("hello")
  })
})

describe("buildTopicSimilarityWarning", () => {
  it("does not trigger on disjoint forbidden list", () => {
    const w = buildTopicSimilarityWarning({
      selected: "Анализ договоров через Claude",
      forbidden: ["Поиск работы на LinkedIn"],
    })
    expect(w.triggered).toBe(false)
  })

  it("triggers when forbidden topic is a near-duplicate", () => {
    const w = buildTopicSimilarityWarning({
      selected: "Использование Claude для проверки договоров",
      forbidden: ["Использование Claude для анализа договоров"],
      threshold: 0.5,
    })
    expect(w.triggered).toBe(true)
    expect(w.matchedTopic).toBe("Использование Claude для анализа договоров")
  })

  it("handles empty inputs", () => {
    expect(buildTopicSimilarityWarning({ selected: "", forbidden: [] }).triggered).toBe(false)
  })
})

describe("prependTopicToPost", () => {
  it("adds heading when missing", () => {
    const topic = { topic: "Заголовок", angle: "", keyFacts: [] }
    expect(prependTopicToPost(topic, "Текст поста")).toBe("Заголовок\n\nТекст поста")
  })

  it("keeps original if already starts with topic", () => {
    const topic = { topic: "Заголовок", angle: "", keyFacts: [] }
    expect(prependTopicToPost(topic, "Заголовок\n\nТекст")).toBe("Заголовок\n\nТекст")
  })

  it("returns empty for empty post", () => {
    const topic = { topic: "Заголовок", angle: "", keyFacts: [] }
    expect(prependTopicToPost(topic, "")).toBe("")
  })

  it("works without topic", () => {
    expect(prependTopicToPost(null, "Только пост")).toBe("Только пост")
  })
})
