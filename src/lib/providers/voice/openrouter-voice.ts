import type { VoiceProvider, VoiceSynthRequest, VoiceSynthResult } from "./types"

const OPENROUTER_BASE = "https://openrouter.ai/api/v1"

/** Gemini TTS отдаёт сырой PCM с этими параметрами (audio/pcm;rate=24000;channels=1). */
const PCM_SAMPLE_RATE = 24000
const PCM_CHANNELS = 1
const PCM_BITS = 16

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    "X-Title": "MediaGenerator",
  }
}

/**
 * Завернуть сырой PCM (s16le) в WAV-контейнер (44-байтный заголовок).
 * Нужно для Gemini TTS, который отдаёт headerless PCM 24kHz/mono — браузерный
 * <audio> его не проигрывает без контейнера.
 */
function pcmToWav(
  pcm: Buffer,
  sampleRate = PCM_SAMPLE_RATE,
  channels = PCM_CHANNELS,
  bitsPerSample = PCM_BITS,
): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16) // подчанк fmt = 16 байт
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write("data", 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/** Достать сообщение об ошибке из JSON-тела провайдера. */
function extractError(raw: string, status: number): string {
  try {
    const j = JSON.parse(raw) as { error?: { message?: string } | string }
    const msg = typeof j.error === "string" ? j.error : j.error?.message
    if (msg) return msg
  } catch {
    /* не JSON */
  }
  return `Провайдер вернул ошибку (HTTP ${status})`
}

export const openrouterVoiceProvider: VoiceProvider = {
  async synth(req: VoiceSynthRequest, apiKey: string): Promise<VoiceSynthResult> {
    const body: Record<string, unknown> = {
      model: req.model,
      input: req.text,
      voice: req.voice,
      response_format: req.requestFormat,
    }
    if (typeof req.speed === "number" && req.speed !== 1) body.speed = req.speed

    const res = await fetch(`${OPENROUTER_BASE}/audio/speech`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    })

    const contentType = res.headers.get("content-type") || ""
    const generationId = res.headers.get("x-generation-id")

    // Успех = поток байтов аудио. Ошибка приходит JSON-ом ({error:{message}}).
    if (!res.ok || !contentType.includes("audio")) {
      const raw = await res.text().catch(() => "")
      throw new Error(extractError(raw, res.status))
    }

    const raw = Buffer.from(await res.arrayBuffer())

    if (req.requestFormat === "pcm") {
      return {
        buffer: pcmToWav(raw),
        contentType: "audio/wav",
        outputFormat: "wav",
        pcm: { sampleRate: PCM_SAMPLE_RATE, channels: PCM_CHANNELS, bitsPerSample: PCM_BITS },
        generationId,
      }
    }

    return {
      buffer: raw,
      contentType: "audio/mpeg",
      outputFormat: "mp3",
      generationId,
    }
  },

  async fetchCost(generationId: string, apiKey: string): Promise<number | null> {
    // /audio/speech не возвращает usage в теле — фактическую стоимость можно
    // узнать только запросом к /generation. Для TTS она часто не успевает
    // проставиться, поэтому best-effort с короткими повторами.
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 1200))
      try {
        const r = await fetch(`${OPENROUTER_BASE}/generation?id=${encodeURIComponent(generationId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!r.ok) continue
        const j = (await r.json()) as { data?: { total_cost?: unknown } }
        const c = j.data?.total_cost
        if (typeof c === "number" && isFinite(c)) return c
      } catch {
        /* повторим */
      }
    }
    return null
  },
}
