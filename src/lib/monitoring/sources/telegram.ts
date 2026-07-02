/**
 * Парсер публичной превью-страницы Telegram-канала: `https://t.me/s/{handle}`.
 * Не требует авторизации, работает для всех публичных каналов.
 *
 * Telegram отдаёт обычный HTML с разметкой постов, фотографий и времени.
 * Парсим регекспами без зависимостей.
 */

import type { PostEngagement, RawPost } from "./types"

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

const FETCH_TIMEOUT_MS = 20_000
/** Сколько страниц выдачи прокручиваем по умолчанию (страница ≈ 20 постов). */
const DEFAULT_MAX_PAGES = 5
/** Максимум, до которого можно поднять `maxPages`. Выше — слишком долго и провоцирует баны. */
const MAX_PAGES_LIMIT = 15
/** Сколько раз ретраим один запрос при `fetch failed` (Telegram временами рвёт TLS). */
const FETCH_RETRIES = 3
/** Базовая задержка между ретраями (мс). Реальная = base * 2^attempt + jitter. */
const RETRY_BASE_DELAY_MS = 600

export interface TelegramFetchInput {
  /** "uprav_nalog", "@uprav_nalog", "https://t.me/uprav_nalog" — всё нормализуется. */
  handle: string
  /** Граница интервала — посты раньше этой даты не возвращаем. */
  since: Date
  /** Опциональная граница сверху (по умолчанию — сейчас). */
  until?: Date
  /** Сколько страниц пагинации прокручиваем (1..15). Default 5. */
  maxPages?: number
}

export interface TelegramFetchResult {
  posts: RawPost[]
  /** URL последней успешно прочитанной страницы (для отладки). */
  pagedUrls: string[]
  /** Название канала из заголовка страницы (если удалось вытащить). */
  channelTitle?: string
}

/**
 * Извлекает официальное название канала из HTML страницы t.me/s/{handle}.
 * Перебираем 3 источника по убыванию надёжности — у разных каналов разная разметка:
 *  - публичные публикуют `<div class="tgme_channel_info_header_title">…</div>`
 *  - приватные / новые иногда показывают только `<meta property="og:title">`
 *  - fallback: `<title>Channel Name – Telegram</title>`
 */
function extractChannelTitle(html: string): string | undefined {
  // 1. tgme_channel_info_header_title — берём весь блок и снимаем теги
  const headerBlock = html.match(
    /<div class="tgme_channel_info_header_title[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  )
  if (headerBlock?.[1]) {
    const text = decodeHtmlEntities(headerBlock[1].replace(/<[^>]+>/g, "")).trim()
    if (text) return text
  }
  // 2. <meta property="og:title" content="…">
  const ogMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
  if (ogMatch?.[1]) {
    return decodeHtmlEntities(ogMatch[1]).trim()
  }
  // 3. <title>… – Telegram</title> (en-dash / hyphen / em-dash)
  const titleMatch = html.match(/<title>([^<]+?)\s*[–\-—]\s*Telegram<\/title>/i)
  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1]).trim()
  }
  return undefined
}

/** Нормализуем разные формы записи в чистый handle без префиксов. */
export function normalizeTelegramHandle(raw: string): string {
  let handle = raw.trim()
  // URL вида https://t.me/handle или t.me/handle
  const urlMatch = handle.match(/(?:t\.me\/(?:s\/)?)([A-Za-z0-9_]+)/i)
  if (urlMatch) handle = urlMatch[1]
  // Префиксы @
  if (handle.startsWith("@")) handle = handle.slice(1)
  // На случай мусора в конце
  handle = handle.replace(/[^A-Za-z0-9_].*$/, "")
  return handle
}

/**
 * Декодирует HTML-сущности из атрибутов/текста Telegram-разметки.
 * Покрывает базовые (&amp; &lt; &gt; &quot; &#39; &nbsp;) — этого хватает
 * для текста публичных постов.
 */
function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
}

