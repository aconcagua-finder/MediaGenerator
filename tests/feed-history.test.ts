import { describe, it, expect } from "vitest"
import { STALE_SYNC_JOB_ERROR, STALE_SYNC_JOB_MS, mapFeedStatus, mergeJobsById, syncJobStatus } from "@/lib/history/merge"
import { buildVoiceHistory, ttsSettingsSummary, type VoiceHistoryRow } from "@/lib/voice/history"
import { buildImageHistory, humanizeImageError, type ImageGenerationRow } from "@/lib/images/history"
import { voiceJobFromHistory } from "@/components/voice/voice-job"
import { imageJobFromHistory } from "@/components/generate/image-job"
import { splitStyleSuffix } from "@/components/generate/style-selector"

const NOW = new Date("2026-10-27T12:00:00Z").getTime()
const minutesAgo = (m: number) => new Date(NOW - m * 60_000)

describe("общие помощники лент", () => {
  it("статусы: processing/saving/pending → в работе", () => {
    expect(mapFeedStatus("saving")).toBe("processing")
    expect(mapFeedStatus("done")).toBe("done")
    expect(mapFeedStatus("error")).toBe("error")
  })

  it("синхронная задача «в работе» дольше 15 минут — ошибка", () => {
    expect(syncJobStatus("processing", minutesAgo(2), NOW)).toBe("processing")
    expect(syncJobStatus("processing", new Date(NOW - STALE_SYNC_JOB_MS - 1000), NOW)).toBe("error")
    expect(syncJobStatus("done", minutesAgo(600), NOW)).toBe("done")
  })

  it("слияние: свежие не дублируются, новые сверху", () => {
    const merged = mergeJobsById([{ id: "a", startedAt: 5 }], [{ id: "a", startedAt: 4 }, { id: "b", startedAt: 9 }])
    expect(merged.map((j) => j.id)).toEqual(["b", "a"])
  })
})

describe("«Мои озвучки» — сборка карточек", () => {
  const el: VoiceHistoryRow = {
    id: "v1",
    provider: "elevenlabs",
    model: "elevenlabs/eleven_v4",
    text: "[excited] Привет!",
    voice: "ycbyWsnf4hqZgdpKHqiU",
    params: { voice_name: "Rina", settings: { stability: 0.35, similarity_boost: 0.75, speed: 1.1 } },
    status: "done",
    cost: "0.0013",
    errorMessage: null,
    createdAt: minutesAgo(5),
  }
  const or: VoiceHistoryRow = {
    id: "v2",
    provider: "openrouter",
    model: "microsoft/mai-voice-2",
    text: "Текст",
    voice: "ru-RU-Lev:MAI-Voice-2",
    params: { speed: 1.25 },
    status: "done",
    cost: null,
    errorMessage: null,
    createdAt: minutesAgo(10),
  }

  it("ElevenLabs: имя голоса из params, настройки, сводка, аудио с длительностью", () => {
    const [item] = buildVoiceHistory({
      rows: [el],
      audios: [{ id: "a1", voiceGenerationId: "v1", format: "mp3", durationSeconds: 6, sizeBytes: 98263 }],
      now: NOW,
    })
    expect(item).toMatchObject({
      modelName: "ElevenLabs v4",
      provider: "elevenlabs",
      providerLabel: "ElevenLabs",
      voice: "ycbyWsnf4hqZgdpKHqiU",
      voiceName: "Rina",
      status: "done",
      cost: 0.0013,
      settings: { stability: 0.35, similarity_boost: 0.75, speed: 1.1 },
      settingsSummary: "стабильность 35% · скорость 1.10×",
      audio: { id: "a1", url: "/api/audios/a1", format: "mp3", durationSeconds: 6, sizeBytes: 98263 },
    })
    expect(item.speed).toBeUndefined()
  })

  it("OpenRouter: имя голоса из реестра, скорость, без аудио — null", () => {
    const [item] = buildVoiceHistory({ rows: [or], audios: [], now: NOW })
    expect(item).toMatchObject({
      modelName: "MAI-Voice-2",
      providerLabel: "OpenRouter",
      voiceName: "Лев (рус., муж.)",
      speed: 1.25,
      settingsSummary: "скорость 1.25×",
      audio: null,
    })
    expect(item.settings).toBeUndefined()
  })

  it("ошибки: по-русски; зависшая «в работе» — ошибка про перезапуск", () => {
    const [failed, stale, running] = buildVoiceHistory({
      rows: [
        { ...el, id: "e1", status: "error", errorMessage: "ElevenLabs 401 quota_exceeded: over" },
        { ...el, id: "e2", status: "processing", createdAt: minutesAgo(30) },
        { ...el, id: "e3", status: "processing", createdAt: minutesAgo(1) },
      ],
      audios: [],
      now: NOW,
    })
    expect(failed.error).toMatch(/закончились кредиты/)
    expect(stale).toMatchObject({ status: "error", error: STALE_SYNC_JOB_ERROR })
    expect(running.status).toBe("processing")
    expect(running.error).toBeUndefined()
  })

  it("пустые сохранённые настройки `{}` — без настроек и без сводки", () => {
    const [item] = buildVoiceHistory({ rows: [{ ...el, params: { voice_name: "Marina", settings: {} } }], audios: [], now: NOW })
    expect(item.settings).toBeUndefined()
    expect(item.settingsSummary).toBeNull()
  })

  it("сводка настроек: по умолчанию — пусто", () => {
    expect(ttsSettingsSummary({ stability: 0.5, similarity_boost: 0.75, speed: 1 })).toBeNull()
    expect(ttsSettingsSummary(undefined, 1)).toBeNull()
    expect(ttsSettingsSummary({ stability: 0.5, similarity_boost: 0.9, style: 0.2, use_speaker_boost: false })).toBe(
      "похожесть 90% · выразительность 20% · без усиления",
    )
  })

  it("карточка из истории: время, флаг истории", () => {
    const [item] = buildVoiceHistory({ rows: [el], audios: [], now: NOW })
    expect(voiceJobFromHistory(item)).toMatchObject({ id: "v1", fromHistory: true, startedAt: minutesAgo(5).getTime() })
  })
})

