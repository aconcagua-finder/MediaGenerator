import { describe, it, expect } from "vitest"
import {
  VIDEO_MODELS,
  VIDEO_PRICING_SKUS,
  getVideoModel,
  estimateVideoCost,
  estimateV2VCost,
  isV2VModel,
  isFalModel,
  modelsForMode,
  videoPricePerSecond,
  defaultVideoParams,
} from "@/lib/providers/video-models"
import { buildOpenRouterVideoBody } from "@/lib/providers/video/openrouter-video"
import { humanizeVideoError } from "@/lib/video/humanize-error"
import {
  MAX_SOURCE_BYTES,
  MAX_SOURCE_SECONDS,
  closestAspectRatio,
  fileExtension,
  mimeForSource,
  validateSourceMeta,
} from "@/lib/video/source-limits"
import { parseProbeJson } from "@/lib/video/probe"
import { auditModelSet } from "@/lib/cron/registry-audit"

const SRC_URL = "https://mediagenerator.sanktum.net/api/media-link/TOKEN/source.mp4"

describe("Runway Aleph 2 в реестре", () => {
  const aleph = getVideoModel("runway/aleph-2")!

  it("зарегистрирована как v2v-модель OpenRouter с описанием по-русски", () => {
    expect(aleph).toBeTruthy()
    expect(aleph.vendor).toBe("runway")
    expect(aleph.modes).toEqual(["v2v"])
    expect(aleph.isNew).toBe(true)
    expect(isV2VModel(aleph)).toBe(true)
    expect(isFalModel(aleph)).toBe(false)
    expect(aleph.description).toMatch(/персонажа/)
    expect(aleph.description).toMatch(/движения/)
    expect(aleph.aspectRatios).toEqual(["16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "21:9"])
  })

  it("ставка — по живому SKU ($0.28/сек), нижняя граница — по замеру ($1.40)", () => {
    expect(videoPricePerSecond(aleph, "source")).toBeCloseTo(0.28, 4)
    // SKU говорит минимум $0.56, но живой замер дал $1.40 и для 4.0 сек, и для 7.2 сек
    expect(aleph.price.minPerGeneration).toBeCloseTo(1.4, 4)
    expect(VIDEO_PRICING_SKUS["runway/aleph-2"]).toEqual({
      cents_per_second_output: 28,
      minimum_cents_per_generation: 56,
    })
  })

  it("стоимость v2v = длительность исходника × цена за секунду, но не меньше нижней границы", () => {
    expect(estimateV2VCost(aleph, 10)).toBeCloseTo(2.8, 4)
    // исходник 7.2 сек: оценка по SKU ($2.02) консервативна относительно замера ($1.40)
    expect(estimateV2VCost(aleph, 7.2)).toBeCloseTo(2.016, 3)
    expect(estimateV2VCost(aleph, 7.2)).toBeGreaterThanOrEqual(1.4)
    expect(estimateV2VCost(aleph, 30)).toBeCloseTo(8.4, 4)
  })

  it("короткий исходник тянется до замеренной нижней границы", () => {
    // 4.004 сек (E2E): факт $1.40, оценка совпадает
    expect(estimateV2VCost(aleph, 4.004)).toBeCloseTo(1.4, 4)
    expect(estimateV2VCost(aleph, 1)).toBeCloseTo(1.4, 4)
    expect(estimateV2VCost(aleph, 5)).toBeCloseTo(1.4, 4)
    expect(estimateV2VCost(aleph, 5.5)).toBeCloseTo(1.54, 4)
  })

  it("нулевая/битая длительность → 0 (не списываем из воздуха)", () => {
    expect(estimateV2VCost(aleph, 0)).toBe(0)
    expect(estimateV2VCost(aleph, NaN)).toBe(0)
  })

  it("минимальная плата не влияет на обычные модели без неё", () => {
    const seedance = getVideoModel("bytedance/seedance-2.0")!
    expect(seedance.price.minPerGeneration).toBeUndefined()
    expect(estimateVideoCost(seedance, { durationSeconds: 4, resolution: "720p" })).toBeCloseTo(0.6048, 4)
  })

  it("defaultVideoParams не падает на модели без длительностей/разрешений", () => {
    const p = defaultVideoParams(aleph)
    expect(p.duration).toBe(0)
    expect(p.aspect_ratio).toBe("16:9")
  })
})

describe("режимы и видимость моделей", () => {
  it("в обычном режиме v2v-модели не показываются, в v2v — только они", () => {
    const gen = modelsForMode("generate", { hasFalKey: true })
    expect(gen.every((m) => !isV2VModel(m))).toBe(true)
    expect(gen.length).toBeGreaterThan(20)
    const v2v = modelsForMode("v2v", { hasFalKey: true })
    expect(v2v.every((m) => isV2VModel(m))).toBe(true)
    expect(v2v.map((m) => m.id)).toContain("runway/aleph-2")
  })

  it("fal-модели скрыты без ключа fal", () => {
    const without = modelsForMode("v2v", { hasFalKey: false })
    expect(without.some((m) => isFalModel(m))).toBe(false)
    expect(without.map((m) => m.id)).toEqual(["runway/aleph-2"])
    const withKey = modelsForMode("v2v", { hasFalKey: true })
    expect(withKey.some((m) => m.id === "fal-ai/kling-video/v3/standard/motion-control")).toBe(true)
  })

  it("ни одна существующая t2v/i2v-модель не потеряна и не стала v2v", () => {
    const legacy = VIDEO_MODELS.filter((m) => !isV2VModel(m))
    expect(legacy.length).toBe(VIDEO_MODELS.length - modelsForMode("v2v", { hasFalKey: true }).length)
    for (const m of legacy) expect(m.modes.some((x) => x === "t2v" || x === "i2v")).toBe(true)
  })

  it("аудит реестра сверяет с OpenRouter только его модели (fal-модели не «пропали»)", () => {
    const orIds = VIDEO_MODELS.filter((v) => (v.provider ?? "openrouter") === "openrouter").map((v) => v.id)
    expect(orIds).toContain("runway/aleph-2")
    expect(orIds.some((id) => id.startsWith("fal-ai/"))).toBe(false)
    const { removed } = auditModelSet(orIds, orIds.map((id) => ({ id })))
    expect(removed).toEqual([])
  })
})

describe("тело запроса OpenRouter (buildOpenRouterVideoBody)", () => {
  it("v2v: input_references — массив объектов video_url, без duration/resolution/audio", () => {
    const body = buildOpenRouterVideoBody({
      model: "runway/aleph-2",
      prompt: "Преврати человека в профессора",
      params: { aspect_ratio: "9:16", duration: 8, resolution: "720p", generate_audio: true },
      apiKey: "k",
      sourceVideoUrl: SRC_URL,
    })
    expect(body).toEqual({
      model: "runway/aleph-2",
      prompt: "Преврати человека в профессора",
      aspect_ratio: "9:16",
      input_references: [{ type: "video_url", video_url: { url: SRC_URL } }],
    })
    expect(body).not.toHaveProperty("duration")
    expect(body).not.toHaveProperty("resolution")
    expect(body).not.toHaveProperty("generate_audio")
    expect(body).not.toHaveProperty("frame_images")
  })

  it("v2v: seed пробрасывается, соотношение сторон необязательно", () => {
    const body = buildOpenRouterVideoBody({
      model: "runway/aleph-2",
      prompt: "p",
      params: { seed: 42 },
      apiKey: "k",
      sourceVideoUrl: SRC_URL,
    })
    expect(body.seed).toBe(42)
    expect(body).not.toHaveProperty("aspect_ratio")
  })

  it("v2v: data:-URI и http отклоняются до отправки", () => {
    for (const bad of ["data:video/mp4;base64,AAAA", "http://x.example/a.mp4", "not a url"]) {
      expect(() =>
        buildOpenRouterVideoBody({
          model: "runway/aleph-2",
          prompt: "p",
          params: {},
          apiKey: "k",
          sourceVideoUrl: bad,
        }),
      ).toThrow()
    }
  })

  it("t2v: прежний формат тела не изменился", () => {
    const body = buildOpenRouterVideoBody({
      model: "bytedance/seedance-2.0",
      prompt: "кот",
      params: { duration: 4, resolution: "720p", aspect_ratio: "16:9", generate_audio: true },
      apiKey: "k",
    })
    expect(body).toEqual({
      model: "bytedance/seedance-2.0",
      prompt: "кот",
      duration: 4,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
    })
  })

  it("i2v: frame_images — массив объектов с frame_type", () => {
    const body = buildOpenRouterVideoBody({
      model: "bytedance/seedance-2.0",
      prompt: "кот",
      params: { duration: 4 },
      apiKey: "k",
      frameImageDataUrl: "data:image/png;base64,AAAA",
    })
    expect(body.frame_images).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" }, frame_type: "first_frame" },
    ])
  })
})

