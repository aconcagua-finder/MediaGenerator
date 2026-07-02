import { describe, it, expect } from "vitest"
import { discoverFeedUrlInHtml } from "@/lib/monitoring/sources/website"

describe("discoverFeedUrlInHtml", () => {
  it("находит RSS-ссылку через link rel=alternate type=application/rss+xml", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
    </head></html>`
    expect(discoverFeedUrlInHtml(html, "https://example.com/news")).toBe(
      "https://example.com/feed.xml",
    )
  })

  it("находит абсолютный URL feed'а", () => {
    const html = `<head><link rel="alternate" type="application/atom+xml" href="https://other.com/atom"></head>`
    expect(discoverFeedUrlInHtml(html, "https://example.com")).toBe("https://other.com/atom")
  })

  it("возвращает null если нет alternate с feed-типом", () => {
    const html = `<head><link rel="alternate" type="text/html" href="/about"></head>`
    expect(discoverFeedUrlInHtml(html, "https://example.com")).toBeNull()
  })

  it("игнорирует обычные stylesheet ссылки", () => {
    const html = `<head><link rel="stylesheet" href="/main.css"></head>`
    expect(discoverFeedUrlInHtml(html, "https://example.com")).toBeNull()
  })

  it("резолвит относительный путь относительно baseUrl", () => {
    const html = `<link rel="alternate" type="application/rss+xml" href="rss/news.xml">`
    expect(discoverFeedUrlInHtml(html, "https://example.com/news/")).toBe(
      "https://example.com/news/rss/news.xml",
    )
  })
})
