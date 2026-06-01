import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
  index,
} from "drizzle-orm/pg-core"
import { user } from "./auth"

/**
 * Источник для мониторинга — единый интерфейс для Telegram-канала и сайта.
 * Для Telegram: `url` = "https://t.me/channel" или "@channel", тип определяется
 * парсером. Для сайтов — полный URL, тип "website".
 */
export interface MonitoringSource {
  /** Уникальный id внутри шаблона (на стороне UI/настроек). */
  id: string
  type: "telegram" | "website"
  /** Адрес: t.me/handle, @handle, или https://example.com/news. */
  url: string
  /** Человекочитаемое название (отображается в карточках). */
  label?: string
  /**
   * Прямой URL RSS/Atom feed'а для website-источника. Если задан — парсер
   * использует его сразу, минуя autodiscovery (`<link rel="alternate">` +
   * стандартные пути). Нужен для сайтов, у которых RSS лежит на нестандартном
   * пути и не объявлен в HTML head (rg.ru → /xml/index.xml, garant → /rss/news/).
   */
  feedUrl?: string
  /** Источник временно отключён, но не удалён. */
  disabled?: boolean
}

/**
 * Описание темы для классификатора (режим "topics"). Нейронка решает,
 * близкое / косвенное / не подходит для каждого поста по этим описаниям.
 */
export interface MonitoringTopic {
  id: string
  name: string
  /** Подробное описание темы для модели — что считаем близким попаданием. */
  description?: string
}

/**
 * Настройки авто-запуска шаблона. Минимальный интервал — 24 часа,
 * чтобы не сжечь токены. `hourUtc` — час суток UTC, в который запускается
 * (для intervalHours=24 шаблон запускается раз в сутки в это время).
 */
export interface MonitoringSchedule {
  enabled: boolean
  /** В часах. Минимум 24. */
  intervalHours: number
  /** 0–23, UTC. По умолчанию 6 утра UTC = 9 утра МСК. */
  hourUtc: number
}

/**
 * Параметры классификатора (модель + порог). Используется только в
 * режиме "topics". Модель — через OpenRouter chat completions.
 */
export interface MonitoringClassifier {
  /** Модель OpenRouter, например `anthropic/claude-haiku-4.5`. */
  model: string
  /** Максимум постов на один запрос модели (батч). */
  batchSize: number
  /** Если true — записываем в items даже те, что не подошли (match_type=none). */
  keepNonMatches: boolean
}

/**
 * Шаблон мониторинга. У каждого пользователя свои шаблоны + одна встроенная
 * «Ольга». Один шаблон = один набор источников + режим (feed/topics) + настройки.
 */
export const monitoringTemplates = pgTable(
  "monitoring_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Стабильный ключ. Для пользовательских шаблонов — null, для builtin — "olga". */
    slug: text("slug").unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Встроенный шаблон — нельзя удалить, можно отключить/переопределить. */
    isBuiltin: boolean("is_builtin").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    /** "feed" — собрать всё, без AI. "topics" — AI-классификация по темам. */
    mode: text("mode").notNull().default("feed"),
    /** Массив источников. */
    sources: jsonb("sources").$type<MonitoringSource[]>().notNull().default([]),
    /** Темы для классификатора. Используются только в mode=topics. */
    topics: jsonb("topics").$type<MonitoringTopic[]>().notNull().default([]),
    /** Параметры классификатора. */
    classifier: jsonb("classifier").$type<MonitoringClassifier>(),
    /** По умолчанию — за сколько дней искать (1..30). */
    defaultIntervalDays: integer("default_interval_days").notNull().default(1),
    /**
     * Сколько страниц preview-выдачи Telegram прокручиваем за один запуск.
     * Одна страница ≈ 20 постов. Default 5 = до 100 постов на канал; для
     * месячного интервала на активных каналах можно поднять до 10-15.
     * Чем больше — тем дольше и выше риск временного бана t.me.
     */
    tgMaxPages: integer("tg_max_pages").notNull().default(5),
    /** Авто-расписание. */
    schedule: jsonb("schedule").$type<MonitoringSchedule>().notNull().default({
      enabled: false,
      intervalHours: 24,
      hourUtc: 6,
    }),
    lastRunAt: timestamp("last_run_at"),
    nextRunAt: timestamp("next_run_at"),
    /** Владелец шаблона. Для builtin — id первого админа (заполняется при seed). */
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_monitoring_templates_created_by").on(table.createdBy),
    index("idx_monitoring_templates_next_run_at").on(table.nextRunAt),
    index("idx_monitoring_templates_slug").on(table.slug),
  ],
)