/**
 * Чистит URL для отображения в plain-тексте поста:
 *  - вырезает scroll-to-text fragment (`#:~:text=...`) — это сервисный
 *    указатель браузера на конкретное место в документе, не часть адреса,
 *    и именно он часто содержит длинную процент-кодировку русского текста;
 *  - декодирует процент-кодировку (`%D0%A2` → «Т»), чтобы кириллические URL
 *    выглядели по-русски, а не как мусор;
 *  - обрезает слишком длинный путь до домена + начала пути с «…», но только
 *    если адрес остался читаемо-длинным.
 *
 * При любой ошибке декодирования возвращаем исходный URL — лучше как есть,
 * чем потерять ссылку совсем.
 */
function cleanUrlForDisplay(rawHref: string): string {
  try {
    // 1) Срезаем scroll-to-text fragment. Он начинается с `#:~:text=` или `&:~:text=`.
    let href = rawHref.replace(/[#&]:~:text=[^#&]*/i, "")
    // 2) Декодируем процент-кодировку. decodeURI безопаснее decodeURIComponent
    //    (не трогает структурные `?`, `&`, `/`), но всё равно может бросить
    //    при сломанной последовательности — поэтому try/catch на функции.
    try {
      href = decodeURI(href)
    } catch {
      // Сломанная последовательность — оставляем как есть после трима fragment.
    }
    // 3) Если URL всё ещё длиннее 100 символов, обрезаем середину пути.
    if (href.length > 100) {
      const m = href.match(/^(https?:\/\/[^/]+)(\/.*)?$/i)
      if (m) {
        const domain = m[1]
        const path = m[2] ?? ""
        if (path.length > 60) {
          href = `${domain}${path.slice(0, 50)}…`
        }
      }
    }
    return href
  } catch {
    return rawHref
  }
}

/**
 * Telegram-разметка содержит `<br>` для переносов строк и теги форматирования.
 * Превращаем `<br>` в `\n`, удаляем остальные теги (теряя жирность/курсив —
 * для мониторинга это OK), декодируем сущности.
 *
 * Ссылки: если текст совпадает с href — оставляем только URL (чистый); иначе
 * показываем «текст (URL)». URL всегда прогоняется через cleanUrlForDisplay,
 * чтобы убрать `#:~:text=...` фрагмент и сделать процент-кодировку читаемой.
 */
function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(?:strong|b|em|i|u|s|del|code|pre|span|tg-spoiler)[^>]*>/gi, "")
      .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, (_, href, text) => {
        const cleanHref = cleanUrlForDisplay(href)
        // text может быть пустым, равняться сырому href или совпадать с очищенным.
        if (!text || text === href || text === cleanHref) return cleanHref
        return `${text} (${cleanHref})`
      })
      // Удаляем все оставшиеся теги
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((line) => line.trim())
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
    .join("\n")
    .trim()
}

interface ParsedBlock {
  postId: string
  postUrl: string
  publishedAt?: Date
  text: string
  images: string[]
  engagement?: PostEngagement
}

/**
 * Парсит «1.33K», «2.5M», «830» в число. Telegram сокращает значения от
 * тысячи и выше через K/M/B (международные). На странице t.me/s/ всегда
 * латинские буквы, нижний регистр не встречал, но обрабатываем оба.
 */
function parseCompactNumber(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const m = trimmed.match(/^([\d.,]+)\s*([KMBkmb])?/)
  if (!m) return undefined
  const num = parseFloat(m[1].replace(",", "."))
  if (!Number.isFinite(num)) return undefined
  const suffix = m[2]?.toUpperCase()
  switch (suffix) {
    case "K":
      return Math.round(num * 1_000)
    case "M":
      return Math.round(num * 1_000_000)
    case "B":
      return Math.round(num * 1_000_000_000)
    default:
      return Math.round(num)
  }
}

/**
 * Достаёт метрики из чанка одного поста: просмотры, реакции, репосты,
 * комментарии. Поля, которых на странице нет (например, у анонимных каналов
 * скрыты реакции), просто не попадают в результат.
 *
 * Реакции в HTML выглядят так:
 *   <div class="tgme_widget_message_reactions js-message_reactions">
 *     <span class="tgme_reaction">
 *       <i class="emoji" style="background-image:url('//.../E29DA4.png')"><b>❤</b></i>
 *       1
 *     </span>
 *     ... ещё span'ы ...
 *   </div>
 */
