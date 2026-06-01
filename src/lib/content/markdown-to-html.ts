/**
 * Минималистичная конверсия из нашего «Telegram-Markdown» в HTML, который
 * Telegram-десктоп/веб правильно подхватывает при вставке (Cmd+V).
 *
 * Поддерживаем только то, что Telegram действительно рендерит:
 *   **жирный**     → <b>
 *   __жирный__     → <b>
 *   _курсив_       → <i>
 *   ~~зачёркнут~~  → <s>
 *   `inline-код`   → <code>
 *   ```code```     → <pre>
 *   [text](url)    → <a href="url">
 *   > цитата       → <blockquote>
 *   - / * / •      → буллет в новой строке (Telegram сам сделает аккуратный список)
 *
 * Заголовки h1/h2/h3 Markdown'а трактуем как жирный одной строкой (Telegram
 * заголовков не знает).
 *
 * Эта функция работает с СОДЕРЖИМЫМ поста, который выдала writer-модель.
 * Markdown-разметку, не входящую в Telegram, оставляем как есть в plain-text.
 */
export function telegramMarkdownToHtml(input: string): string {
  if (!input) return ""
  const lines = input.split("\n")
  const html: string[] = []
  let i = 0

  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trimEnd()

    // Блок кода ```lang? ... ```
    if (/^```/.test(line)) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // пропускаем закрывающую тройку
      html.push(`<pre>${escapeHtml(buf.join("\n"))}</pre>`)
      continue
    }

    // Маркдаун-заголовок → <b>
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    if (heading) {
      html.push(`<p><b>${renderInline(heading[1])}</b></p>`)
      i++
      continue
    }

    // Blockquote: один или несколько подряд идущих «> ...»
    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""))
        i++
      }
      const inner = buf
        .map((l) => renderInline(l))
        .join("<br/>")
      html.push(`<blockquote>${inner}</blockquote>`)
      continue
    }

    // Маркированный список: подряд идущие строки «- », «* », «• »
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*[-*•]\s+/, "")
        items.push(`<li>${renderInline(item)}</li>`)
        i++
      }
      html.push(`<ul>${items.join("")}</ul>`)
      continue
    }

    // Нумерованный список
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*\d+[.)]\s+/, "")
        items.push(`<li>${renderInline(item)}</li>`)
        i++
      }
      html.push(`<ol>${items.join("")}</ol>`)
      continue
    }

    // Пустая строка — разрыв абзаца
    if (!line.trim()) {
      // схлопываем подряд идущие пустые строки в одну
      while (i < lines.length && !lines[i].trim()) i++
      html.push("")
      continue
    }

    // Обычный параграф — собираем подряд идущие непустые строки
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^```/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    html.push(`<p>${buf.map(renderInline).join("<br/>")}</p>`)
  }

  return html.filter(Boolean).join("\n")
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

/**
 * Inline-разметка: bold/italic/strike/code/links + экранирование HTML.
 * Порядок важен: сначала экранируем, потом подменяем токены на теги.
 */
function renderInline(input: string): string {
  let s = escapeHtml(input)

  // Inline code сначала — чтобы внутрь не лезли другие правила
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>")

  // Ссылки [text](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) => {
    return `<a href="${url}">${text}</a>`
  })

  // Жирный — сначала **…** и __…__
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
  s = s.replace(/__([^_]+)__/g, "<b>$1</b>")

  // Курсив — *…* и _…_ (после жирного, чтобы не съел вложенные звёздочки)
  s = s.replace(/(^|[\s,;:!?\(])\*([^*\s][^*]*[^*\s]|\S)\*(?=[\s,;:!?\)\.\-]|$)/g, "$1<i>$2</i>")
  s = s.replace(/(^|[\s,;:!?\(])_([^_\s][^_]*[^_\s]|\S)_(?=[\s,;:!?\)\.\-]|$)/g, "$1<i>$2</i>")

  // Зачёркнутый ~~text~~
  s = s.replace(/~~([^~]+)~~/g, "<s>$1</s>")

  return s
}
