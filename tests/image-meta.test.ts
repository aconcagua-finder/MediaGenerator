import { describe, it, expect } from "vitest"
import { readImageMeta } from "@/lib/utils/image-meta"

/**
 * Эталонные бинарные образцы: минимальные валидные изображения.
 * Их легче собирать вручную, чем тащить файлы с диска или зависимости —
 * заодно тесты остаются гермотичными.
 */

/** Минимальный 2×2 PNG (закодирован через известный приём с фиксированной IHDR). */
function makePngBuffer(width: number, height: number): Buffer {
  // Сигнатура + IHDR-chunk (4 байта длины, 4 байта "IHDR", 13 байт данных, 4 байта CRC).
  // CRC можно поставить нулевой — наш парсер его не проверяет.
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0) // длина данных IHDR
  ihdr.write("IHDR", 4, "ascii")
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  // 5 байт служебных (bit depth, color type, compression, filter, interlace)
  // оставим нулями — нашему парсеру они безразличны
  // CRC (4 байта) тоже ноль
  return Buffer.concat([sig, ihdr])
}

function makeJpegBuffer(width: number, height: number): Buffer {
  // SOI(FFD8) + APP0 минимальный + SOF0(FFC0) сегмент с width/height
  const soi = Buffer.from([0xff, 0xd8])
  // SOF0: marker (FF C0), длина сегмента (00 11 = 17), precision(8), height(BE16), width(BE16), components(1), 3-байт компонент
  const sof = Buffer.alloc(2 + 17)
  sof[0] = 0xff
  sof[1] = 0xc0
  sof.writeUInt16BE(17, 2) // длина сегмента (включая эти 2 байта длины)
  sof[4] = 8 // precision
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  sof[9] = 1 // num components
  // оставшиеся 8 байт — нули, парсеру не важны
  return Buffer.concat([soi, sof])
}

function makeGifBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(10)
  buf.write("GIF89a", 0, "ascii")
  buf.writeUInt16LE(width, 6)
  buf.writeUInt16LE(height, 8)
  return buf
}

function makeWebPVp8xBuffer(width: number, height: number): Buffer {
  // RIFF header + WEBP + VP8X с extended-форматом
  const buf = Buffer.alloc(30)
  buf.write("RIFF", 0, "ascii")
  buf.writeUInt32LE(22, 4) // file size - 8
  buf.write("WEBP", 8, "ascii")
  buf.write("VP8X", 12, "ascii")
  buf.writeUInt32LE(10, 16) // chunk size
  buf[20] = 0 // flags
  // 3 байта зарезервированных
  // width-1 (3 байта LE), height-1 (3 байта LE)
  const w = width - 1
  const h = height - 1
  buf[24] = w & 0xff
  buf[25] = (w >> 8) & 0xff
  buf[26] = (w >> 16) & 0xff
  buf[27] = h & 0xff
  buf[28] = (h >> 8) & 0xff
  buf[29] = (h >> 16) & 0xff
  return buf
}

describe("readImageMeta", () => {
  it("парсит PNG", () => {
    const buf = makePngBuffer(640, 480)
    expect(readImageMeta(buf)).toEqual({
      width: 640,
      height: 480,
      mimeType: "image/png",
    })
  })

  it("парсит JPEG", () => {
    const buf = makeJpegBuffer(1024, 768)
    expect(readImageMeta(buf)).toEqual({
      width: 1024,
      height: 768,
      mimeType: "image/jpeg",
    })
  })

  it("парсит GIF", () => {
    const buf = makeGifBuffer(120, 240)
    expect(readImageMeta(buf)).toEqual({
      width: 120,
      height: 240,
      mimeType: "image/gif",
    })
  })

  it("парсит WebP (VP8X extended)", () => {
    const buf = makeWebPVp8xBuffer(800, 600)
    expect(readImageMeta(buf)).toEqual({
      width: 800,
      height: 600,
      mimeType: "image/webp",
    })
  })

  it("возвращает null для не-картинки", () => {
    expect(readImageMeta(Buffer.from("not-an-image"))).toBeNull()
    expect(readImageMeta(Buffer.alloc(0))).toBeNull()
  })

  it("возвращает null для PNG с обрезанным заголовком", () => {
    const buf = makePngBuffer(100, 100).subarray(0, 12)
    expect(readImageMeta(buf)).toBeNull()
  })

  it("на JPEG без SOF возвращает null", () => {
    // SOI + один невалидный marker без SOF
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x04, 0x00, 0x00])
    expect(readImageMeta(buf)).toBeNull()
  })
})
