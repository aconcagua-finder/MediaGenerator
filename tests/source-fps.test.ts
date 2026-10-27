import { describe, it, expect } from "vitest"
import { parseFrameRate, parseProbeJson } from "@/lib/video/probe"
import { buildFpsNormalizeArgs, needsFpsNormalize, MAX_SOURCE_FPS } from "@/lib/video/source-fps"
import { humanizeVideoError } from "@/lib/video/humanize-error"

describe("parseFrameRate", () => {
  it("дроби и целые", () => {
    expect(parseFrameRate("60/1")).toBe(60)
    expect(parseFrameRate("30000/1001")).toBeCloseTo(29.97, 2)
    expect(parseFrameRate("25")).toBe(25)
  })
  it("мусор и 0/0 → null", () => {
    expect(parseFrameRate("0/0")).toBeNull()
    expect(parseFrameRate("")).toBeNull()
    expect(parseFrameRate(undefined)).toBeNull()
    expect(parseFrameRate("abc")).toBeNull()
  })
})

describe("parseProbeJson: fps", () => {
  it("берёт avg_frame_rate, при 0/0 — r_frame_rate", () => {
    const p = parseProbeJson({
      format: { duration: "10.6" },
      streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "0/0", r_frame_rate: "60/1" }],
    })
    expect(p?.fps).toBe(60)
  })
  it("без видео fps = null", () => {
    const p = parseProbeJson({ format: { duration: "3" }, streams: [{ codec_type: "audio" }] })
    expect(p?.fps).toBeNull()
  })
})

describe("needsFpsNormalize", () => {
  it("пересобираем только выше 30 fps", () => {
    expect(MAX_SOURCE_FPS).toBe(30)
    expect(needsFpsNormalize(60)).toBe(true)
    expect(needsFpsNormalize(59.94)).toBe(true)
    expect(needsFpsNormalize(30)).toBe(false)
    expect(needsFpsNormalize(30.02)).toBe(false)
    expect(needsFpsNormalize(29.97)).toBe(false)
    expect(needsFpsNormalize(null)).toBe(false)
  })
})

describe("buildFpsNormalizeArgs", () => {
  it("30 fps, h264 yuv420p, звук aac, необязательная звуковая дорожка", () => {
    const args = buildFpsNormalizeArgs("/in.mov", "/out.mp4")
    expect(args).toContain("fps=30")
    expect(args.join(" ")).toContain("-c:v libx264")
    expect(args.join(" ")).toContain("-pix_fmt yuv420p")
    expect(args.join(" ")).toContain("-map 0:a:0?")
    expect(args.at(-1)).toBe("/out.mp4")
  })
})

describe("humanizeVideoError: fps Runway", () => {
  it("переводит UNSUPPORTED_FPS на русский", () => {
    const msg = humanizeVideoError(
      "Runway video generation failed: INPUT_VALIDATION.VIDEO.UNSUPPORTED_FPS: Input video exceeds the 30fps limit: source is 60fps. Use a source video at or below 30fps.",
    )
    expect(msg).toMatch(/30 кадров/)
    expect(msg).not.toMatch(/Runway video generation failed/)
  })
})
