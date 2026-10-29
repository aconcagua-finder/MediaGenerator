import { estimateVideoCost, type VideoModel } from "@/lib/providers/video-models"
import { AUTO_VOICE_ENGINE, estimateVoiceChangeCost, getVoiceEngine } from "@/lib/providers/voice-change-models"

/**
 * Оценка генерации текст/картинка → видео с автопереозвучкой: видео +
 * замена голоса на заказанную длительность (звук результата ≈ её длине).
 * Общая для формы и `POST /api/video/generate`.
 */
export function estimateGenerationCost(
  model: VideoModel,
  opts: { durationSeconds: number; resolution?: string; audio: boolean; voiceOver: boolean },
): { video: number; voiceOver: number; total: number } {
  const video = estimateVideoCost(model, {
    durationSeconds: opts.durationSeconds,
    resolution: opts.resolution,
    audio: opts.audio,
  })
  const voiceOver = opts.voiceOver ? estimateVoiceChangeCost(getVoiceEngine(AUTO_VOICE_ENGINE)!, opts.durationSeconds) : 0
  return { video, voiceOver, total: video + voiceOver }
}
