import { runFfmpeg } from "./ffmpeg-audio"

/**
 * Частота кадров исходника для «Видео → видео». Runway Aleph отклоняет видео
 * выше 30 fps («INPUT_VALIDATION.VIDEO.UNSUPPORTED_FPS»), а телефоны по умолчанию
 * часто снимают в 60. Поэтому такие ролики при загрузке пересобираются в 30 fps:
 * Kling принимает оба варианта, движения и мимика при 30 fps не страдают.
 */

export const MAX_SOURCE_FPS = 30

/** Небольшой допуск: 30.0x из-за округления таймстемпов пересобирать незачем */
export function needsFpsNormalize(fps: number | null): boolean {
  return fps !== null && fps > MAX_SOURCE_FPS + 0.5
}

/**
 * Пересборка в mp4 30 fps. Поворот с телефона ffmpeg применяет сам (кадр
 * становится вертикальным, метка поворота сбрасывается); звук перекодируется в
 * AAC, потому что mp4 принимает не любой звуковой кодек из mov.
 */
export function buildFpsNormalizeArgs(inPath: string, outPath: string): string[] {
  return [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", inPath,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-vf", `fps=${MAX_SOURCE_FPS}`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outPath,
  ]
}

export function normalizeSourceFps(inPath: string, outPath: string): Promise<void> {
  return runFfmpeg(buildFpsNormalizeArgs(inPath, outPath))
}
