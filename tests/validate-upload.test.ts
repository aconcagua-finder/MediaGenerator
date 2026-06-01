import { describe, it, expect } from "vitest"
import {
  validateUpload,
  MAX_UPLOAD_BYTES,
  ALLOWED_MIME_TYPES,
} from "@/lib/utils/validate-upload"

/** Минимальный валидный PNG 1×1 (как в image-meta тестах, но изолированно) */
function makePng(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write("IHDR", 4, "ascii")
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  return Buffer.concat([sig, ihdr])
}

describe("validateUpload", () => {
  it("принимает валидный PNG", () => {
    const res = validateUpload(makePng(640, 480))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.meta.mimeType).toBe("image/png")
      expect(res.meta.width).toBe(640)
      expect(res.meta.height).toBe(480)
    }
  })

  it("отклоняет пустой буфер", () => {
    const res = validateUpload(Buffer.alloc(0))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("empty")
  })

  it("отклоняет слишком большой файл (по байтам, до парсинга)", () => {
    // Не строим реальную картинку — нам важна проверка лимита
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1)
    const res = validateUpload(big)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("too_large")
  })

  it("отклоняет файл, который не картинка", () => {
    const txt = Buffer.from("hello world, this is not an image")
    const res = validateUpload(txt)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("bad_image")
  })

  it("отклоняет PNG с гигантскими размерами (защита от пиксель-бомб)", () => {
    const huge = makePng(9000, 9000)
    const res = validateUpload(huge)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe("bad_image")
  })

  it("разрешённые mime-типы — только image/*", () => {
    expect(ALLOWED_MIME_TYPES.has("image/png")).toBe(true)
    expect(ALLOWED_MIME_TYPES.has("image/jpeg")).toBe(true)
    expect(ALLOWED_MIME_TYPES.has("image/webp")).toBe(true)
    expect(ALLOWED_MIME_TYPES.has("image/gif")).toBe(true)
    expect(ALLOWED_MIME_TYPES.has("application/pdf")).toBe(false)
    expect(ALLOWED_MIME_TYPES.has("image/svg+xml")).toBe(false)
  })
})