export type MonitoringRunStatus =
  | "pending"
  | "fetching"
  | "classifying"
  | "done"
  | "error"

export type MonitoringRunTrigger = "manual" | "scheduled"

/**
 * Артефакты запуска — диагностика по каждому источнику, чтобы можно
 * было понять, что упало или вернулось пустым.
 */
export interface MonitoringRunArtifacts {
  /** Журнал по каждому источнику в порядке обработки. */
  sourceLog?: Array<{
    sourceId: string
    type: "telegram" | "website"
    url: string
    label?: string
    status: "ok" | "empty" | "error"
    itemsCount: number
    /** Использованный feed-URL (для website — обнаруженный RSS). */
    feedUrl?: string
    errorMessage?: string
    durationMs?: number
  }>
  /** Журнал классификации (только для topics-режима). */
  classifierLog?: {
    model: string
    batches: number
    inputTokens: number
    outputTokens: number
    cost: number
    /** Прогресс — увеличивается после каждого батча, для UI-прогрессбара. */
    batchesProcessed?: number
    batchesTotal?: number
    /** Среднее время на батч (мс) — для оценки оставшегося времени. */
    avgBatchMs?: number
  }
  /**
   * Если items этого запуска взяты из недавнего успешного прогона
   * (`monitoring_runs.id` ≤ 6 часов назад), здесь — его id. Полезно для
   * отладки и UI: «использован кэш от такого-то прогона».
   */
  reusedFromRunId?: string
}

/**
 * Запуск шаблона. Хранит метрики, статус, артефакты, стоимость.
 * Items связаны через monitoring_items.run_id.
 */
export const monitoringRuns = pgTable(
  "monitoring_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => monitoringTemplates.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    trigger: text("trigger").$type<MonitoringRunTrigger>().notNull().default("manual"),
    status: text("status").$type<MonitoringRunStatus>().notNull().default("pending"),
    /** Снимок режима на момент запуска. */
    mode: text("mode").notNull().default("feed"),
    /** Период, за который собирали посты. */
    periodFrom: timestamp("period_from").notNull(),
    periodTo: timestamp("period_to").notNull(),
    sourcesTotal: integer("sources_total").notNull().default(0),
    sourcesSucceeded: integer("sources_succeeded").notNull().default(0),
    sourcesFailed: integer("sources_failed").notNull().default(0),
    itemsFound: integer("items_found").notNull().default(0),
    /** Сколько из найденных подошло под темы (для topics-режима). */
    itemsMatched: integer("items_matched").notNull().default(0),
    cost: numeric("cost", { precision: 10, scale: 6 }).notNull().default("0"),
    errorMessage: text("error_message"),
    artifacts: jsonb("artifacts").$type<MonitoringRunArtifacts>().notNull().default({}),
    /** Когда пользователь открыл результаты запуска — для сброса badge. */
    viewedAt: timestamp("viewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    index("idx_monitoring_runs_template_id").on(table.templateId),
    index("idx_monitoring_runs_user_id").on(table.userId),
    index("idx_monitoring_runs_created_at").on(table.createdAt),
    index("idx_monitoring_runs_status").on(table.status),
    index("idx_monitoring_runs_viewed_at").on(table.viewedAt),
  ],
)