function extractEngagement(chunk: string): PostEngagement | undefined {
  const result: PostEngagement = {}

  // Views — <span class="tgme_widget_message_views">1.33K</span>
  const viewsMatch = chunk.match(
    /<span class="tgme_widget_message_views">([^<]+)<\/span>/,
  )
  if (viewsMatch) {
    const v = parseCompactNumber(viewsMatch[1])
    if (v !== undefined) result.views = v
  }

  // Reactions — берём весь блок и из него вытаскиваем все <span class="tgme_reaction">
  const reactionsBlock = chunk.match(
    /<div class="tgme_widget_message_reactions[^"]*">([\s\S]*?)<\/div>(?=\s*<div class="tgme_widget_message_footer|\s*<\/div>)/,
  )
  if (reactionsBlock) {
    const reactionEntries: Array<{ emoji: string; count: number }> = []
    // Каждая реакция: <span class="tgme_reaction[ ...]"> [emoji-block] CountText</span>
    const reactionRegex = /<span class="tgme_reaction[^"]*">([\s\S]*?)<\/span>/g
    let m: RegExpExecArray | null
    while ((m = reactionRegex.exec(reactionsBlock[1]))) {
      const inner = m[1]
      // Эмодзи — из <b>...</b>; некоторые кастомные эмодзи могут не иметь <b>.
      let emoji = "•"
      const bMatch = inner.match(/<b[^>]*>([\s\S]*?)<\/b>/)
      if (bMatch) emoji = decodeHtmlEntities(bMatch[1].replace(/<[^>]+>/g, "")).trim() || "•"
      // Count — число в хвосте строки после удаления всех тегов. Эмодзи
      // занимают начало строки (без тегов: «❤1»), поэтому ищем именно
      // финальную числовую группу, опционально с K/M/B-суффиксом.
      const plain = inner.replace(/<[^>]+>/g, "").trim()
      const tailMatch = plain.match(/([\d.,]+\s*[KMBkmb]?)\s*$/)
      const count = tailMatch ? parseCompactNumber(tailMatch[1]) : undefined
      if (count !== undefined && count > 0) {
        reactionEntries.push({ emoji, count })
      }
    }
    if (reactionEntries.length > 0) {
      result.reactions = reactionEntries
      result.reactionsTotal = reactionEntries.reduce((s, r) => s + r.count, 0)
    }
  }

  // Forwards — <a class="tgme_widget_message_forwards">123</a> (опционально)
  const forwardsMatch = chunk.match(
    /<[^>]*class="tgme_widget_message_forwards[^"]*"[^>]*>([^<]+)</,
  )
  if (forwardsMatch) {
    const f = parseCompactNumber(forwardsMatch[1])
    if (f !== undefined) result.forwards = f
  }

  // Comments — <a class="...tgme_widget_message_comments_..."><span class="...">12</span>...
  // Структура у TG разнится; берём первый span с числом внутри блока комментов.
  const commentsBlock = chunk.match(
    /class="[^"]*tgme_widget_message_link_preview_comments[^"]*"[\s\S]{0,200}?<span[^>]*>([^<]+)</,
  )
  if (commentsBlock) {
    const c = parseCompactNumber(commentsBlock[1])
    if (c !== undefined) result.comments = c
  }

  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Извлекает все блоки сообщений из HTML страницы t.me/s/{handle}.
 * Один блок = одно сообщение. Альбомы (несколько фото) Telegram разбивает
 * на несколько блоков с одним data-post — мы потом группируем.
 */