describe("ошибка модерации Runway", () => {
  const raw =
    "Runway video generation was rejected by content moderation: SAFETY.INPUT.MULTIMODAL.NSFW (task abc)"

  it("превращается в русскую подсказку про откровенные формулировки", () => {
    const out = humanizeVideoError(raw)
    expect(out).toContain("Модерация Runway")
    expect(out).toMatch(/откровенные формулировки про фигуру и одежду/)
    expect(out).toMatch(/деньги не списываются/)
    expect(out).not.toContain("SAFETY.INPUT")
  })

  it("ловится и по одному коду SAFETY.INPUT", () => {
    expect(humanizeVideoError("SAFETY.INPUT.TEXT.NSFW")).toContain("Модерация Runway")
  })

  it("общий контент-фильтр других моделей отвечает по-старому", () => {
    expect(humanizeVideoError("Video generation completed with no output (content may have been filtered)")).toContain(
      "фильтром модели",
    )
  })

  it("баланс fal.ai — отдельная подсказка", () => {
    expect(humanizeVideoError("User is locked. Reason: Exhausted balance.")).toContain("fal.ai")
  })
})

describe("лимиты исходника", () => {
  it("константы по ТЗ: до 30 сек и 100 МБ", () => {
    expect(MAX_SOURCE_SECONDS).toBe(30)
    expect(MAX_SOURCE_BYTES).toBe(100 * 1024 * 1024)
  })

  it("принимает нормальный ролик", () => {
    expect(validateSourceMeta("video", { sizeBytes: 3_000_000, durationSeconds: 7.19, hasVideo: true }).ok).toBe(true)
    expect(validateSourceMeta("video", { sizeBytes: MAX_SOURCE_BYTES, durationSeconds: 30, hasVideo: true }).ok).toBe(true)
  })

  it("отклоняет слишком длинный, тяжёлый, пустой и без видеодорожки", () => {
    const long = validateSourceMeta("video", { sizeBytes: 1000, durationSeconds: 31, hasVideo: true })
    expect(long.ok).toBe(false)
    if (!long.ok) expect(long.message).toMatch(/максимум 30 сек/)
    expect(validateSourceMeta("video", { sizeBytes: MAX_SOURCE_BYTES + 1, durationSeconds: 5, hasVideo: true }).ok).toBe(false)
    expect(validateSourceMeta("video", { sizeBytes: 0, durationSeconds: 5, hasVideo: true }).ok).toBe(false)
    expect(validateSourceMeta("video", { sizeBytes: 1000, durationSeconds: 0, hasVideo: true }).ok).toBe(false)
    expect(validateSourceMeta("video", { sizeBytes: 1000, durationSeconds: 5, hasVideo: false }).ok).toBe(false)
  })

  it("образец голоса: другие лимиты и нужна звуковая дорожка", () => {
    expect(validateSourceMeta("audio", { sizeBytes: 500_000, durationSeconds: 45, hasAudio: true }).ok).toBe(true)
    expect(validateSourceMeta("audio", { sizeBytes: 11 * 1024 * 1024, durationSeconds: 20, hasAudio: true }).ok).toBe(false)
    expect(validateSourceMeta("audio", { sizeBytes: 1000, durationSeconds: 20, hasAudio: false }).ok).toBe(false)
  })

  it("расширение → MIME определяется по имени, регистр не важен", () => {
    expect(fileExtension("My Clip.MOV")).toBe("mov")
    expect(fileExtension("noext")).toBe("")
    expect(mimeForSource("video", "mov")).toBe("video/quicktime")
    expect(mimeForSource("video", "mp4")).toBe("video/mp4")
    expect(mimeForSource("video", "webm")).toBe("video/webm")
    expect(mimeForSource("video", "avi")).toBeNull()
    expect(mimeForSource("video", "mp3")).toBeNull()
    expect(mimeForSource("audio", "wav")).toBe("audio/wav")
  })

  it("соотношение по умолчанию — по ориентации исходника", () => {
    const aleph = getVideoModel("runway/aleph-2")!
    expect(closestAspectRatio(720, 1280, aleph.aspectRatios)).toBe("9:16")
    expect(closestAspectRatio(1920, 1080, aleph.aspectRatios)).toBe("16:9")
    expect(closestAspectRatio(1000, 1000, aleph.aspectRatios)).toBe("1:1")
    expect(closestAspectRatio(1080, 1440, aleph.aspectRatios)).toBe("3:4")
    expect(closestAspectRatio(0, 0, aleph.aspectRatios)).toBe("16:9")
  })
})

