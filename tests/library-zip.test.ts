import { describe, expect, it } from "vitest"
import { parseZipRequest, zipArchiveName, zipDownloadUrl, zipEntryName, zipExtension } from "@/lib/library/zip"

const A = "a7b25250-5fc5-45cf-9397-194dfb9ee4de"
const B = "AF7A71B6-E3EB-4231-8EDA-D657AF79EB86"

describe("parseZipRequest", () => {
  it("принимает тип и список uuid, без повторов и в нижнем регистре", () => {
    expect(parseZipRequest("videos", `${A}, ${B},${A},`)).toEqual({
      ok: true,
      kind: "videos",
      ids: [A, B.toLowerCase()],
    })
  })

  it("отклоняет неизвестный тип, пустой список, не-uuid и перебор", () => {
    expect(parseZipRequest("docs", A).ok).toBe(false)
    expect(parseZipRequest(null, A).ok).toBe(false)
    expect(parseZipRequest("images", "").ok).toBe(false)
    expect(parseZipRequest("images", null).ok).toBe(false)
    expect(parseZipRequest("audios", `${A},../etc/passwd`).ok).toBe(false)
    const many = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)
    expect(parseZipRequest("videos", many.join(",")).ok).toBe(false)
    expect(parseZipRequest("videos", many.slice(0, 200).join(",")).ok).toBe(true)
  })
})

describe("имена в архиве", () => {
  it("тип, московское время, хвост id и расширение", () => {
    // 12:10 UTC = 15:10 МСК
    expect(zipEntryName("videos", A, new Date("2026-11-12T12:10:39Z"), "mp4")).toBe(
      "video-2026-11-12_15-10-a7b25250.mp4",
    )
    expect(zipEntryName("images", A, new Date("2026-01-01T00:05:00Z"), "jpeg")).toBe(
      "image-2026-01-01_03-05-a7b25250.jpg",
    )
    expect(zipEntryName("audios", A, new Date("2026-11-12T12:10:39Z"), "wav")).toBe(
      "voice-2026-11-12_15-10-a7b25250.wav",
    )
  })

  it("без формата или с мусором берёт дефолт типа", () => {
    expect(zipExtension("images", null)).toBe("png")
    expect(zipExtension("videos", "")).toBe("mp4")
    expect(zipExtension("audios", "m p/3")).toBe("mp3")
  })

  it("имя архива и URL", () => {
    expect(zipArchiveName("videos", new Date("2026-11-12T12:10:00Z"))).toBe("mediagenerator-videos-2026-11-12_15-10.zip")
    expect(zipDownloadUrl("images", [A, B])).toBe(`/api/library/zip?kind=images&ids=${A}%2C${B}`)
  })
})