function parseMessageBlocks(html: string, handle: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = []

  // Каждый пост — div с классом tgme_widget_message и data-post атрибутом.
  // Скобки в lookahead — для конечных границ. Используем простой forward-сканер,
  // чтобы избежать catastrophic backtracking на длинном HTML.
  const startMarker = /<div class="tgme_widget_message[^"]*"[^>]*data-post="([^"]+)"/g
  const matches: Array<{ index: number; postId: string }> = []
  let m: RegExpExecArray | null
  while ((m = startMarker.exec(html))) {
    matches.push({ index: m.index, postId: m[1] })
  }

  for (let i = 0; i < matches.length; i++) {
    const { index, postId } = matches[i]
    const next = matches[i + 1]
    const chunk = html.slice(index, next ? next.index : html.length)

    // Дата публикации — <time datetime="...">
    let publishedAt: Date | undefined
    const timeMatch = chunk.match(/<time[^>]*datetime="([^"]+)"/)
    if (timeMatch) {
      const d = new Date(timeMatch[1])
      if (!isNaN(d.getTime())) publishedAt = d
    }

    // Текст — div.tgme_widget_message_text. Может быть несколько (text+description).
    // Берём только первый — основной текст.
    let text = ""
    const textMatch = chunk.match(
      /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="tgme_widget_message_reply|<div class="tgme_widget_message_footer|<div class="tgme_widget_message_inline_keyboard|<div class="link_preview)/,
    )
    if (textMatch) {
      text = htmlToPlainText(textMatch[1])
    } else {
      // Fallback: ищем без жёсткого окончания
      const looseMatch = chunk.match(
        /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/,
      )
      if (looseMatch) text = htmlToPlainText(looseMatch[1])
    }

    // Картинки — background-image:url('...') в .tgme_widget_message_photo_wrap
    const images: string[] = []
    const photoRegex = /tgme_widget_message_photo_wrap[^"]*"[^>]*style="[^"]*background-image:url\('([^']+)'\)/g
    let p: RegExpExecArray | null
    while ((p = photoRegex.exec(chunk))) {
      images.push(p[1])
    }
    // Видео-превью тоже хранится как картинка
    const videoThumbRegex = /tgme_widget_message_video_thumb[^"]*"[^>]*style="[^"]*background-image:url\('([^']+)'\)/g
    while ((p = videoThumbRegex.exec(chunk))) {
      images.push(p[1])
    }

    blocks.push({
      postId,
      postUrl: `https://t.me/${postId}`,
      publishedAt,
      text,
      images,
      engagement: extractEngagement(chunk),
    })

    // Sanity-check: postId должен начинаться с handle (на случай странного HTML)
    if (!postId.startsWith(`${handle}/`)) {
      // Telegram иногда добавляет блоки с другими каналами (рекламные).
      // Они нам не нужны.
      blocks.pop()
    }
  }

  return blocks
}

/**
 * Группирует блоки одного альбома (несколько фото с одним data-post).
 * Telegram даёт каждому фото отдельный блок, но data-post одинаковый.
 * Берём первый блок с текстом, а картинки объединяем.
 */
function mergeAlbumBlocks(blocks: ParsedBlock[]): ParsedBlock[] {
  const map = new Map<string, ParsedBlock>()
  for (const b of blocks) {
    const existing = map.get(b.postId)
    if (!existing) {
      map.set(b.postId, { ...b })
      continue
    }
    if (!existing.text && b.text) existing.text = b.text
    if (!existing.publishedAt && b.publishedAt) existing.publishedAt = b.publishedAt
    for (const img of b.images) {
      if (!existing.images.includes(img)) existing.images.push(img)
    }
    // Engagement — берём первый ненулевой (метрики у блоков альбома обычно
    // в последнем сообщении группы, но иногда и в первом — кто пришёл, того и используем).
    if (!existing.engagement && b.engagement) existing.engagement = b.engagement
  }
  return Array.from(map.values())
}

