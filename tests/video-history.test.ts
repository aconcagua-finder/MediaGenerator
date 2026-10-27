import { describe, it, expect } from "vitest"
import {
  buildVideoHistory,
  historyModelName,
  isVoiceOverChild,
  mapHistoryStatus,
  parentGenerationId,
  voiceOverChildId,
  type HistoryGenerationRow,
  type HistorySourceRow,
  type HistoryVideoRow,
} from "@/lib/video/history"
import { voiceNameFromParams, voiceOverLabel } from "@/lib/video/voice-over"
import { parseLibraryTab } from "@/components/library/library-tabs"
import { mergeJobsById } from "@/lib/video/history-merge"

const NOW = new Date("2026-10-27T12:00:00Z").getTime()
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000)

function gen(over: Partial<HistoryGenerationRow> & { id: string }): HistoryGenerationRow {
  return {
    model: "google/veo-3.1-fast",
    prompt: "Кот на скейте",
    mode: "t2v",
    params: { duration: 8, resolution: "720p", aspect_ratio: "16:9", generate_audio: true },
    status: "done",
    cost: "0.6000",
    errorMessage: null,
    createdAt: hoursAgo(1),
    ...over,
  }
}

function vid(id: string, genId: string): HistoryVideoRow {
  return { id, videoGenerationId: genId, durationSeconds: 8, width: 1280, height: 720, hasAudio: true }
}

const PARENT = "c28575eb-0000-0000-0000-000000000001"
const CHILD = "2fa03cdd-0000-0000-0000-000000000002"
const SOURCE = "5a5a5a5a-0000-0000-0000-000000000003"

const v2vParent = gen({
  id: PARENT,
  model: "runway/aleph-2",
  mode: "v2v",
  prompt: "Сделай меня седым профессором",
  cost: "1.4000",
  params: {
    duration: 7.2,
    source_id: SOURCE,
    source_width: 720,
    source_height: 1280,
    voice_over: { engine: "elevenlabs", voice: "3EuKHIEZbSzrHGNmdYsx", voice_name: "Nikolay", generation_id: CHILD, settings: { stability: 0.4 } },
  },
})
const voiceChild = gen({
  id: CHILD,
  model: "eleven_multilingual_sts_v2",
  mode: "voice",
  prompt: "Замена голоса: Nikolay (ElevenLabs)",
  cost: "0.0144",
  params: { duration: 7.2, voice: "3EuKHIEZbSzrHGNmdYsx", voice_name: "Nikolay", parent_generation_id: PARENT },
})

describe("история видео — статусы и связи", () => {
  it("processing / saving / pending → в работе", () => {
    expect(mapHistoryStatus("processing")).toBe("processing")
    expect(mapHistoryStatus("saving")).toBe("processing")
    expect(mapHistoryStatus("pending")).toBe("processing")
    expect(mapHistoryStatus("done")).toBe("done")
    expect(mapHistoryStatus("error")).toBe("error")
  })

  it("родитель и ребёнок переозвучки распознаются по params", () => {
    expect(voiceOverChildId(v2vParent.params)).toBe(CHILD)
    expect(parentGenerationId(voiceChild.params)).toBe(PARENT)
    expect(isVoiceOverChild(voiceChild)).toBe(true)
    expect(isVoiceOverChild(v2vParent)).toBe(false)
    // ручная «Заменить голос» — без родителя, своя карточка
    expect(isVoiceOverChild(gen({ id: "m", mode: "voice", params: { voice: "Aurora" } }))).toBe(false)
    expect(voiceOverChildId(null)).toBeNull()
  })

  it("человеческие имена моделей, у замены голоса — движок", () => {
    expect(historyModelName("runway/aleph-2", "v2v")).toBe("Runway Aleph 2")
    expect(historyModelName("eleven_multilingual_sts_v2", "voice")).toBe("ElevenLabs")
    expect(historyModelName("fal-ai/elevenlabs/voice-changer", "voice")).toBe("ElevenLabs")
    expect(historyModelName("some/unknown", "t2v")).toBe("some/unknown")
  })
})