describe("«Мои картинки» — сборка карточек", () => {
  const row: ImageGenerationRow = {
    id: "g1",
    provider: "openrouter",
    model: "google/gemini-3.1-flash-lite-image",
    prompt: "кот в шляпе, photorealistic, high detail, professional photography",
    params: { image_size: "1K", aspect_ratio: "1:1" },
    status: "done",
    imagesCount: 2,
    cost: "0.0680",
    errorMessage: null,
    createdAt: minutesAgo(3),
    images: [
      { id: "i1", width: 1024, height: 1024 },
      { id: "i2", width: 1024, height: 1024 },
    ],
  }

  it("готовая генерация: картинки, параметры строками, стоимость", () => {
    const [item] = buildImageHistory([row], NOW)
    expect(item).toMatchObject({
      status: "done",
      cost: 0.068,
      imagesCount: 2,
      params: { image_size: "1K", aspect_ratio: "1:1" },
      images: [
        { id: "i1", url: "/api/images/i1" },
        { id: "i2", url: "/api/images/i2" },
      ],
      isEdit: false,
      parentImageId: null,
    })
  })

  it("правка: служебные поля не попадают в параметры, референс отмечен", () => {
    const [fromLib, fromUpload] = buildImageHistory(
      [
        { ...row, id: "e1", params: { quality: "high", _edit: true, parentImageId: "p1" } },
        { ...row, id: "e2", params: { _edit: true, uploadId: "u1", n: 2 } },
      ],
      NOW,
    )
    expect(fromLib).toMatchObject({ isEdit: true, parentImageId: "p1", params: { quality: "high" } })
    expect(fromUpload).toMatchObject({ isEdit: true, parentImageId: null, params: { n: "2" } })
  })

  it("ошибки провайдера по-русски, незнакомые — как есть; у ошибки нет картинок", () => {
    const [failed] = buildImageHistory([{ ...row, status: "error", errorMessage: "Request was rejected by the safety system" }], NOW)
    expect(failed.error).toMatch(/фильтром модели/)
    expect(failed.images).toEqual([])
    expect(humanizeImageError("insufficient credits")).toMatch(/закончились средства/)
    expect(humanizeImageError("Transparent background is not supported for this model.")).toMatch(/прозрачный фон/)
    expect(humanizeImageError("Something odd")).toBe("Something odd")
    expect(humanizeImageError("x".repeat(400))).toHaveLength(301)
  })

  it("зависшая генерация — ошибка, свежая — в работе", () => {
    const [stale, fresh] = buildImageHistory(
      [
        { ...row, id: "s", status: "processing", createdAt: minutesAgo(40), images: [] },
        { ...row, id: "f", status: "processing", createdAt: minutesAgo(1), images: [] },
      ],
      NOW,
    )
    expect(stale).toMatchObject({ status: "error", error: STALE_SYNC_JOB_ERROR })
    expect(fresh.status).toBe("processing")
    expect(imageJobFromHistory(fresh)).toMatchObject({ id: "f", fromHistory: true, imagesCount: 2 })
  })
})

describe("«Повторить» картинки: стиль из промпта", () => {
  it("суффикс стиля отделяется, без суффикса — «Без стиля»", () => {
    expect(splitStyleSuffix("кот в шляпе, photorealistic, high detail, professional photography")).toEqual({
      base: "кот в шляпе",
      styleId: "photo",
    })
    expect(splitStyleSuffix("просто кот")).toEqual({ base: "просто кот", styleId: "none" })
  })
})
