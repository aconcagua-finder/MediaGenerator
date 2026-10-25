import { describe, it, expect, vi, afterEach } from "vitest"
import {
  buildVoiceChangerRequest,
  buildSharedVoicesPath,
  elevenLabsVoiceChange,
  parseElevenLabsError,
  validateElevenLabsKey,
} from "@/lib/providers/elevenlabs"
import {
  catalogCacheKey,
  filterPremadeVoices,
  mapPremadeVoice,
  mapSharedVoice,
  parseCatalogQuery,
  pickPreview,
  splitVoiceName,
  voiceChips,
  type CatalogVoice,
} from "@/lib/providers/elevenlabs-voices"
import { DEFAULT_VOICE_SETTINGS } from "@/lib/providers/voice-change-models"
import { convertedAudioKey, elevenlabsVideoProvider } from "@/lib/providers/video/elevenlabs-video"
import { humanizeVideoError } from "@/lib/video/humanize-error"

const MARINA = "ymDCYd8puC7gYjxIamPt"

afterEach(() => vi.unstubAllGlobals())

describe("ElevenLabs: запрос замены голоса", () => {
  it("адрес с voice_id и mp3 44.1 кГц, multipart-поля как в API", async () => {
    const { url, body } = buildVoiceChangerRequest({
      voiceId: MARINA,
      audio: new Uint8Array([1, 2, 3]),
      settings: { ...DEFAULT_VOICE_SETTINGS, stability: 0.4, style: 0.2 },
    })
    expect(url).toBe(`https://api.elevenlabs.io/v1/voice-changer/${MARINA}?output_format=mp3_44100_128`)
    expect(body.get("model_id")).toBe("eleven_multilingual_sts_v2")
    expect(JSON.parse(body.get("voice_settings") as string)).toEqual({
      stability: 0.4,
      similarity_boost: 0.75,
      style: 0.2,
      use_speaker_boost: true,
    })
    expect(body.get("remove_background_noise")).toBe("true")
    expect(body.has("seed")).toBe(false)
    const audio = body.get("audio") as File
    expect(audio.name).toBe("audio.mp3")
    expect(audio.type).toBe("audio/mpeg")
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("remove_background_noise=false и seed передаются, remove_background_noise не попадает в voice_settings", () => {
    const { body } = buildVoiceChangerRequest({
      voiceId: MARINA,
      audio: new Uint8Array([0]),
      settings: { ...DEFAULT_VOICE_SETTINGS, remove_background_noise: false },
      seed: 42,
    })
    expect(body.get("remove_background_noise")).toBe("false")
    expect(body.get("seed")).toBe("42")
    expect(JSON.parse(body.get("voice_settings") as string)).not.toHaveProperty("remove_background_noise")
  })

  it("некорректный voice_id не уходит в адрес", () => {
    expect(() =>
      buildVoiceChangerRequest({ voiceId: "../v1/user", audio: new Uint8Array([0]), settings: DEFAULT_VOICE_SETTINGS }),
    ).toThrow()
  })

  it("ошибка API → ElevenLabsError с кодом из detail.status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: { status: "quota_exceeded", message: "This request exceeds your quota" } }), {
          status: 401,
        }),
      ),
    )
    await expect(
      elevenLabsVoiceChange("k", { voiceId: MARINA, audio: new Uint8Array([0]), settings: DEFAULT_VOICE_SETTINGS }),
    ).rejects.toMatchObject({ httpStatus: 401, code: "quota_exceeded" })
  })

  it("успех → байты ответа и заголовок ключа", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([9, 8, 7]), { status: 200, headers: { "content-type": "audio/mpeg", "request-id": "r1" } }))
    vi.stubGlobal("fetch", fetchMock)
    const out = await elevenLabsVoiceChange("secret", {
      voiceId: MARINA,
      audio: new Uint8Array([0]),
      settings: DEFAULT_VOICE_SETTINGS,
    })
    expect([...out.buffer]).toEqual([9, 8, 7])
    expect(out.requestId).toBe("r1")
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("secret")
  })
})

describe("ElevenLabs: проверка ключа", () => {
  it("200 — ключ рабочий", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })))
    expect(await validateElevenLabsKey("k")).toBe(true)
  })

  it("ключ без права User: read — настоящий, принимаем", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: { status: "missing_permissions", message: "x" } }), { status: 401 })),
    )
    expect(await validateElevenLabsKey("k")).toBe(true)
  })

  it("неверный ключ и сетевая ошибка — нет", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: { status: "invalid_api_key", message: "Invalid API key" } }), { status: 401 })),
    )
    expect(await validateElevenLabsKey("k")).toBe(false)
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))))
    expect(await validateElevenLabsKey("k")).toBe(false)
  })
})

