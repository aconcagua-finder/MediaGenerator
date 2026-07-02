/**
 * Встроенный шаблон «Ольга» — изначальный набор источников из ТЗ.
 * Сеется в БД при первом обращении к API monitoring, владельцем
 * становится первый найденный админ.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema/auth"
import {
  monitoringTemplates,
  type MonitoringSource,
} from "@/lib/db/schema/monitoring"
import { DEFAULT_CLASSIFIER } from "./classifier"

export const OLGA_SLUG = "olga"

/** Все источники из ТЗ. Стабильные id — чтобы при пересеве не плодились дубли. */
const OLGA_TG_CHANNELS: Array<{ id: string; handle: string; label: string }> = [
  { id: "tg-uprav-nalog", handle: "uprav_nalog", label: "Управляй налогами" },
  { id: "tg-pegov-i", handle: "Pegov_I", label: "Пегов И." },
  { id: "tg-turov-and-part", handle: "turov_and_part", label: "Туров и партнёры" },
  { id: "tg-netipichniy-buh", handle: "netipichniy_buh", label: "Нетипичный бухгалтер" },
  { id: "tg-podslushano-buh", handle: "podslushano_buh", label: "Подслушано у бухгалтера" },
  { id: "tg-bs-accounting", handle: "bs_accounting", label: "BS Accounting" },
  { id: "tg-businessololo", handle: "businessololo", label: "Businessололо" },
  { id: "tg-eglavbukru", handle: "eglavbukru", label: "Главбух" },
  { id: "tg-tax-pi-ru", handle: "tax_pi_RU", label: "Tax PI RU" },
  { id: "tg-kubklerk", handle: "kubklerk", label: "Куб Клерк" },
  { id: "tg-klerkonline", handle: "klerkonline", label: "Клерк онлайн" },
  { id: "tg-tin-ag", handle: "TIN_AG", label: "TIN AG" },
  {
    id: "tg-doingbusinesstogether",
    handle: "doingbusinesstogether",
    label: "Doing business together",
  },
  { id: "tg-pravo-potreb", handle: "pravo_potreb", label: "Право потребителя" },
  { id: "tg-biznesinalogi", handle: "biznesinalogi_tlg", label: "Бизнес и налоги" },
  { id: "tg-tot115fz", handle: "tot115fz", label: "115-ФЗ" },
  { id: "tg-nalog-gov-ru", handle: "nalog_gov_ru", label: "ФНС России" },
  { id: "tg-anna-kvorss", handle: "anna_kvorss", label: "Анна Кворсс" },
  { id: "tg-wlhb7cbqu", handle: "WLHb7CbQu_8EZmyJ", label: "WLHb7CbQu_8EZmyJ" },
  { id: "tg-nalogi-sud", handle: "nalogi_sud", label: "Налоги и суд" },
  { id: "tg-polina-buh", handle: "PolinaBuh", label: "Полина Бухгалтер" },
]

/**
 * Сайты из ТЗ. У большинства RSS лежит на нестандартном пути и не объявлен
 * через `<link rel="alternate">`, поэтому даём прямой `feedUrl`.
 *
 * VK и БухОнлайн не имеют RSS (VK — закрытое API, форум — нет ленты);
 * оставляем их с disabled=true, чтобы пользователь видел, какие источники
 * пока не работают, и мог либо удалить, либо настроить вручную.
 */
const OLGA_WEBSITES: Array<{
  id: string
  url: string
  label: string
  feedUrl?: string
  disabled?: boolean
}> = [
  {
    id: "web-nalog-nalog",
    url: "https://nalog-nalog.ru/glavnye_novosti/",
    label: "Налог-Налог · Главные новости",
    feedUrl: "https://nalog-nalog.ru/rss",
  },
  {
    id: "web-vk-clerk",
    url: "https://m.vk.com/club45251012",
    label: "ВК · Клерк (нужен VK API)",
    disabled: true,
  },
  {
    id: "web-consultant-legalnews",
    url: "https://www.consultant.ru/legalnews/",
    label: "КонсультантПлюс · Правовые новости (RSS закрыт за 403)",
    disabled: true,
  },
  {
    id: "web-buhonline-forum",
    url: "https://www.buhonline.ru/forum",
    label: "БухОнлайн · Форум (нет RSS)",
    disabled: true,
  },
  {
    id: "web-rg-ekonomika",
    url: "https://rg.ru/tema/ekonomika",
    label: "РГ · Экономика",
    feedUrl: "https://rg.ru/xml/index.xml",
  },
  {
    id: "web-garant-news",
    url: "https://www.garant.ru/news/tag/1436/",
    label: "Гарант · Новости",
    feedUrl: "https://www.garant.ru/rss/news/",
  },
  {
    id: "web-glavkniga",
    url: "https://glavkniga.ru/news",
    label: "Главкнига · Новости (нет RSS)",
    disabled: true,
  },
]

function buildOlgaSources(): MonitoringSource[] {
  return [
    ...OLGA_TG_CHANNELS.map((c) => ({
      id: c.id,
      type: "telegram" as const,
      url: c.handle,
      label: c.label,
    })),
    ...OLGA_WEBSITES.map((w) => ({
      id: w.id,
      type: "website" as const,
      url: w.url,
      label: w.label,
      feedUrl: w.feedUrl,
      disabled: w.disabled,
    })),
  ]
}

/**
 * Создаёт «Ольгу» если её нет в БД. Идемпотентна — можно вызывать
 * на каждом обращении к API, отрабатывает за один SELECT в типичном случае.
 */
export async function ensureBuiltinTemplates(): Promise<void> {
  const existing = await db
    .select({ id: monitoringTemplates.id })
    .from(monitoringTemplates)
    .where(eq(monitoringTemplates.slug, OLGA_SLUG))
    .limit(1)
  if (existing.length > 0) return

  // Находим первого админа — он будет владельцем builtin-шаблона
  const admins = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.role, "admin"))
    .limit(1)
  if (admins.length === 0) {
    // Нет админов — не создаём. Зальётся при следующей попытке после первого admin'а.
    return
  }

  await db.insert(monitoringTemplates).values({
    slug: OLGA_SLUG,
    title: "Ольга",
    description:
      "Мониторинг налоговой и бухгалтерской повестки: Telegram-каналы экспертов и официальные источники. Базовый шаблон из ТЗ.",
    isBuiltin: true,
    isActive: true,
    mode: "feed",
    sources: buildOlgaSources(),
    topics: [],
    classifier: DEFAULT_CLASSIFIER,
    defaultIntervalDays: 1,
    schedule: { enabled: false, intervalHours: 24, hourUtc: 6 },
    createdBy: admins[0].id,
  })
}
