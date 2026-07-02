/**
 * Парсер размеров и MIME-типа из заголовков картинок.
 *
 * Сделан вручную, без зависимостей вроде sharp/image-size — нам нужна
 * только проверка "это валидный image-файл и какие у него размеры".
 * Парсим первые байты PNG / JPEG / WebP / GIF, остальные форматы отвергаем.
 */

export interface ImageMeta {
  width: number
  height: number
  mimeType: string
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
}

function readPng(buffer: Buffer): ImageMeta {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    mimeType: "image/png",
  }
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}

function readJpeg(buffer: Buffer): ImageMeta | null {
  let offset = 2
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) return null
    let marker = buffer[offset + 1]
    // Пропускаем подряд идущие 0xFF (padding между сегментами)
    while (marker === 0xff && offset + 2 < buffer.length) {
      offset++
      marker = buffer[offset + 1]
    }
    // SOF0 (C0) .. SOF15 (CF), исключая DHT(C4), JPG(C8), DAC(CC) — это таблицы, не frame
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (offset + 9 > buffer.length) return null
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
        mimeType: "image/jpeg",
      }
    }
    if (offset + 4 > buffer.length) return null
    const segmentLength = buffer.readUInt16BE(offset + 2)
    if (segmentLength < 2) return null
    offset += 2 + segmentLength
  }
  return null
}

function isWebP(buffer: Buffer): boolean {
  return (
    buffer.length >= 30 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
}

function readWebP(buffer: Buffer): ImageMeta | null {
  const chunkType = buffer.toString("ascii", 12, 16)
  if (chunkType === "VP8 ") {
    // Lossy: ширина/высота 14-битные значения после frame tag (3 байта) и start code (0x9D 0x01 0x2A)
    // По смещениям 26 и 28 — little endian uint16 с 14 валидными битами
    if (buffer.length < 30) return null
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
      mimeType: "image/webp",
    }
  }
  if (chunkType === "VP8L") {
    // Lossless: первый байт после chunk size = 0x2f, затем 4 байта с шириной-1 и высотой-1
    if (buffer.length < 25) return null
    const b0 = buffer[21]
    const b1 = buffer[22]
    const b2 = buffer[23]
    const b3 = buffer[24]
    const width = (((b1 & 0x3f) << 8) | b0) + 1
    const height = ((((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))) + 1
    return { width, height, mimeType: "image/webp" }
  }
  if (chunkType === "VP8X") {
    // Extended: 3-байтовые little endian значения width-1, height-1 со смещений 24, 27
    if (buffer.length < 30) return null
    const width = (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1
    const height = (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1
    return { width, height, mimeType: "image/webp" }
  }
  return null
}

function isGif(buffer: Buffer): boolean {
  if (buffer.length < 10) return false
  const sig = buffer.toString("ascii", 0, 6)
  return sig === "GIF87a" || sig === "GIF89a"
}

function readGif(buffer: Buffer): ImageMeta {
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
    mimeType: "image/gif",
  }
}

/**
 * Читает метаданные из image-буфера. Возвращает null, если формат не
 * поддерживается или заголовок повреждён — тогда вызывающий код должен
 * отказать в приёме файла.
 */
export function readImageMeta(buffer: Buffer): ImageMeta | null {
  if (isPng(buffer)) return readPng(buffer)
  if (isJpeg(buffer)) return readJpeg(buffer)
  if (isWebP(buffer)) return readWebP(buffer)
  if (isGif(buffer)) return readGif(buffer)
  return null
}
