/**
 * Парсер веб-сайтов. Стратегия:
 * 1. Найти RSS/Atom feed: автодетект через <link rel="alternate"> на главной,
 *    либо перебор стандартных путей (/feed, /rss, /rss.xml, ...).
 * 2. Распарсить RSS 2.0 / Atom без зависимостей (regex по простой структуре).
 * 3. Отфильтровать по дате публикации.
 *
 * RSS покрывает большинство новостных и блог-сайтов из ТЗ (consultant.ru,
 * rg.ru, garant.ru, glavkniga.ru и nalog-nalog.ru). Если у конкретного сайта
 * RSS нет — источник вернёт ошибку «feed не найден», и пользователь увидит
 * это в журнале запуска.
 */

import type { PostEngagement, RawPost } from "./types"
import { inferPublishedAt } from "./infer-date"

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

const FETCH_TIMEOUT_MS = 20_000

/**
 * Стандартные пути к feed'у. Идём после `<link rel="alternate">`-discovery.
 * Порядок — от самых популярных к редким. Российские СМИ часто хранят RSS
 * на нетипичных путях, поэтому список длиннее обычного.
 */
const FALLBACK_FEED_PATHS = [
  "/feed",
  "/feed/",
  "/rss",
  "/rss/",
  "/rss.xml",
  "/atom.xml",
  "/feed.xml",
  "/index.xml",
  "/xml/index.xml", // rg.ru
  "/rss/news/", // garant.ru
  "/news/rss/",
  "/news.rss",
  "/feeds/all.rss",
]

export interface WebsiteFetchInput {
  url: string
  since: Date
  until?: Date
  /**
   * Прямой URL feed'а. Если задан — пропускаем discoverFeedUrl(), берём сразу.
   */
  feedUrl?: string
}

export interface WebsiteFetchResult {
  posts: RawPost[]
  feedUrl: string
}

async function fetchText(url: string, accept = "text/html, application/xhtml+xml"): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Как fetchText, но честно читает кодировку из Content-Type (`charset=windows-1251`)
 * и из XML-пролога (`<?xml version="1.0" encoding="windows-1251"?>`). Нужен для RSS
 * российских сайтов вроде garant.ru, которые до сих пор отдают cp1251.
 */
async function fetchTextWithEncoding(url: string, accept: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    // 1) Content-Type → charset=
    const ct = response.headers.get("content-type") ?? ""
    const ctMatch = ct.match(/charset=([^\s;]+)/i)
    let encoding = ctMatch?.[1]?.toLowerCase()
    // 2) XML-пролог — он надёжнее CT, если они расходятся
    if (!encoding) {
      const head = buffer.subarray(0, 200).toString("ascii")
      const xmlMatch = head.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i)
      if (xmlMatch) encoding = xmlMatch[1].toLowerCase()
    }
    if (encoding && encoding !== "utf-8" && encoding !== "utf8") {
      try {
        return new TextDecoder(encoding).decode(buffer)
      } catch {
        // Неизвестная кодировка — fallback на utf-8
      }
    }
    return buffer.toString("utf-8")
  } finally {
    clearTimeout(timer)
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
}

/** Снимает HTML-теги из текста, оставляя plain. Используется для description. */
function stripHtml(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Достаёт значение из CDATA или обычного содержимого тега. */
function extractTagContent(input: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i")
  const match = input.match(regex)
  if (!match) return undefined
  let value = match[1].trim()
  // CDATA
  const cdataMatch = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/)
  if (cdataMatch) value = cdataMatch[1].trim()
  return value
}

/** Возвращает href атрибута <link href="..."/> — для Atom. */
function extractAtomLink(input: string): string | undefined {
  // Atom: <link rel="alternate" href="..."/> или просто <link href="..."/>
  const linkAlt = input.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i)
  if (linkAlt) return linkAlt[1]
  const link = input.match(/<link[^>]*href="([^"]+)"/i)
  if (link) return link[1]
  return undefined
}

/**
 * Ищет ссылку на feed на главной странице через <link rel="alternate">.
 * Возвращает абсолютный URL или null.
 */
