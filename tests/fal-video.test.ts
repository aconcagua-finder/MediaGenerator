import { describe, it, expect, vi, afterEach } from "vitest"
import {
  falAppId,
  falQueueUrls,
  buildKlingMotionControlInput,
  buildFalVideoInput,
  falErrorMessage,
  extractFalOutputUrl,
  mapFalStatus,
  falSubmit,
  falPoll,
  validateFalKey,
} from "@/lib/providers/video/fal-video"
import {
  VOICE_CHANGE_ENGINES,
  getVoiceEngine,
  getVoiceEngineByEndpoint,
  buildVoiceChangeInput,
  estimateVoiceChangeCost,
  resolveVoicePreset,
} from "@/lib/providers/voice-change-models"
import { buildExtractAudioArgs, buildMuxArgs } from "@/lib/video/ffmpeg-audio"
import { getVideoModel, estimateV2VCost } from "@/lib/providers/video-models"

const VID = "https://mediagenerator.sanktum.net/api/media-link/T1/source.mp4"
const IMG = "https://mediagenerator.sanktum.net/api/media-link/T2/character.png"
const AUD = "https://mediagenerator.sanktum.net/api/media-link/T3/audio.mp3"

afterEach(() => vi.unstubAllGlobals())

describe("fal: адреса очереди", () => {
  it("app id — первые два сегмента model id", () => {
    expect(falAppId("fal-ai/kling-video/v3/pro/motion-control")).toBe("fal-ai/kling-video")
    expect(falAppId("resemble-ai/chatterboxhd/speech-to-speech")).toBe("resemble-ai/chatterboxhd")
    expect(falAppId("fal-ai/elevenlabs/voice-changer")).toBe("fal-ai/elevenlabs")
  })

  it("запасные status/response URL строятся по app id", () => {
    expect(falQueueUrls("fal-ai/kling-video/v3/standard/motion-control", "abc")).toEqual({
      statusUrl: "https://queue.fal.run/fal-ai/kling-video/requests/abc/status",
      responseUrl: "https://queue.fal.run/fal-ai/kling-video/requests/abc",
    })
  })
})

describe("Kling Motion Control: тело запроса", () => {
  it("минимальный набор полей по документации модели", () => {
    expect(buildKlingMotionControlInput({ videoUrl: VID, imageUrl: IMG })).toEqual({
      image_url: IMG,
      video_url: VID,
      character_orientation: "video",
      keep_original_sound: true,
    })
  })

  it("промпт опционален и обрезается; ориентация image", () => {
    const input = buildKlingMotionControlInput({ videoUrl: VID, imageUrl: IMG, prompt: "  танцует  ", orientation: "image" })
    expect(input.prompt).toBe("танцует")
    expect(input.character_orientation).toBe("image")
    expect(buildKlingMotionControlInput({ videoUrl: VID, imageUrl: IMG, prompt: "   " })).not.toHaveProperty("prompt")
  })

  it("только публичный HTTPS", () => {
    expect(() => buildKlingMotionControlInput({ videoUrl: "http://x/v.mp4", imageUrl: IMG })).toThrow()
    expect(() => buildKlingMotionControlInput({ videoUrl: VID, imageUrl: "data:image/png;base64,AA" })).toThrow()
  })

  it("buildFalVideoInput требует и видео, и картинку персонажа", () => {
    const model = "fal-ai/kling-video/v3/standard/motion-control"
    expect(() => buildFalVideoInput({ model, prompt: "", params: {}, apiKey: "k", characterImageUrl: IMG })).toThrow(/видео/)
    expect(() => buildFalVideoInput({ model, prompt: "", params: {}, apiKey: "k", sourceVideoUrl: VID })).toThrow(/персонажа/)
    const ok = buildFalVideoInput({
      model,
      prompt: "x",
      params: { character_orientation: "image" } as never,
      apiKey: "k",
      sourceVideoUrl: VID,
      characterImageUrl: IMG,
    })
    expect(ok.character_orientation).toBe("image")
    expect(() => buildFalVideoInput({ model: "fal-ai/unknown", prompt: "", params: {}, apiKey: "k" })).toThrow()
  })

  it("модели Kling MC в реестре: ключ fal, нужна картинка, цены с fal.ai", () => {
    const std = getVideoModel("fal-ai/kling-video/v3/standard/motion-control")!
    const pro = getVideoModel("fal-ai/kling-video/v3/pro/motion-control")!
    for (const m of [std, pro]) {
      expect(m.provider).toBe("fal")
      expect(m.modes).toEqual(["v2v"])
      expect(m.requiresCharacterImage).toBe(true)
    }
    expect(estimateV2VCost(std, 10)).toBeCloseTo(1.26, 4)
    expect(estimateV2VCost(pro, 10)).toBeCloseTo(1.68, 4)
  })
})

