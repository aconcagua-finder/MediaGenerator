import { spawn } from "node:child_process"

/**
 * ffprobe-обёртка: длительность, размеры, наличие дорожек. Используется при
 * загрузке исходника (серверная проверка лимитов) и при сохранении результата
 * v2v / замены голоса (реальные width/height/duration вместо оценки).
 * ffprobe ставится вместе с ffmpeg (`apk add ffmpeg` в Dockerfile).
 */

const FFPROBE_BIN = process.env.FFPROBE_PATH || "ffprobe"

export interface MediaProbe {
  durationSeconds: number
  width: number | null
  height: number | null
  hasVideo: boolean
  hasAudio: boolean
  videoCodec: string | null
}

interface RawProbe {
  format?: { duration?: string }
  streams?: Array<{
    codec_type?: string
    codec_name?: string
    width?: number
    height?: number
    duration?: string
    side_data_list?: Array<{ rotation?: number }>
    tags?: { rotate?: string }
  }>
}

/** Чистый разбор JSON-ответа ffprobe (вынесен для тестов). Учитывает поворот кадра. */
export function parseProbeJson(raw: unknown): MediaProbe | null {
  const json = raw as RawProbe | null
  if (!json || typeof json !== "object") return null
  const streams = Array.isArray(json.streams) ? json.streams : []
  const video = streams.find((s) => s.codec_type === "video")
  const audio = streams.find((s) => s.codec_type === "audio")

  let duration = parseFloat(json.format?.duration ?? "")
  if (!Number.isFinite(duration) || duration <= 0) {
    duration = parseFloat(video?.duration ?? audio?.duration ?? "")
  }

  let width = video?.width ?? null
  let height = video?.height ?? null
  // Портретные ролики с телефона часто хранятся как 1920×1080 + rotation=±90
  const rotRaw =
    video?.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation ??
    Number.parseInt(video?.tags?.rotate ?? "0", 10)
  const rotation = Math.abs(Number.isFinite(rotRaw) ? rotRaw : 0)
  if (width && height && (rotation === 90 || rotation === 270)) {
    ;[width, height] = [height, width]
  }

  return {
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : 0,
    width,
    height,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    videoCodec: video?.codec_name ?? null,
  }
}

export function probeFile(path: string): Promise<MediaProbe | null> {
  return new Promise((resolve) => {
    const proc = spawn(FFPROBE_BIN, [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      path,
    ])
    let out = ""
    proc.stdout.on("data", (d: Buffer) => {
      out += d.toString()
    })
    proc.on("error", () => resolve(null))
    proc.on("close", (code) => {
      if (code !== 0) return resolve(null)
      try {
        resolve(parseProbeJson(JSON.parse(out)))
      } catch {
        resolve(null)
      }
    })
  })
}