export type MonitoringMatchType = "close" | "indirect" | "none"

export interface MonitoringItemImage {
  url: string
  width?: number
  height?: number
}

/**
 * Метрики вовлечённости поста. Заполняются парсерами:
 *  - Telegram (t.me/s/) — views/reactions/forwards/comments,
 *  - RSS — comments (через `slash:comments`), у некоторых сайтов.
 *
 * `engagementScore` хранится отдельной колонкой для быстрой сортировки.
 * Формула: views + reactionsTotal*15 + comments*30 + forwards*20.
 * Подобрана так, чтобы реакции/репосты весили в десятки раз больше просмотров —
 * это лучше передаёт «горячесть» поста, потому что просмотров у любого
 * крупного канала много, а реакции/репосты — индикатор отклика.
 */
export interface MonitoringItemEngagement {
  views?: number
  reactionsTotal?: number
  reactions?: Array<{ emoji: string; count: number }>
  comments?: number
  forwards?: number
}

/**
 * Найденный пост / новость. Один item = одна публикация из источника.
 * source_post_id используется как идемпотентный ключ внутри одного источника,
 * чтобы не дублировать посты при повторных запусках того же шаблона.
 */
export const monitoringItems = pgTable(
  "monitoring_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => monitoringRuns.id, { onDelete: "cascade" }),
    /** Снимок source.id из шаблона на момент запуска. */
    sourceId: text("source_id").notNull(),
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceLabel: text("source_label"),
    /** Прямая ссылка на пост (t.me/channel/123 или абсолютный URL новости). */
    postUrl: text("post_url").notNull(),
    /** Стабильный id поста внутри источника (для дедупа). */
    sourcePostId: text("source_post_id"),
    publishedAt: timestamp("published_at"),
    title: text("title"),
    /** Полный текст поста / статьи. Markdown / plain. */
    content: text("content").notNull().default(""),
    /** Короткая выжимка для списка (первые 240 символов content). */
    excerpt: text("excerpt").notNull().default(""),
    images: jsonb("images").$type<MonitoringItemImage[]>().notNull().default([]),
    /** Результат классификации (только для topics-режима). null для feed. */
    matchType: text("match_type").$type<MonitoringMatchType>(),
    /** Какая тема совпала (id из template.topics). */
    matchTopicId: text("match_topic_id"),
    matchTopicName: text("match_topic_name"),
    /** Объяснение классификатора — «почему он так решил». */
    matchReason: text("match_reason"),
    /** Помечено пользователем как «избранное» — для отдельной библиотеки. */
    isFavorite: boolean("is_favorite").notNull().default(false),
    favoritedAt: timestamp("favorited_at"),
    /** Метрики вовлечённости (views/reactions/comments/forwards). См. MonitoringItemEngagement. */
    engagement: jsonb("engagement").$type<MonitoringItemEngagement>().notNull().default({}),
    /**
     * Численный показатель «горячести» для сортировки. Формула вычисляется
     * один раз при insert (см. pipeline.ts/computeEngagementScore). Отдельная
     * колонка — чтобы можно было сортировать ORDER BY engagement_score DESC
     * без распаковки JSONB на каждом запросе.
     */
    engagementScore: integer("engagement_score").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_monitoring_items_run_id").on(table.runId),
    index("idx_monitoring_items_match_type").on(table.matchType),
    index("idx_monitoring_items_published_at").on(table.publishedAt),
    index("idx_monitoring_items_source").on(table.runId, table.sourceId),
    index("idx_monitoring_items_favorite").on(table.isFavorite, table.favoritedAt),
    index("idx_monitoring_items_engagement").on(table.runId, table.engagementScore),
  ],
)

export type MonitoringTemplate = typeof monitoringTemplates.$inferSelect
export type MonitoringRun = typeof monitoringRuns.$inferSelect
export type MonitoringItem = typeof monitoringItems.$inferSelect