export function discoverFeedUrlInHtml(html: string, baseUrl: string): string | null {
  const linkTagRegex = /<link\b[^>]*rel="alternate"[^>]*>/gi
  const tags = html.match(linkTagRegex) ?? []
  for (const tag of tags) {
    const typeMatch = tag.match(/type="([^"]+)"/i)
    if (!typeMatch) continue
    const t = typeMatch[1].toLowerCase()
    if (!t.includes("rss") && !t.includes("atom") && !t.includes("xml")) continue
    const hrefMatch = tag.match(/href="([^"]+)"/i)
    if (!hrefMatch) continue
    return new URL(hrefMatch[1], baseUrl).toString()
  }
  return null
}

/**
 * Пробует найти feed для URL: сначала <link rel="alternate">, потом
 * стандартные пути. Возвращает URL feed'а или бросает ошибку.
 */
export async function discoverFeedUrl(url: string): Promise<string> {
  const target = new URL(url)
  // Если ссылка явно ведёт на feed — возвращаем как есть
  if (/\.(rss|xml|atom)(\?|$)/i.test(target.pathname) || /\/feed\/?$/i.test(target.pathname)) {
    return target.toString()
  }

  // 1. <link rel="alternate"> на главной
  try {
    const html = await fetchText(target.toString())
    const discovered = discoverFeedUrlInHtml(html, target.toString())
    if (discovered) return discovered
  } catch {
    // игнорируем, пойдём по стандартным путям
  }

  // 2. Стандартные пути от корня домена
  const origin = `${target.protocol}//${target.host}`
  for (const path of FALLBACK_FEED_PATHS) {
    try {
      const candidate = `${origin}${path}`
      const text = await fetchText(candidate, "application/rss+xml, application/atom+xml, application/xml")
      // Минимальная проверка — это похоже на feed?
      if (/<(rss|feed)\b/i.test(text)) {
        return candidate
      }
    } catch {
      // продолжаем
    }
  }

  throw new Error(`Не найден RSS/Atom feed для ${url}. Проверьте, что у сайта есть лента.`)
}

interface ParsedFeedEntry {
  guid?: string
  link?: string
  title?: string
  publishedAt?: Date
  description?: string
  content?: string
  imageUrl?: string
  engagement?: PostEngagement
}

/**
 * Достаёт engagement из RSS-блока. Реально полезные поля в RSS — это `slash:comments`
 * (число комментариев на странице — расширение Slashdot). Остальные стандарты не
 * предоставляют views/reactions.
 *
 * Некоторые сайты также отдают кастомные пространства имён, но это редкость и
 * каждое — отдельная история. Ограничиваемся самым стабильным.
 */
function extractRssEngagement(block: string): PostEngagement | undefined {
  const result: PostEngagement = {}
  const commentsRaw = extractTagContent(block, "slash:comments")
  if (commentsRaw) {
    const n = parseInt(commentsRaw.replace(/\D+/g, ""), 10)
    if (Number.isFinite(n) && n >= 0) result.comments = n
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function parseDateSafe(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const d = new Date(trimmed)
  if (!isNaN(d.getTime())) return d
  return undefined
}

/** Парсит RSS 2.0 feed. <item>...</item> внутри <channel>. */
function parseRss(xml: string): ParsedFeedEntry[] {
  const items: ParsedFeedEntry[] = []
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = itemRegex.exec(xml))) {
    const block = m[1]
    const entry: ParsedFeedEntry = {
      guid: extractTagContent(block, "guid"),
      link: extractTagContent(block, "link"),
      title: extractTagContent(block, "title"),
      description: extractTagContent(block, "description"),
      content: extractTagContent(block, "content:encoded"),
      publishedAt: parseDateSafe(
        extractTagContent(block, "pubDate") ?? extractTagContent(block, "dc:date"),
      ),
    }
    // Картинка из <enclosure> или <media:content>
    const enclosure = block.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image\/[^"]+"/i)
    if (enclosure) entry.imageUrl = enclosure[1]
    if (!entry.imageUrl) {
      const media = block.match(/<media:content[^>]*url="([^"]+)"[^>]*medium="image"/i)
      if (media) entry.imageUrl = media[1]
    }
    if (!entry.imageUrl && entry.description) {
      // <img src="..."> в description
      const imgMatch = entry.description.match(/<img[^>]+src="([^"]+)"/i)
      if (imgMatch) entry.imageUrl = imgMatch[1]
    }
    entry.engagement = extractRssEngagement(block)
    items.push(entry)
  }
  return items
}