describe("ElevenLabs: ошибки по-русски", () => {
  const h = (status: number, body: unknown) => humanizeVideoError(parseElevenLabsError(status, body).message)

  it("неверный ключ", () => {
    expect(h(401, { detail: { status: "invalid_api_key", message: "Invalid API key" } })).toMatch(/Ключ ElevenLabs недействителен/)
  })

  it("нет прав у ключа", () => {
    expect(h(401, { detail: { status: "missing_permissions", message: "The API key lacks speech_to_speech" } })).toMatch(
      /не хватает прав.*Voice Changer/,
    )
  })

  it("кончились кредиты", () => {
    expect(h(401, { detail: { status: "quota_exceeded", message: "This request exceeds your quota of 40000" } })).toMatch(
      /закончились кредиты/,
    )
  })

  it("голос недоступен", () => {
    expect(h(400, { detail: { status: "voice_not_found", message: "A voice with the voice_id was not found" } })).toMatch(
      /голос ElevenLabs недоступен/,
    )
  })

  it("слишком длинный звук", () => {
    expect(h(400, { detail: { status: "audio_too_long", message: "Audio duration exceeds 300 seconds" } })).toMatch(
      /5-минутном/,
    )
  })

  it("перегрузка и таймаут", () => {
    expect(h(429, { detail: { status: "too_many_concurrent_requests", message: "busy" } })).toMatch(/перегружен/)
    expect(humanizeVideoError("ElevenLabs 504 timeout: voice changer: no response in 120 s")).toMatch(/не ответил/)
  })

  it("незнакомая ошибка — текст ElevenLabs, не теряем", () => {
    expect(h(400, { detail: { status: "invalid_audio", message: "Unsupported audio format" } })).toBe(
      "ElevenLabs вернул ошибку: Unsupported audio format",
    )
    expect(h(422, { detail: [{ msg: "field required" }] })).toBe("ElevenLabs вернул ошибку: field required")
  })

  it("ошибки других провайдеров не задеты", () => {
    expect(humanizeVideoError("Exhausted balance")).toMatch(/fal\.ai/)
  })
})

describe("каталог голосов: разбор ответов", () => {
  const STS_PREVIEW = "https://storage.googleapis.com/x/ru-sts.mp3"
  const shared = {
    voice_id: MARINA,
    name: "Marina - Soft, Clear and Warm",
    gender: "female",
    age: "middle_aged",
    use_case: "narrative_story",
    language: "ru",
    preview_url: "https://storage.googleapis.com/x/base.mp3",
    verified_languages: [
      { language: "ru", model_id: "eleven_turbo_v2_5", preview_url: "https://storage.googleapis.com/x/ru-turbo.mp3" },
      { language: "ru", model_id: "eleven_multilingual_sts_v2", preview_url: STS_PREVIEW },
      { language: "hi", model_id: "eleven_multilingual_sts_v2", preview_url: "https://storage.googleapis.com/x/hi.mp3" },
    ],
  }

  it("имя делится на название и описание (дефис или тире)", () => {
    expect(splitVoiceName("Marina - Soft, Clear and Warm")).toEqual({ title: "Marina", description: "Soft, Clear and Warm" })
    expect(splitVoiceName("Marusya G – Trusted Customer Care")).toEqual({ title: "Marusya G", description: "Trusted Customer Care" })
    expect(splitVoiceName("Elena Gromova — Podcasts")).toEqual({ title: "Elena Gromova", description: "Podcasts" })
    expect(splitVoiceName("Nastya")).toEqual({ title: "Nastya", description: "" })
    expect(splitVoiceName("Anna-Maria")).toEqual({ title: "Anna-Maria", description: "" })
  })

  it("голос библиотеки → компактный DTO, превью — русское для STS", () => {
    expect(mapSharedVoice(shared)).toEqual({
      id: MARINA,
      name: "Marina - Soft, Clear and Warm",
      title: "Marina",
      description: "Soft, Clear and Warm",
      gender: "female",
      age: "middle_aged",
      useCase: "narrative_story",
      language: "ru",
      previewUrl: STS_PREVIEW,
      ruVerified: true,
    })
  })

  it("превью: любой русский, иначе общее; ruVerified только для STS-модели", () => {
    expect(
      pickPreview({
        preview_url: "https://x/base.mp3",
        verified_languages: [{ language: "ru", model_id: "eleven_turbo_v2_5", preview_url: "https://x/ru.mp3" }],
      }),
    ).toEqual({ previewUrl: "https://x/ru.mp3", ruVerified: false })
    expect(pickPreview({ preview_url: "https://x/base.mp3", verified_languages: [] })).toEqual({
      previewUrl: "https://x/base.mp3",
      ruVerified: false,
    })
    expect(pickPreview({})).toEqual({ previewUrl: null, ruVerified: false })
  })

  it("мусор без id/имени отбрасывается", () => {
    expect(mapSharedVoice(null)).toBeNull()
    expect(mapSharedVoice({ name: "x" })).toBeNull()
    expect(mapPremadeVoice({ voice_id: "x" })).toBeNull()
  })

  it("стандартный голос: свойства из labels", () => {
    const v = mapPremadeVoice({
      voice_id: "CwhRBWXzGAHq8TQ4Fs17",
      name: "Roger - Laid-Back, Casual, Resonant",
      category: "premade",
      labels: { age: "middle_aged", gender: "male", use_case: "conversational", language: "en" },
      preview_url: "https://x/roger.mp3",
      verified_languages: [{ language: "en", model_id: "eleven_multilingual_v2" }],
    })
    expect(v).toMatchObject({
      title: "Roger",
      description: "Laid-Back, Casual, Resonant",
      gender: "male",
      language: "en",
      previewUrl: "https://x/roger.mp3",
      ruVerified: false,
    })
  })

  it("чипы по-русски", () => {
    expect(voiceChips({ gender: "female", age: "middle_aged", useCase: "narrative_story" })).toEqual([
      "женский",
      "средний возраст",
      "рассказ",
    ])
    expect(voiceChips({ gender: null, age: "old", useCase: "some_new_case" })).toEqual(["пожилой", "some new case"])
  })
})

