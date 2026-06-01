/**
 * Извлечение даты публикации из ссылки и текста, когда RSS-entry не отдал
 * её в `pubDate` / `published`. Перебираем по убыванию надёжности:
 *
 *   1. URL формата `…/2026/05/26/…` или `…/26-05-2026/…` — обычно
 *      это canonical-путь статьи (наиболее надёжный сигнал).
 *   2. GUID, если это URL — те же regex'ы.
 *   3. Заголовок и описание: явные даты вроде «26.05.2026», «26 мая 2026».
 *
 * Возвращаем `Date | undefined`. Если ничего не нашли, fallback на «дата
 * неизвестна» — пользователь увидит пост в выдаче, но без timestamp.
 */

const RU_MONTHS: Record<string, number> = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
}

/** YYYY/MM/DD или YYYY-MM-DD в URL-пути. Самый сильный сигнал. */
function fromYmdPath(text: string): Date | undefined {
  const m = text.match(/\/(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[\/\-_]|$)/)
  if (!m) return undefined
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  if (month < 0 || month > 11 || day < 1 || day > 31) return undefined
  const d = new Date(Date.UTC(year, month, day))
  return isNaN(d.getTime()) ? undefined : d
}

/** DD.MM.YYYY или DD-MM-YYYY — типично для русских новостей. */
function fromDmyText(text: string): Date | undefined {
  const m = text.match(/(?:^|[^\d])(\d{1,2})[.\-/](\d{1,2})[.\-/](20\d{2})(?:[^\d]|$)/)
  if (!m) return undefined
  const day = Number(m[1])
  const month = Number(m[2]) - 1
  const year = Number(m[3])
  if (month < 0 || month > 11 || day < 1 || day > 31) return undefined
  const d = new Date(Date.UTC(year, month, day))
  return isNaN(d.getTime()) ? undefined : d
}

/** «26 мая 2026», «1 января 2026 года». */
function fromRussianText(text: string): Date | undefined {
  const lower = text.toLowerCase()
  const m = lower.match(
    /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(20\d{2})/,
  )
  if (!m) return undefined
  const day = Number(m[1])
  const month = RU_MONTHS[m[2]]
  const year = Number(m[3])
  if (month === undefined || day < 1 || day > 31) return undefined
  const d = new Date(Date.UTC(year, month, day))
  return isNaN(d.getTime()) ? undefined : d
}

export interface InferDateInput {
  link?: string
  guid?: string
  title?: string
  description?: string
}

export function inferPublishedAt(input: InferDateInput): Date | undefined {
  if (input.link) {
    const d = fromYmdPath(input.link)
    if (d) return d
  }
  if (input.guid && input.guid !== input.link) {
    const d = fromYmdPath(input.guid)
    if (d) return d
  }
  const combined = `${input.title ?? ""} ${input.description ?? ""}`
  return fromDmyText(combined) ?? fromRussianText(combined)
}
