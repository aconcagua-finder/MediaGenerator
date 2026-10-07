import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { videos } from "@/lib/db/schema"
import { downloadToFile } from "@/lib/storage/s3"
import { probeFile } from "./probe"
import { muxAudioOntoVideo } from "./ffmpeg-audio"

/**
 * Подготовка результата перед сохранением в библиотеку для режимов, где у задачи
 * нет параметров разрешения/длительности:
 *  - `v2v` — результат уже готовый mp4, берём из него реальные размеры/длительность;
 *  - `voice` — провайдер вернул только АУДИО: подкладываем его под исходное видео
 *    (видеодорожка копируется без перекодирования) и сохраняем как новый mp4.
 */

export interface ResultVideo {
  buffer: Buffer
  width: number | null
  height: number | null
  durationSeconds: number | null
  hasAudio: boolean
}

export async function buildResultVideo(opts: {
  mode: "v2v" | "voice"
  /** Скачанный у провайдера файл: mp4 (v2v) или аудио (voice) */
  fetched: Buffer
  /** voice: id видео из библиотеки, на которое подкладывается звук */
  sourceVideoId?: string
  fallbackAudio: boolean
  fallbackDuration: number | null
}): Promise<ResultVideo> {
  const workDir = await mkdtemp(join(tmpdir(), "mg-result-"))
  try {
    let finalPath: string

    if (opts.mode === "voice") {
      if (!opts.sourceVideoId) throw new Error("Не найдено исходное видео для замены голоса")
      const [src] = await db
        .select({ s3Key: videos.s3Key })
        .from(videos)
        .where(eq(videos.id, opts.sourceVideoId))
      if (!src) throw new Error("Исходное видео для замены голоса удалено из библиотеки")

      const videoPath = join(workDir, "source.mp4")
      const audioPath = join(workDir, "voice.audio")
      finalPath = join(workDir, "out.mp4")
      await downloadToFile(src.s3Key, videoPath)
      await writeFile(audioPath, opts.fetched)
      await muxAudioOntoVideo(videoPath, audioPath, finalPath)
    } else {
      finalPath = join(workDir, "result.mp4")
      await writeFile(finalPath, opts.fetched)
    }

    const probe = await probeFile(finalPath)
    const buffer = opts.mode === "voice" ? await readFile(finalPath) : opts.fetched
    return {
      buffer,
      width: probe?.width ?? null,
      height: probe?.height ?? null,
      durationSeconds:
        probe && probe.durationSeconds > 0 ? Math.round(probe.durationSeconds) : opts.fallbackDuration,
      hasAudio: probe ? probe.hasAudio : opts.fallbackAudio,
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