describe("разбор ffprobe", () => {
  it("видео со звуком", () => {
    const p = parseProbeJson({
      format: { duration: "7.189333" },
      streams: [
        { codec_type: "video", codec_name: "h264", width: 720, height: 1280 },
        { codec_type: "audio", codec_name: "aac" },
      ],
    })!
    expect(p.durationSeconds).toBeCloseTo(7.189, 3)
    expect(p.width).toBe(720)
    expect(p.height).toBe(1280)
    expect(p.hasVideo).toBe(true)
    expect(p.hasAudio).toBe(true)
    expect(p.videoCodec).toBe("h264")
  })

  it("поворот на 90° меняет ширину и высоту местами (портрет с телефона)", () => {
    const p = parseProbeJson({
      format: { duration: "5" },
      streams: [{ codec_type: "video", width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }],
    })!
    expect([p.width, p.height]).toEqual([1080, 1920])
    const q = parseProbeJson({
      format: { duration: "5" },
      streams: [{ codec_type: "video", width: 1920, height: 1080, tags: { rotate: "90" } }],
    })!
    expect([q.width, q.height]).toEqual([1080, 1920])
  })

  it("только аудио и мусорный ввод", () => {
    const a = parseProbeJson({ format: { duration: "12.5" }, streams: [{ codec_type: "audio" }] })!
    expect(a.hasVideo).toBe(false)
    expect(a.hasAudio).toBe(true)
    expect(a.width).toBeNull()
    expect(parseProbeJson(null)).toBeNull()
    expect(parseProbeJson({})!.durationSeconds).toBe(0)
  })
})
