import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { probeFile } from "@/lib/video/probe"

/**
 * Длительность аудио в целых секундах через ffprobe (не меньше 1 у непустого
 * файла) или null, если не вышло — сохранению озвучки это не мешает.
 */
export async function probeAudioSeconds(buffer: Buffer, format: string): Promise<number | null> {
  const dir = await mkdtemp(join(tmpdir(), "mg-audio-"))
  try {
    const path = join(dir, `audio.${format.replace(/[^a-z0-9]/gi, "") || "mp3"}`)
    await writeFile(path, buffer)
    const probe = await probeFile(path)
    if (!probe || !(probe.durationSeconds > 0)) return null
    return Math.max(1, Math.round(probe.durationSeconds))
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
