import { describe, it, expect, vi } from "vitest"
import {
  generateToken,
  hashToken,
  isValidTokenFormat,
  linkState,
  resolvePublicBaseUrl,
  buildPublicMediaUrl,
  TOKEN_BYTES,
  LINK_TTL_MS,
} from "@/lib/media-link/token"
import { serveMediaLink, type MediaLinkRecord, type ServeDeps } from "@/lib/media-link/serve"

describe("токены публичных ссылок", () => {
  it("токен — не меньше 128 бит и в формате base64url", () => {
    expect(TOKEN_BYTES * 8).toBeGreaterThanOrEqual(128)
    const t = generateToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(isValidTokenFormat(t)).toBe(true)
  })

  it("токены не повторяются", () => {
    const set = new Set(Array.from({ length: 500 }, () => generateToken()))
    expect(set.size).toBe(500)
  })

  it("хеш детерминирован, отличается от токена и не раскрывает его", () => {
    const t = generateToken()
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(t)).not.toContain(t)
    expect(hashToken(t)).not.toBe(hashToken(generateToken()))
  })

  it("отбраковывает токены неверного формата", () => {
    for (const bad of ["", "abc", "x".repeat(42), "x".repeat(44), "../etc/passwd", `${"a".repeat(42)}!`]) {
      expect(isValidTokenFormat(bad)).toBe(false)
    }
  })

  it("состояние ссылки: ok / expired / revoked", () => {
    const now = new Date("2026-10-07T12:00:00Z")
    const future = new Date(now.getTime() + 1000)
    const past = new Date(now.getTime() - 1000)
    expect(linkState({ expiresAt: future, revokedAt: null }, now)).toBe("ok")
    expect(linkState({ expiresAt: past, revokedAt: null }, now)).toBe("expired")
    expect(linkState({ expiresAt: now, revokedAt: null }, now)).toBe("expired")
    // отзыв приоритетнее срока
    expect(linkState({ expiresAt: future, revokedAt: past }, now)).toBe("revoked")
  })

  it("TTL ссылки — сутки", () => {
    expect(LINK_TTL_MS).toBe(24 * 60 * 60 * 1000)
  })
})

