import { describe, it, expect } from "vitest"
import {
  buildComposeGraph,
  segmentDuration,
  type ComposeGraphSegment,
  type ComposeOutput,
} from "@/lib/video/compose-graph"

const LANDSCAPE: ComposeOutput = { width: 1280, height: 720, fps: 30, audio: true }

function seg(over: Partial<ComposeGraphSegment> = {}): ComposeGraphSegment {
  return { hasAudio: true, mute: false, trimStart: null, trimEnd: null, sourceDuration: 8, ...over }
}

function joinArgs(args: string[]): string {
  return args.join(" ")
}

describe("segmentDuration", () => {
  it("без обрезки = длительность исходника", () => {
    expect(segmentDuration(seg({ sourceDuration: 8 }))).toBe(8)
  })
  it("с trimStart/trimEnd = разнице", () => {
    expect(segmentDuration(seg({ trimStart: 2, trimEnd: 6, sourceDuration: 8 }))).toBe(4)
  })
  it("trimEnd за пределами клипа обрезается до длительности", () => {
    expect(segmentDuration(seg({ trimStart: 1, trimEnd: 20, sourceDuration: 8 }))).toBe(7)
  })
  it("не уходит в минус", () => {
    expect(segmentDuration(seg({ trimStart: 10, sourceDuration: 8 }))).toBe(0)
  })
})

describe("buildComposeGraph", () => {
  it("суммирует длительность обрезанных сегментов", () => {
    const { totalDuration } = buildComposeGraph(
      ["a.mp4", "b.mp4"],
      [seg({ sourceDuration: 8 }), seg({ trimStart: 1, trimEnd: 4, sourceDuration: 8 })],
      LANDSCAPE,
      "out.mp4",
    )
    expect(totalDuration).toBe(11) // 8 + 3
  })

  it("нормализует каждый сегмент (scale+pad+setsar+fps+yuv420p) и делает concat", () => {
    const { args } = buildComposeGraph(["a.mp4", "b.mp4"], [seg(), seg()], LANDSCAPE, "out.mp4")
    const fcIdx = args.indexOf("-filter_complex")
    expect(fcIdx).toBeGreaterThan(-1)
    const fc = args[fcIdx + 1]
    expect(fc).toContain("scale=1280:720:force_original_aspect_ratio=decrease")
    expect(fc).toContain("pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black")
    expect(fc).toContain("setsar=1")
    expect(fc).toContain("fps=30")
    expect(fc).toContain("format=yuv420p")
    expect(fc).toContain("setpts=PTS-STARTPTS")
    expect(fc).toContain("concat=n=2:v=1:a=1[vout][aout]")
  })

  it("вставляет trim только при обрезке", () => {
    const { args } = buildComposeGraph(
      ["a.mp4"],
      [seg({ trimStart: 2, trimEnd: 5 })],
      LANDSCAPE,
      "out.mp4",
    )
    const fc = args[args.indexOf("-filter_complex") + 1]
    expect(fc).toContain("trim=start=2:end=5")
    expect(fc).toContain("atrim=start=2:end=5")
  })

  it("для немых и замьюченных сегментов добавляет отдельный anullsrc-вход", () => {
    const { args } = buildComposeGraph(
      ["a.mp4", "b.mp4", "c.mp4"],
      [seg({ hasAudio: true }), seg({ hasAudio: false }), seg({ hasAudio: true, mute: true })],
      LANDSCAPE,
      "out.mp4",
    )
    const full = joinArgs(args)
    // 2 тихих сегмента → 2 lavfi-входа anullsrc
    const anullCount = (full.match(/anullsrc/g) || []).length
    expect(anullCount).toBe(2)
    // у реального аудио-сегмента — aformat из исходника
    const fc = args[args.indexOf("-filter_complex") + 1]
    expect(fc).toContain("[0:a]")
  })

  it("при audio=false не создаёт аудиопотоки и ставит -an", () => {
    const { args } = buildComposeGraph(
      ["a.mp4", "b.mp4"],
      [seg(), seg({ hasAudio: false })],
      { ...LANDSCAPE, audio: false },
      "out.mp4",
    )
    const full = joinArgs(args)
    expect(full).toContain("-an")
    expect(full).not.toContain("anullsrc")
    const fc = args[args.indexOf("-filter_complex") + 1]
    expect(fc).toContain("concat=n=2:v=1:a=0[vout]")
    expect(fc).not.toContain("[aout]")
  })

  it("portrait-холст даёт вертикальные размеры", () => {
    const { args } = buildComposeGraph(
      ["a.mp4"],
      [seg()],
      { width: 720, height: 1280, fps: 30, audio: true },
      "out.mp4",
    )
    const fc = args[args.indexOf("-filter_complex") + 1]
    expect(fc).toContain("scale=720:1280")
  })

  it("кодеки: libx264 + faststart + threads 1 + progress", () => {
    const { args } = buildComposeGraph(["a.mp4"], [seg()], LANDSCAPE, "out.mp4")
    const full = joinArgs(args)
    expect(full).toContain("-c:v libx264")
    expect(full).toContain("-movflags +faststart")
    expect(full).toContain("-threads 1")
    expect(full).toContain("-progress pipe:1")
    expect(args[args.length - 1]).toBe("out.mp4")
  })

  it("нечётные размеры округляются до чётных (требование h264)", () => {
    const { args } = buildComposeGraph(
      ["a.mp4"],
      [seg()],
      { width: 1281, height: 721, fps: 30, audio: false },
      "out.mp4",
    )
    const fc = args[args.indexOf("-filter_complex") + 1]
    expect(fc).toContain("scale=1282:722")
  })

  it("кидает ошибку при пустом наборе или рассогласовании входов", () => {
    expect(() => buildComposeGraph([], [], LANDSCAPE, "out.mp4")).toThrow()
    expect(() => buildComposeGraph(["a.mp4"], [seg(), seg()], LANDSCAPE, "out.mp4")).toThrow()
  })
})