describe("история видео — подпись переозвучки", () => {
  it("«Переозвучка: голос · исходный промпт»", () => {
    expect(voiceOverLabel("Marina", "  Сделай меня седым  ")).toBe("Переозвучка: Marina · Сделай меня седым")
    expect(voiceOverLabel(null, "")).toBe("Переозвучка: другой голос")
  })

  it("имя голоса: voice_name ElevenLabs, иначе пресет fal", () => {
    expect(voiceNameFromParams({ voice: "ymDCYd8puC7gYjxIamPt", voice_name: "Marina" })).toBe("Marina")
    expect(voiceNameFromParams({ voice: "Brian" })).toBe("Brian")
    expect(voiceNameFromParams(null)).toBeNull()
  })
})

describe("история видео — сборка карточек", () => {
  const source: HistorySourceRow = {
    id: SOURCE,
    durationSeconds: "7.200",
    width: 720,
    height: 1280,
    hasAudio: true,
    sizeBytes: 5_000_000,
    originalName: "selfie.mp4",
    createdAt: hoursAgo(2),
  }

  it("v2v с переозвучкой: ребёнок не отдельной карточкой, его видео — внутри родителя", () => {
    const items = buildVideoHistory({
      rows: [voiceChild, v2vParent],
      children: [voiceChild],
      videos: [vid("vp", PARENT), vid("vc", CHILD)],
      sources: [source],
      now: NOW,
    })
    expect(items.map((i) => i.id)).toEqual([PARENT])
    const [p] = items
    expect(p).toMatchObject({
      mode: "v2v",
      modelName: "Runway Aleph 2",
      prompt: "Сделай меня седым профессором",
      status: "done",
      cost: 1.4,
      aspect: "720:1280",
      video: { id: "vp", url: "/api/videos/vp" },
    })
    expect(p.voiceOver).toMatchObject({
      voice: "3EuKHIEZbSzrHGNmdYsx",
      voiceName: "Nikolay",
      status: "done",
      generationId: CHILD,
      video: { id: "vc", url: "/api/videos/vc" },
      settings: { stability: 0.4 },
    })
    expect(p.source).toEqual({
      id: SOURCE,
      durationSeconds: 7.2,
      width: 720,
      height: 1280,
      hasAudio: true,
      sizeBytes: 5_000_000,
      name: "selfie.mp4",
    })
  })

  it("исходник старше 24 ч или удалённый — null («загрузите заново»)", () => {
    const old = buildVideoHistory({ rows: [v2vParent], children: [voiceChild], videos: [], sources: [{ ...source, createdAt: hoursAgo(25) }], now: NOW })
    expect(old[0].source).toBeNull()
    const gone = buildVideoHistory({ rows: [v2vParent], children: [voiceChild], videos: [], sources: [], now: NOW })
    expect(gone[0].source).toBeNull()
  })

  it("переозвучка в работе, заказана но не запущена, упала", () => {
    const processing = buildVideoHistory({
      rows: [v2vParent],
      children: [{ ...voiceChild, status: "processing" }],
      videos: [vid("vp", PARENT)],
      sources: [],
      now: NOW,
    })[0]
    expect(processing.voiceOver).toMatchObject({ status: "processing", generationId: CHILD })
    expect(processing.voiceOver?.video).toBeUndefined()

    const waitingParent = gen({
      id: "w",
      mode: "v2v",
      model: "runway/aleph-2",
      status: "processing",
      params: { voice_over: { engine: "elevenlabs", voice: "x", voice_name: "Marina" } },
    })
    const waiting = buildVideoHistory({ rows: [waitingParent], children: [], videos: [], sources: [], now: NOW })[0]
    expect(waiting).toMatchObject({ status: "processing", video: null, voiceOver: { status: "waiting", voiceName: "Marina" } })

    const failedChild = buildVideoHistory({
      rows: [v2vParent],
      children: [{ ...voiceChild, status: "error", errorMessage: "ElevenLabs 401 quota_exceeded: over quota" }],
      videos: [vid("vp", PARENT)],
      sources: [],
      now: NOW,
    })[0]
    expect(failedChild.voiceOver?.status).toBe("error")
    expect(failedChild.voiceOver?.error).toMatch(/закончились кредиты/)

    const launchError = gen({ id: "le", mode: "v2v", params: { voice_over: { voice: "Brian", error: "нет ключа" } } })
    expect(buildVideoHistory({ rows: [launchError], children: [], videos: [], sources: [], now: NOW })[0].voiceOver).toMatchObject({
      voiceName: "Brian",
      status: "error",
      error: "нет ключа",
    })
  })

  it("у упавшей v2v переозвучки нет; сырой JSON ошибки не показывается", () => {
    const [failed] = buildVideoHistory({
      rows: [{ ...v2vParent, status: "error", errorMessage: '[{"expected":"object","code":"invalid_type"}]' }],
      children: [],
      videos: [],
      sources: [],
      now: NOW,
    })
    expect(failed.voiceOver).toBeUndefined()
    expect(failed.error).toMatch(/Провайдер отклонил запрос/)
  })

  it("ошибка генерации — человеческий текст; готовое без файла — video null", () => {
    const [failed, deleted] = buildVideoHistory({
      rows: [
        gen({ id: "e", status: "error", cost: null, errorMessage: "The service is currently experiencing high load" }),
        gen({ id: "d" }),
      ],
      children: [],
      videos: [],
      sources: [],
      now: NOW,
    })
    expect(failed.status).toBe("error")
    expect(failed.error).toMatch(/временно перегружен/)
    expect(failed.cost).toBeNull()
    expect(deleted).toMatchObject({ status: "done", video: null })
  })

  it("t2v: параметры для «Повторить», время ISO, ручная замена голоса — своя карточка", () => {
    const manual = gen({ id: "mv", mode: "voice", model: "resemble-ai/chatterboxhd/speech-to-speech", prompt: "Замена голоса: Aurora (женский) (Chatterbox HD)", params: { voice: "Aurora" } })
    const items = buildVideoHistory({ rows: [gen({ id: "t" }), manual], children: [], videos: [vid("vt", "t"), vid("vm", "mv")], sources: [], now: NOW })
    expect(items.map((i) => i.id)).toEqual(["t", "mv"])
    expect(items[0].params).toEqual({ duration: 8, resolution: "720p", aspect_ratio: "16:9", generate_audio: true, character_orientation: undefined })
    expect(items[0].createdAt).toBe(hoursAgo(1).toISOString())
    expect(items[0].source).toBeUndefined()
    expect(items[1]).toMatchObject({ mode: "voice", modelName: "Chatterbox HD", video: { id: "vm" } })
    expect(items[1].voiceOver).toBeUndefined()
  })
})

describe("Библиотека: вкладка из адреса", () => {
  it("?tab=videos|audios, иначе «Фото»", () => {
    expect(parseLibraryTab("videos")).toBe("videos")
    expect(parseLibraryTab(["audios"])).toBe("audios")
    expect(parseLibraryTab("x")).toBe("photos")
    expect(parseLibraryTab(undefined)).toBe("photos")
  })
})

describe("история видео — слияние с задачами вкладки", () => {
  it("свежая задача не дублируется (остаётся её состояние), новые сверху", () => {
    const session = [{ id: "new", startedAt: 300, state: "вкладка" }]
    const loaded = [
      { id: "old", startedAt: 100, state: "бд" },
      { id: "new", startedAt: 290, state: "бд" },
      { id: "mid", startedAt: 200, state: "бд" },
    ]
    const merged = mergeJobsById(session, loaded)
    expect(merged.map((j) => j.id)).toEqual(["new", "mid", "old"])
    expect(merged[0].state).toBe("вкладка")
    // повторная загрузка той же страницы ничего не добавляет
    expect(mergeJobsById(merged, loaded)).toHaveLength(3)
  })
})
