import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runFfmpeg } from "./ffmpeg-audio"

/**
 * Постер видео (JPG, вписан в 640×640): нужен истории на /video, чтобы карточка
 * показывала кадр, не скачивая mp4. Делается при сохранении результата в
 * `finalize.ts`; у старых видео постера нет — UI рисует нейтральную заглушку.
 * Ключ в S3 — `videos/{generationId}/poster.jpg`, путь хранится в
 * `videos.metadata.posterKey`, отдаёт `GET /api/videos/{id}/poster`.
 */

/** Кадр чуть позже нуля (первый кадр часто чёрный после затемнения), вписанный в 640×640 */
export function buildPosterArgs(videoPath: string, outPath: string, atSeconds: number): string[] {
  return [
    "-y", "-hide_banner", "-loglevel", "error",
    "-ss", String(atSeconds),
    "-i", videoPath,
    "-frames:v", "1",
    "-vf", "scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-q:v", "5",
    outPath,
  ]
}

/** Постер из mp4 или null (ошибка ffmpeg не должна мешать сохранению видео) */
export async function createPoster(video: Buffer): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), "mg-poster-"))
  try {
    const input = join(dir, "in.mp4")
    const out = join(dir, "poster.jpg")
    await writeFile(input, video)
    // У очень короткого ролика кадра на 0.3 с может не быть — тогда берём самый первый
    for (const at of [0.3, 0]) {
      try {
        await runFfmpeg(buildPosterArgs(input, out, at))
        const jpg = await readFile(out)
        if (jpg.length > 0) return jpg
      } catch {
        // следующая попытка
      }
    }
    return null
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export { posterKeyOf } from "./poster-key"