/** Парсит Atom feed. <entry>...</entry> верхнего уровня. */
function parseAtom(xml: string): ParsedFeedEntry[] {
  const items: ParsedFeedEntry[] = []
  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi
  let m: RegExpExecArray | null
  while ((m = entryRegex.exec(xml))) {
    const block = m[1]
    // Atom: <link href="..."/> — может быть несколько
    const linkBlock = block.match(/<link\b[\s\S]*?\/>/g)?.join("\n") ?? ""
    const link = extractAtomLink(linkBlock)
    const entry: ParsedFeedEntry = {
      guid: extractTagContent(block, "id"),
      link,
      title: extractTagContent(block, "title"),
      description: extractTagContent(block, "summary"),
      content: extractTagContent(block, "content"),
      publishedAt: parseDateSafe(
        extractTagContent(block, "published") ?? extractTagContent(block, "updated"),
      ),
    }
    if (entry.description) {
      const imgMatch = entry.description.match(/<img[^>]+src="([^"]+)"/i)
      if (imgMatch) entry.imageUrl = imgMatch[1]
    }
    items.push(entry)
  }
  return items
}

/** Определяет, RSS это или Atom, и парсит соответствующим методом. */
function parseFeed(xml: string): ParsedFeedEntry[] {
  if (/<rss\b/i.test(xml)) return parseRss(xml)
  if (/<feed\b[^>]*xmlns/i.test(xml)) return parseAtom(xml)
  // Fallback: пробуем оба
  const rss = parseRss(xml)
  if (rss.length > 0) return rss
  return parseAtom(xml)
}

/**
 * Максимум entries без даты, которые берём как «недавние» когда ни одной
 * даты нигде нет (ни в RSS, ни в URL, ни в тексте). RSS обычно возвращает
 * entries по убыванию свежести — этот лимит мешает старым новостям
 * захламлять выдачу при коротких интервалах.
 */
const MAX_DATELESS_ENTRIES = 20

export async function fetchWebsiteFeed(input: WebsiteFetchInput): Promise<WebsiteFetchResult> {
  const feedUrl = input.feedUrl ?? (await discoverFeedUrl(input.url))
  const xml = await fetchTextWithEncoding(
    feedUrl,
    "application/rss+xml, application/atom+xml, application/xml, text/xml",
  )
  const entries = parseFeed(xml)
  const until = input.until ?? new Date()

  // Стратегия дат:
  //  1. Если у entry есть publishedAt из RSS — используем как есть.
  //  2. Иначе пробуем inferPublishedAt: URL формата /YYYY/MM/DD/, «26.05.2026»,
  //     «26 мая 2026» в title/description, и т.п.
  //  3. Если так и не нашли — берём не более MAX_DATELESS_ENTRIES «недавних»
  //     (RSS отдаёт в порядке убывания), показываем в UI как «дата неизвестна».
  const posts: RawPost[] = []
  let datelessKept = 0
  for (const e of entries) {
    if (!e.link) continue
    let ts = e.publishedAt
    if (!ts) {
      ts = inferPublishedAt({
        link: e.link,
        guid: e.guid,
        title: e.title,
        description: e.description,
      })
    }
    if (ts) {
      if (ts < input.since) continue
      if (ts > until) continue
    } else {
      if (datelessKept >= MAX_DATELESS_ENTRIES) break
      datelessKept++
    }
    const titleClean = e.title ? stripHtml(e.title) : undefined
    const bodyHtml = e.content ?? e.description ?? ""
    const bodyPlain = stripHtml(bodyHtml)
    posts.push({
      sourcePostId: e.guid ?? e.link,
      postUrl: e.link.trim(),
      publishedAt: ts,
      title: titleClean,
      content: bodyPlain,
      images: e.imageUrl ? [{ url: e.imageUrl }] : [],
      engagement: e.engagement,
    })
  }

  posts.sort((a, b) => {
    const da = a.publishedAt?.getTime() ?? 0
    const db = b.publishedAt?.getTime() ?? 0
    return db - da
  })

  return { posts, feedUrl }
}
