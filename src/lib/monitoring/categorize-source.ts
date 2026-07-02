/**
 * Категоризация источника для UI: иконка, цвет, читаемое имя.
 *
 * У нас всего два технических типа в БД (`telegram` / `website`), но визуально
 * имеет смысл различать ещё и соцсети (ВКонтакте, Twitter/X, …), даже если
 * технически они парсятся как website.
 */

import type { MonitoringSource } from "@/lib/db/schema/monitoring"

export type SourceCategory = "messenger" | "social" | "site"

export interface SourceCategoryInfo {
  category: SourceCategory
  /** Короткое русское имя — «Telegram», «ВКонтакте», «Сайт». */
  label: string
  /** Цвет для бейджа (Tailwind border/text-utility). */
  badgeClass: string
  /** Имя иконки из lucide-react для отображения. */
  iconName: "MessageCircle" | "Users" | "Globe"
}

/** Определяет категорию источника по type и url. */
export function categorizeSource(source: Pick<MonitoringSource, "type" | "url">): SourceCategoryInfo {
  if (source.type === "telegram") {
    return {
      category: "messenger",
      label: "Telegram",
      badgeClass: "border-sky-700/40 text-sky-300 bg-sky-900/15",
      iconName: "MessageCircle",
    }
  }
  // website — проверяем по домену, является ли это соцсетью
  const url = source.url.toLowerCase()
  if (
    url.includes("vk.com") ||
    url.includes("vkontakte") ||
    url.includes("twitter.com") ||
    url.includes("x.com/") ||
    url.includes("facebook.com") ||
    url.includes("instagram.com") ||
    url.includes("ok.ru") ||
    url.includes("dzen.ru")
  ) {
    let label = "Соцсеть"
    if (url.includes("vk.com") || url.includes("vkontakte")) label = "ВКонтакте"
    else if (url.includes("twitter.com") || url.includes("x.com/")) label = "X (Twitter)"
    else if (url.includes("facebook.com")) label = "Facebook"
    else if (url.includes("instagram.com")) label = "Instagram"
    else if (url.includes("ok.ru")) label = "Одноклассники"
    else if (url.includes("dzen.ru")) label = "Дзен"
    return {
      category: "social",
      label,
      badgeClass: "border-violet-700/40 text-violet-300 bg-violet-900/15",
      iconName: "Users",
    }
  }
  return {
    category: "site",
    label: "Сайт",
    badgeClass: "border-emerald-700/40 text-emerald-300 bg-emerald-900/15",
    iconName: "Globe",
  }
}