describe("fal: разбор ответов", () => {
  it("статусы очереди", () => {
    expect(mapFalStatus("IN_QUEUE")).toBe("pending")
    expect(mapFalStatus("IN_PROGRESS")).toBe("in_progress")
    expect(mapFalStatus("COMPLETED")).toBe("completed")
    expect(mapFalStatus(undefined)).toBe("pending")
  })

  it("URL результата: video / audio / audio_url", () => {
    expect(extractFalOutputUrl({ video: { url: "https://v3.fal.media/a.mp4" } })).toBe("https://v3.fal.media/a.mp4")
    expect(extractFalOutputUrl({ audio: { url: "https://v3.fal.media/a.mp3" }, seed: 1 })).toBe("https://v3.fal.media/a.mp3")
    expect(extractFalOutputUrl({ audio_url: "https://x/a.wav" })).toBe("https://x/a.wav")
    expect(extractFalOutputUrl({ nothing: true })).toBeNull()
  })

  it("причина ошибки: detail строкой, массивом {msg}, error, fallback", () => {
    expect(falErrorMessage({ detail: "invalid key credentials" }, "x")).toBe("invalid key credentials")
    expect(falErrorMessage({ detail: [{ msg: "field required" }, { msg: "bad url" }] }, "x")).toBe("field required; bad url")
    expect(falErrorMessage({ error: "boom" }, "x")).toBe("boom")
    expect(falErrorMessage({}, "fallback")).toBe("fallback")
  })
})

describe("fal: submit / poll по очереди (mock fetch)", () => {
  function mockFetch(handler: (url: string, init?: RequestInit) => { status?: number; json: unknown }) {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        const r = handler(String(url), init)
        return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json" } })
      }),
    )
    return calls
  }

  it("submit: POST queue.fal.run/<model>, заголовок Key, возвращает request_id и URL-ы", async () => {
    const calls = mockFetch(() => ({
      json: {
        request_id: "req-1",
        status_url: "https://queue.fal.run/fal-ai/kling-video/requests/req-1/status",
        response_url: "https://queue.fal.run/fal-ai/kling-video/requests/req-1",
      },
    }))
    const input = { image_url: IMG, video_url: VID }
    const out = await falSubmit("fal-ai/kling-video/v3/pro/motion-control", input, "SECRET")
    expect(out.requestId).toBe("req-1")
    expect(out.statusUrl).toContain("/req-1/status")
    expect(calls[0].url).toBe("https://queue.fal.run/fal-ai/kling-video/v3/pro/motion-control")
    expect(calls[0].init?.method).toBe("POST")
    const headers = calls[0].init?.headers as Record<string, string>
    expect(headers.Authorization).toBe("Key SECRET")
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(input)
  })

  it("submit: ошибка fal (баланс) пробрасывается текстом", async () => {
    mockFetch(() => ({ status: 403, json: { detail: "User is locked. Reason: Exhausted balance." } }))
    await expect(falSubmit("fal-ai/x/y", {}, "k")).rejects.toThrow(/Exhausted balance/)
  })

  const ctx = {
    model: "fal-ai/kling-video/v3/standard/motion-control",
    params: { providerState: { statusUrl: "https://q/status", responseUrl: "https://q/resp" } },
  }

  it("poll: IN_PROGRESS → in_progress без обращения к результату", async () => {
    const calls = mockFetch(() => ({ json: { status: "IN_PROGRESS" } }))
    const r = await falPoll("req-1", "k", ctx)
    expect(r.state).toBe("in_progress")
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://q/status")
  })

  it("poll: COMPLETED → тянет response_url и отдаёт URL видео (стоимости у fal нет)", async () => {
    mockFetch((url) =>
      url.endsWith("/status")
        ? { json: { status: "COMPLETED" } }
        : { json: { video: { url: "https://v3.fal.media/out.mp4" } } },
    )
    const r = await falPoll("req-1", "k", ctx)
    expect(r.state).toBe("completed")
    expect(r.videoUrls).toEqual(["https://v3.fal.media/out.mp4"])
    expect(r.cost).toBeUndefined()
  })

  it("poll: ошибка валидации/модерации на response_url (422) → failed с причиной, а не исключение", async () => {
    mockFetch((url) =>
      url.endsWith("/status")
        ? { json: { status: "COMPLETED" } }
        : { status: 422, json: { detail: [{ msg: "image does not contain a person" }] } },
    )
    const r = await falPoll("req-1", "k", ctx)
    expect(r.state).toBe("failed")
    expect(r.error).toContain("image does not contain a person")
  })

  it("poll: COMPLETED с error в статусе → failed", async () => {
    mockFetch(() => ({ json: { status: "COMPLETED", error: "Runner crashed" } }))
    const r = await falPoll("req-1", "k", ctx)
    expect(r.state).toBe("failed")
    expect(r.error).toBe("Runner crashed")
  })

  it("poll: серверная ошибка опроса — исключение (транзиентно, задачу не валим)", async () => {
    mockFetch(() => ({ status: 503, json: { detail: "overloaded" } }))
    await expect(falPoll("req-1", "k", ctx)).rejects.toThrow()
  })

  it("poll: без сохранённых URL строит адрес по model id", async () => {
    const calls = mockFetch(() => ({ json: { status: "IN_QUEUE" } }))
    const r = await falPoll("req-9", "k", { model: "fal-ai/kling-video/v3/pro/motion-control", params: null })
    expect(r.state).toBe("pending")
    expect(calls[0].url).toBe("https://queue.fal.run/fal-ai/kling-video/requests/req-9/status")
  })

  it("validateFalKey: 401 = неверный ключ, 404 = ключ принят, сеть упала = false", async () => {
    mockFetch(() => ({ status: 401, json: { detail: "invalid key credentials" } }))
    expect(await validateFalKey("bad")).toBe(false)
    mockFetch(() => ({ status: 404, json: { status: "NOT_FOUND" } }))
    expect(await validateFalKey("good")).toBe(true)
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network")
    }))
    expect(await validateFalKey("x")).toBe(false)
  })
})