describe("публичный базовый адрес", () => {
  it("берёт BETTER_AUTH_URL в приоритете и режет хвостовой слэш", () => {
    expect(
      resolvePublicBaseUrl({
        BETTER_AUTH_URL: "https://mediagenerator.sanktum.net/",
        NEXT_PUBLIC_APP_URL: "https://other.example",
      }),
    ).toBe("https://mediagenerator.sanktum.net")
  })

  it("fallback на NEXT_PUBLIC_APP_URL", () => {
    expect(resolvePublicBaseUrl({ NEXT_PUBLIC_APP_URL: "https://mediagenerator.sanktum.net" })).toBe(
      "https://mediagenerator.sanktum.net",
    )
  })

  it("http и пустой адрес — ошибка (провайдеры принимают только HTTPS)", () => {
    expect(() => resolvePublicBaseUrl({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toThrow(/HTTPS/)
    expect(() => resolvePublicBaseUrl({})).toThrow(/Не задан/)
    expect(() => resolvePublicBaseUrl({ BETTER_AUTH_URL: "not a url" })).toThrow(/Некорректный/)
  })

  it("строит URL с токеном и безопасным именем файла", () => {
    const t = generateToken()
    expect(buildPublicMediaUrl("https://x.example/", t, "source.mp4")).toBe(
      `https://x.example/api/media-link/${t}/source.mp4`,
    )
    expect(buildPublicMediaUrl("https://x.example", t, "../a b?.mp4")).toBe(
      `https://x.example/api/media-link/${t}/.._a_b_.mp4`,
    )
  })
})

describe("отдача файла по токену (serveMediaLink)", () => {
  const token = generateToken()
  const now = new Date("2026-10-07T12:00:00Z")
  const okLink: MediaLinkRecord = {
    s3Key: "video-sources/abc/source.mp4",
    contentType: "video/mp4",
    sizeBytes: 1000,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
  }

  function makeDeps(link: MediaLinkRecord | null, over: Partial<ServeDeps> = {}) {
    const findByHash = vi.fn(async () => link)
    const stream = vi.fn(async (_key: string, range?: string) => ({
      body: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([1, 2, 3]))
          c.close()
        },
      }),
      contentType: "application/octet-stream",
      contentLength: range ? 500 : 1000,
      contentRange: range ? "bytes 0-499/1000" : undefined,
      statusCode: range ? 206 : 200,
    }))
    return { findByHash, stream, now: () => now, ...over } as ServeDeps & {
      findByHash: ReturnType<typeof vi.fn>
      stream: ReturnType<typeof vi.fn>
    }
  }

  it("валидный токен → 200 с Content-Type и Content-Length, без кэширования", async () => {
    const deps = makeDeps(okLink)
    const res = await serveMediaLink({ token }, deps)
    expect(res.status).toBe(200)
    expect(res.headers["Content-Type"]).toBe("video/mp4")
    expect(res.headers["Content-Length"]).toBe("1000")
    expect(res.headers["Accept-Ranges"]).toBe("bytes")
    expect(res.headers["Cache-Control"]).toContain("no-store")
    expect(res.body).not.toBeNull()
    // в БД ищем по ХЕШУ, а не по самому токену
    expect(deps.findByHash).toHaveBeenCalledWith(hashToken(token))
    expect(deps.stream).toHaveBeenCalledWith(okLink.s3Key, undefined)
  })

  it("неизвестный токен → 404 (S3 не трогаем)", async () => {
    const deps = makeDeps(null)
    const res = await serveMediaLink({ token }, deps)
    expect(res.status).toBe(404)
    expect(res.body).toBeNull()
    expect(deps.stream).not.toHaveBeenCalled()
  })

  it("токен неверного формата → 404 без обращения к БД", async () => {
    const deps = makeDeps(okLink)
    const res = await serveMediaLink({ token: "short" }, deps)
    expect(res.status).toBe(404)
    expect(deps.findByHash).not.toHaveBeenCalled()
  })

  it("просроченная ссылка → 404", async () => {
    const deps = makeDeps({ ...okLink, expiresAt: new Date(now.getTime() - 1) })
    expect((await serveMediaLink({ token }, deps)).status).toBe(404)
    expect(deps.stream).not.toHaveBeenCalled()
  })

  it("отозванная ссылка → 404", async () => {
    const deps = makeDeps({ ...okLink, revokedAt: new Date(now.getTime() - 10) })
    expect((await serveMediaLink({ token }, deps)).status).toBe(404)
    expect(deps.stream).not.toHaveBeenCalled()
  })

  it("Range → 206 с Content-Range", async () => {
    const deps = makeDeps(okLink)
    const res = await serveMediaLink({ token, range: "bytes=0-499" }, deps)
    expect(res.status).toBe(206)
    expect(res.headers["Content-Range"]).toBe("bytes 0-499/1000")
    expect(res.headers["Content-Length"]).toBe("500")
    expect(deps.stream).toHaveBeenCalledWith(okLink.s3Key, "bytes=0-499")
  })

  it("экзотический Range (мульти-диапазон) игнорируется — отдаём целиком", async () => {
    const deps = makeDeps(okLink)
    const res = await serveMediaLink({ token, range: "bytes=0-10,20-30" }, deps)
    expect(res.status).toBe(200)
    expect(deps.stream).toHaveBeenCalledWith(okLink.s3Key, undefined)
  })

  it("HEAD → заголовки без тела", async () => {
    const deps = makeDeps(okLink)
    const res = await serveMediaLink({ token, method: "HEAD" }, deps)
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
    expect(res.headers["Content-Length"]).toBe("1000")
  })

  it("ошибка S3 (нет объекта) → 404, а не 500", async () => {
    const deps = makeDeps(okLink, {
      stream: vi.fn(async () => {
        throw new Error("NoSuchKey")
      }),
    })
    expect((await serveMediaLink({ token }, deps)).status).toBe(404)
  })

  it("Content-Type берётся из записи ссылки, а не из S3", async () => {
    const deps = makeDeps({ ...okLink, contentType: "video/quicktime" })
    expect((await serveMediaLink({ token }, deps)).headers["Content-Type"]).toBe("video/quicktime")
  })
})
