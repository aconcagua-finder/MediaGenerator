import { describe, it, expect } from "vitest"
import * as schema from "@/lib/db/schema"
import { getTableConfig } from "drizzle-orm/pg-core"

describe("схема публичных ссылок и источников", () => {
  it("public_media_links: хеш токена уникален, FK на задачу каскадный", () => {
    const cfg = getTableConfig(schema.publicMediaLinks)
    expect(cfg.name).toBe("public_media_links")
    const cols = cfg.columns.map((c) => c.name)
    expect(cols).toContain("token_hash")
    expect(cols).not.toContain("token") // сам токен в БД не хранится
    expect(cfg.indexes.some((i) => i.config.unique && i.config.columns.some((c) => "name" in c && c.name === "token_hash"))).toBe(true)
    const fk = cfg.foreignKeys.find((f) => f.reference().foreignTable === schema.videoGenerations)
    expect(fk?.onDelete).toBe("cascade")
  })

  it("video_sources: владелец-пользователь и метаданные ffprobe", () => {
    const cfg = getTableConfig(schema.videoSources)
    expect(cfg.name).toBe("video_sources")
    expect(cfg.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(["user_id", "kind", "s3_key", "duration_seconds", "width", "height", "has_audio"]),
    )
  })
})