describe("замена голоса: движки и тела запросов", () => {
  const eleven = getVoiceEngine("elevenlabs")!
  const chatter = getVoiceEngine("chatterbox")!

  it("движки и цены по fal.ai: ElevenLabs $0.30/мин, Chatterbox HD $0.02/мин", () => {
    expect(eleven.endpoint).toBe("fal-ai/elevenlabs/voice-changer")
    expect(chatter.endpoint).toBe("resemble-ai/chatterboxhd/speech-to-speech")
    expect(eleven.pricePerMinute).toBeCloseTo(0.3, 4)
    expect(chatter.pricePerMinute).toBeCloseTo(0.02, 4)
    expect(getVoiceEngineByEndpoint("fal-ai/elevenlabs/voice-changer")?.id).toBe("elevenlabs")
    expect(getVoiceEngine("nope")).toBeNull()
  })

  it("есть женские и мужские пресеты у каждого движка", () => {
    for (const e of VOICE_CHANGE_ENGINES) {
      expect(e.presets.some((p) => p.gender === "female")).toBe(true)
      expect(e.presets.some((p) => p.gender === "male")).toBe(true)
    }
    expect(eleven.supportsSample).toBe(false)
    expect(chatter.supportsSample).toBe(true)
  })

  it("оценка: цена за минуту × длительность", () => {
    expect(estimateVoiceChangeCost(eleven, 60)).toBeCloseTo(0.3, 4)
    expect(estimateVoiceChangeCost(eleven, 30)).toBeCloseTo(0.15, 4)
    expect(estimateVoiceChangeCost(chatter, 30)).toBeCloseTo(0.01, 4)
    expect(estimateVoiceChangeCost(eleven, 0)).toBe(0)
  })

  it("ElevenLabs: audio_url + voice (невалидный пресет → первый)", () => {
    expect(buildVoiceChangeInput({ engine: eleven, audioUrl: AUD, presetId: "Brian" })).toEqual({
      audio_url: AUD,
      voice: "Brian",
      remove_background_noise: false,
      output_format: "mp3_44100_128",
    })
    expect(buildVoiceChangeInput({ engine: eleven, audioUrl: AUD, presetId: "Hacker" }).voice).toBe(eleven.presets[0].id)
    expect(resolveVoicePreset(eleven, undefined).id).toBe(eleven.presets[0].id)
  })

  it("Chatterbox: пресет → target_voice, образец → target_voice_audio_url (перекрывает пресет)", () => {
    expect(buildVoiceChangeInput({ engine: chatter, audioUrl: AUD, presetId: "Vicky" })).toEqual({
      source_audio_url: AUD,
      high_quality_audio: false,
      target_voice: "Vicky",
    })
    const withSample = buildVoiceChangeInput({
      engine: chatter,
      audioUrl: AUD,
      presetId: "Vicky",
      sampleUrl: "https://mediagenerator.sanktum.net/api/media-link/T4/sample.wav",
    })
    expect(withSample.target_voice_audio_url).toBe("https://mediagenerator.sanktum.net/api/media-link/T4/sample.wav")
    expect(withSample).not.toHaveProperty("target_voice")
  })

  it("аудио-ссылка только HTTPS", () => {
    expect(() => buildVoiceChangeInput({ engine: eleven, audioUrl: "http://x/a.mp3" })).toThrow()
    expect(() => buildVoiceChangeInput({ engine: chatter, audioUrl: AUD, sampleUrl: "data:audio/wav;base64,AA" })).toThrow()
  })
})

describe("ffmpeg: аргументы замены голоса", () => {
  it("извлечение: без видео, моно 44.1 кГц, mp3", () => {
    const a = buildExtractAudioArgs("/t/in.mp4", "/t/a.mp3")
    expect(a).toContain("-vn")
    expect(a.join(" ")).toContain("-ac 1 -ar 44100")
    expect(a[a.length - 1]).toBe("/t/a.mp3")
  })

  it("подмена: видеодорожка копируется (-c:v copy), звук берётся из второго входа", () => {
    const a = buildMuxArgs("/t/v.mp4", "/t/a.mp3", "/t/out.mp4")
    const s = a.join(" ")
    expect(s).toContain("-c:v copy")
    expect(s).toContain("-map 0:v:0 -map 1:a:0")
    expect(s).toContain("-shortest")
    expect(s).toContain("+faststart")
    expect(a.indexOf("/t/v.mp4")).toBeLessThan(a.indexOf("/t/a.mp3"))
    expect(a[a.length - 1]).toBe("/t/out.mp4")
  })
})