describe("каталог голосов: запрос", () => {
  it("query string: по умолчанию русские, 30 на страницу; мусор отбрасывается", () => {
    expect(parseCatalogQuery(new URLSearchParams(""))).toEqual({
      scope: "ru",
      gender: undefined,
      age: undefined,
      search: undefined,
      page: 0,
      pageSize: 30,
    })
    expect(
      parseCatalogQuery(
        new URLSearchParams("scope=library&gender=male&age=old&search=  deep   voice &page=2&pageSize=500"),
      ),
    ).toEqual({ scope: "library", gender: "male", age: "old", search: "deep voice", page: 2, pageSize: 50 })
    expect(parseCatalogQuery(new URLSearchParams("scope=x&gender=robot&age=1&page=-1"))).toMatchObject({
      scope: "ru",
      gender: undefined,
      age: undefined,
      page: 0,
    })
  })

  it("адрес библиотеки: язык только для русских, сортировка по популярности", () => {
    const ru = buildSharedVoicesPath({ scope: "ru", gender: "female", page: 1, pageSize: 30, search: "мягкий голос" })
    const u = new URL(`https://api.elevenlabs.io${ru}`)
    expect(u.pathname).toBe("/v1/shared-voices")
    expect(Object.fromEntries(u.searchParams)).toEqual({
      page_size: "30",
      page: "1",
      sort: "usage_character_count_1y",
      language: "ru",
      gender: "female",
      search: "мягкий голос",
    })
    const all = new URL(`https://api.elevenlabs.io${buildSharedVoicesPath({ scope: "library", page: 0, pageSize: 30 })}`)
    expect(all.searchParams.has("language")).toBe(false)
  })

  it("ключ кэша зависит от всех фильтров", () => {
    const base = { scope: "ru" as const, page: 0, pageSize: 30 }
    expect(catalogCacheKey(base)).not.toBe(catalogCacheKey({ ...base, gender: "male" }))
    expect(catalogCacheKey({ ...base, search: "Ivan" })).toBe(catalogCacheKey({ ...base, search: "ivan" }))
  })

  it("стандартные голоса: фильтр и страницы на нашей стороне", () => {
    const mk = (i: number, gender: string): CatalogVoice => ({
      id: `v${i}`,
      name: `Voice${i}`,
      title: `Voice${i}`,
      description: "",
      gender,
      age: "young",
      useCase: null,
      language: "en",
      previewUrl: null,
      ruVerified: false,
    })
    const voices = Array.from({ length: 5 }, (_, i) => mk(i, i % 2 ? "male" : "female"))
    const page0 = filterPremadeVoices(voices, { scope: "standard", gender: "female", page: 0, pageSize: 2 })
    expect(page0.voices.map((v) => v.id)).toEqual(["v0", "v2"])
    expect(page0.hasMore).toBe(true)
    const page1 = filterPremadeVoices(voices, { scope: "standard", gender: "female", page: 1, pageSize: 2 })
    expect(page1.voices.map((v) => v.id)).toEqual(["v4"])
    expect(page1.hasMore).toBe(false)
    expect(filterPremadeVoices(voices, { scope: "standard", search: "voice3", page: 0, pageSize: 10 }).voices).toHaveLength(1)
  })
})

describe("провайдер elevenlabs для finalize", () => {
  it("готовый звук в providerState → completed, иначе failed", async () => {
    const ctx = { model: "eleven_multilingual_sts_v2", params: { providerState: { convertedKey: "video-sources/g/converted.mp3" } } }
    expect(convertedAudioKey(ctx)).toBe("video-sources/g/converted.mp3")
    expect(await elevenlabsVideoProvider.poll("r1", "", ctx)).toEqual({
      state: "completed",
      videoUrls: ["video-sources/g/converted.mp3"],
    })
    expect((await elevenlabsVideoProvider.poll("r1", "", { model: "m", params: {} })).state).toBe("failed")
    expect(elevenlabsVideoProvider.pollsWithoutKey).toBe(true)
  })
})
