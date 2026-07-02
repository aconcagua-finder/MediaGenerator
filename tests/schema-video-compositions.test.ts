import { describe, it, expect } from "vitest"
import * as schema from "@/lib/db/schema"
import { getTableConfig } from "drizzle-orm/pg-core"

// Проверяем, что циклический импорт videos <-> video-compositions резолвится
// при загрузке модуля И при чтении FK/CHECK (ленивые ссылки `() => ...`).
describe("schema circular import", () => {
  it("грузит обе таблицы и резолвит FK/CHECK", () => {
    expect(schema.videos).toBeTruthy()
    expect(schema.videoCompositions).toBeTruthy()
    expect(schema.videoCompositionSegments).toBeTruthy()

    const cfg = getTableConfig(schema.videos)
    // composition_id FK на video_compositions должен резолвиться без throw
    const fkTargets = cfg.foreignKeys.map((fk) => fk.reference().foreignTable)
    expect(fkTargets).toContain(schema.videoCompositions)
    // XOR-CHECK присутствует
    expect(cfg.checks.map((c) => c.name)).toContain("videos_owner_xor")

    const segCfg = getTableConfig(schema.videoCompositionSegments)
    const segTargets = segCfg.foreignKeys.map((fk) => fk.reference().foreignTable)
    expect(segTargets).toContain(schema.videos)
  })
})
