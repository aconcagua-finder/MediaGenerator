import { spawn } from "node:child_process"

/**
 * ffmpeg-операции пост-шага «Заменить голос»: вытащить звук из видео и вернуть
 * новую звуковую дорожку обратно, не перекодируя видео (`-c:v copy`).
 */

const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg"

/** Звук → mp3 моно 44.1 кГц: компактно и принимается и ElevenLabs, и Chatterbox */
export function buildExtractAudioArgs(videoPath: string, outPath: string): string[] {
  return [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", videoPath,
    "-vn",
    "-ac", "1",
    "-ar", "44100",
    "-c:a", "libmp3lame",
    "-b:a", "128k",
    outPath,
  ]
}

/**
 * Подмена звука: видеодорожка копируется как есть, новый звук кодируется в AAC.
 * `-shortest` — на случай, если конвертер голоса вернул звук чуть длиннее/короче;
 * `+faststart` — чтобы mp4 играл в браузере без дозагрузки хвоста.
 */
export function buildMuxArgs(videoPath: string, audioPath: string, outPath: string): string[] {
  return [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", videoPath,
    "-i", audioPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    outPath,
  ]
}

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"] })
    let tail = ""
    proc.stderr.on("data", (d: Buffer) => {
      tail = (tail + d.toString()).slice(-2000)
    })
    proc.on("error", (e: NodeJS.ErrnoException) => {
      reject(e.code === "ENOENT" ? new Error("ffmpeg не установлен на сервере") : e)
    })
    proc.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg завершился с кодом ${code}: ${tail.split("\n").slice(-3).join(" ")}`))
    })
  })
}

export function extractAudio(videoPath: string, outPath: string): Promise<void> {
  return run(buildExtractAudioArgs(videoPath, outPath))
}

export function muxAudioOntoVideo(videoPath: string, audioPath: string, outPath: string): Promise<void> {
  return run(buildMuxArgs(videoPath, audioPath, outPath))
}