async function fetchHtmlOnce(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
      },
      signal: controller.signal,
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(`Telegram вернул ${response.status} ${response.statusText}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Telegram временами рвёт TLS при серии запросов с одного IP («fetch failed»
 * за ~280мс). Ретраим с экспоненциальной задержкой и jitter — обычно второй
 * или третий запрос проходит.
 */
async function fetchHtml(url: string): Promise<string> {
  let lastErr: unknown
  for (let attempt = 0; attempt < FETCH_RETRIES; attempt++) {
    try {
      return await fetchHtmlOnce(url)
    } catch (err) {
      lastErr = err
      const message = err instanceof Error ? err.message : String(err)
      // HTTP-ошибки кроме 5xx и не-сетевые сбои — не ретраим
      if (/Telegram вернул (4\d\d|3\d\d)/.test(message)) break
      if (attempt < FETCH_RETRIES - 1) {
        const jitter = Math.floor(Math.random() * 400)
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + jitter
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * Главная точка: тянем посты канала за период.
 * Если последняя страница ещё содержит посты в окне — паджинируем дальше
 * через `?before={lastPostId}`. Останавливаемся либо когда ушли за `since`,
 * либо когда достигли MAX_PAGES.
 */
export async function fetchTelegramChannel(
  input: TelegramFetchInput,
): Promise<TelegramFetchResult> {
  const handle = normalizeTelegramHandle(input.handle)
  if (!handle) {
    throw new Error(`Не удалось определить handle канала из "${input.handle}"`)
  }
  const until = input.until ?? new Date()
  const maxPages = Math.min(
    MAX_PAGES_LIMIT,
    Math.max(1, Math.floor(input.maxPages ?? DEFAULT_MAX_PAGES)),
  )
  const result: TelegramFetchResult = { posts: [], pagedUrls: [] }
  const seenIds = new Set<string>()

  let cursorUrl = `https://t.me/s/${handle}`
  for (let page = 0; page < maxPages; page++) {
    result.pagedUrls.push(cursorUrl)
    const html = await fetchHtml(cursorUrl)
    // Имя канала вытаскиваем только с первой страницы (одинаковое везде).
    if (page === 0 && !result.channelTitle) {
      result.channelTitle = extractChannelTitle(html)
    }
    const blocks = mergeAlbumBlocks(parseMessageBlocks(html, handle))
    if (blocks.length === 0) break

    // Сортируем по дате (на странице порядок — старые первыми, но на всякий случай)
    blocks.sort((a, b) => {
      const da = a.publishedAt?.getTime() ?? 0
      const db = b.publishedAt?.getTime() ?? 0
      return da - db
    })

    let oldestOnPage: ParsedBlock | undefined
    let foundOutsideWindow = false
    for (const b of blocks) {
      if (seenIds.has(b.postId)) continue
      seenIds.add(b.postId)
      if (!oldestOnPage || (b.publishedAt && oldestOnPage.publishedAt && b.publishedAt < oldestOnPage.publishedAt)) {
        oldestOnPage = b
      }

      const ts = b.publishedAt
      if (!ts) continue
      if (ts < input.since) {
        foundOutsideWindow = true
        continue
      }
      if (ts > until) continue
      // Достаточно содержимого: хотя бы текст или картинка
      if (!b.text && b.images.length === 0) continue

      result.posts.push({
        sourcePostId: b.postId,
        // У TG-постов нет отдельного заголовка — первая строка `content`
        // и так выводится сверху карточки. Если ставить title = первая строка,
        // получаем визуальный дубль в UI. Поэтому title не заполняем.
        postUrl: b.postUrl,
        publishedAt: ts,
        content: b.text,
        images: b.images.map((url) => ({ url })),
        engagement: b.engagement,
      })
    }

    if (foundOutsideWindow || !oldestOnPage) {
      break
    }
    // Если самый старый пост на странице всё ещё в окне — берём ещё страницу
    if (oldestOnPage.publishedAt && oldestOnPage.publishedAt > input.since) {
      cursorUrl = `https://t.me/s/${handle}?before=${oldestOnPage.postId.split("/")[1]}`
      continue
    }
    break
  }

  // Финальная сортировка по убыванию даты
  result.posts.sort((a, b) => {
    const da = a.publishedAt?.getTime() ?? 0
    const db = b.publishedAt?.getTime() ?? 0
    return db - da
  })
  return result
}
