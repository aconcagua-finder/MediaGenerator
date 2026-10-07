import { describe, it, expect, vi, afterEach } from "vitest"
import { openrouterProvider, usesImagesApi } from "@/lib/providers/openrouter"

// 1x1 PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      return handler(url, init)
    }),
  )
  return calls
}

const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 })

afterEach(() => vi.unstubAllGlobals())

describe("OpenRouter: выбор эндпоинта", () => {
  it("старые модели остаются на chat/completions, новые идут в Images API", () => {
    for (const id of [
      "google/gemini-3.1-flash-image",
      "openai/gpt-5.4-image-2",
      "black-forest-labs/flux.2-pro",
      "bytedance-seed/seedream-4.5",
    ]) {
      expect(usesImagesApi(id), id).toBe(false)
    }
    for (const id of [
      "black-forest-labs/flux-3-image",
      "bytedance-seed/seedream-5-0-lite",
      "recraft/recraft-v4.1",
      "openai/gpt-image-2.5-sunburst",
    ]) {
      expect(usesImagesApi(id), id).toBe(true)
    }
  })
})

describe("OpenRouter: Images API", () => {
  it("формирует запрос: resolution из image_size, n=1, без chat-полей", async () => {
    const calls = mockFetch(() =>
      ok({ data: [{ b64_json: PNG_B64, media_type: "image/png" }], usage: { cost: 0.024 } }),
    )
    const res = await openrouterProvider.generate({
      model: "black-forest-labs/flux-3-image",
      prompt: "кот",
      params: { aspect_ratio: "16:9", image_size: "2K" },
      count: 1,
      apiKey: "k",
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/images")
    expect(calls[0].body).toEqual({
      model: "black-forest-labs/flux-3-image",
      prompt: "кот",
      n: 1,
      aspect_ratio: "16:9",
      resolution: "2K",
    })
    expect(res.images[0].format).toBe("png")
    expect(res.images[0].width).toBe(1)
    // реальная сумма из usage.cost, а не оценка реестра
    expect(res.cost).toBeCloseTo(0.024, 6)
  })

  it("count > 1 — отдельные запросы n=1 (часть моделей принимает только 1)", async () => {
    const calls = mockFetch(() => ok({ data: [{ b64_json: PNG_B64 }], usage: { cost: 0.01 } }))
    const res = await openrouterProvider.generate({
      model: "krea/krea-2-medium-turbo",
      prompt: "x",
      params: {},
      count: 3,
      apiKey: "k",
    })
    expect(calls).toHaveLength(3)
    expect(calls.every((c) => c.body.n === 1)).toBe(true)
    expect(res.images).toHaveLength(3)
    expect(res.cost).toBeCloseTo(0.03, 6)
  })

  it("если usage.cost нет — оценка из реестра цен", async () => {
    mockFetch(() => ok({ data: [{ b64_json: PNG_B64 }] }))
    const res = await openrouterProvider.generate({
      model: "bytedance-seed/seedream-5-0-flash",
      prompt: "x",
      params: { image_size: "1K" },
      count: 2,
      apiKey: "k",
    })
    expect(res.cost).toBeCloseTo(0.036, 6)
  })

  it("векторные модели просят SVG и отдают формат svg", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64")
    const calls = mockFetch(() => ok({ data: [{ b64_json: svg, media_type: "image/svg+xml" }] }))
    const res = await openrouterProvider.generate({
      model: "recraft/recraft-v4-vector",
      prompt: "логотип",
      params: { aspect_ratio: "1:1" },
      count: 1,
      apiKey: "k",
    })
    expect(calls[0].body.output_format).toBe("svg")
    expect(res.images[0].format).toBe("svg")
    expect(res.images[0].width).toBeGreaterThan(0)
  })

  it("tier 0.5K мапится в 512, quality пробрасывается", async () => {
    const calls = mockFetch(() => ok({ data: [{ b64_json: PNG_B64 }] }))
    await openrouterProvider.generate({
      model: "x-ai/grok-imagine-image-2.0",
      prompt: "x",
      params: { image_size: "0.5K", quality: "low" },
      count: 1,
      apiKey: "k",
    })
    expect(calls[0].body.resolution).toBe("512")
    expect(calls[0].body.quality).toBe("low")
  })

  it("частичный отказ: успешные картинки возвращаются, платим только за них", async () => {
    let n = 0
    mockFetch(() => {
      n++
      return n === 2
        ? new Response(JSON.stringify({ error: { message: "boom" } }), { status: 502 })
        : ok({ data: [{ b64_json: PNG_B64 }], usage: { cost: 0.02 } })
    })
    const res = await openrouterProvider.generate({
      model: "qwen/qwen-image-3",
      prompt: "x",
      params: {},
      count: 3,
      apiKey: "k",
    })
    expect(res.images).toHaveLength(2)
    expect(res.cost).toBeCloseTo(0.04, 6)
  })

  it("все запросы упали — ошибка провайдера пробрасывается", async () => {
    mockFetch(() => new Response(JSON.stringify({ error: { message: "нужна проверка 18+" } }), { status: 403 }))
    await expect(
      openrouterProvider.generate({ model: "meta/muse-image", prompt: "x", params: {}, count: 1, apiKey: "k" }),
    ).rejects.toThrow("нужна проверка 18+")
  })

  it("правка: исходник уходит в input_references как data-URI", async () => {
    const calls = mockFetch(() => ok({ data: [{ b64_json: PNG_B64 }] }))
    await openrouterProvider.edit!({
      model: "black-forest-labs/flux-3-image",
      prompt: "сделай акварелью",
      params: {},
      count: 1,
      apiKey: "k",
      image: Buffer.from("abc"),
      imageMimeType: "image/png",
    })
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/images")
    expect(calls[0].body.input_references).toEqual([
      { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from("abc").toString("base64")}` } },
    ])
  })

  it("старая модель по-прежнему идёт в chat/completions", async () => {
    const calls = mockFetch(() =>
      ok({ choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${PNG_B64}` } }] } }] }),
    )
    await openrouterProvider.generate({
      model: "google/gemini-3.1-flash-lite-image",
      prompt: "x",
      params: { aspect_ratio: "1:1", image_size: "1K" },
      count: 1,
      apiKey: "k",
    })
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions")
    expect(calls[0].body.modalities).toEqual(["image", "text"])
  })
})
