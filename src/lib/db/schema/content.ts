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
 * Настройки моделей и параметров pipeline для рубрики. Хранятся в JSONB,
 * чтобы добавлять новые поля без миграций. По умолчанию используем sonar-pro
 * (быстрее и дешевле, чем sonar-deep-research) и пропускаем Reddit — для
 * русскоязычной правовой/SMM-тематики Reddit вреден.
 */
export interface ContentRubricSettings {
  /** Окно поиска у Perplexity (дней назад). */
  researchWindowDays: number
  /** Модель Perplexity: `sonar` / `sonar-pro` / `sonar-deep-research`. */
  perplexityModel: string
  perplexityReasoningEffort: "low" | "medium" | "high"
  perplexitySearchContextSize: "low" | "medium" | "high"
  /** Whitelist доменов для Perplexity. Пусто = искать везде. */
  searchDomainFilter: string[]
  /** Recency filter — `day` / `week` / `month` / `year`. */
  searchRecencyFilter: "" | "day" | "week" | "month" | "year"
  /**
   * Преимущественный язык источников. Показывается в UI бейджем 🇷🇺 / 🇬🇧 / 🌍
   * и подсказывает модели в writer-промпте откуда тянуть материал.
   */
  searchLanguage: "ru" | "en" | "mixed"
  /**
   * Режим pipeline.
   * - "full": классика из 4 этапов (Perplexity → выбор темы → сжатие → писатель).
   *   Лучше для длинных лонгридов и дорогого писателя — отдельные дешёвые шаги
   *   фильтруют контекст и держат тему в фокусе.
   * - "express": 2 этапа (Perplexity → писатель). Дешевле и быстрее на ~15-20с,
   *   потому что один большой вызов вместо трёх. Подходит для коротких постов
   *   до 1500-2000 символов, где у писателя хватает контекста.
   */
  pipelineMode: "full" | "express"
  /** Включать ли Reddit-поиск через OpenAI web_search. По умолчанию выключен. */
  redditEnabled: boolean
  /** Модель для Reddit-поиска (OpenAI Responses API). */
  redditModel: string
  redditReasoningEffort: "low" | "medium" | "high"
  redditDays: number
  redditMaxToolCalls: number
  redditMaxOutputTokens: number
  /** Модели через OpenRouter для трёх стадий обработки. */
  topicSelectionModel: string
  compressionModel: string
  postGenerationModel: string
  /** Описание ЦА — подставляется в writer-prompt. */
  audience: string
  /** Целевой формат поста: telegram / twitter / instagram / email. Влияет на лимиты и приёмы. */
  postFormat: "telegram" | "twitter" | "instagram" | "email"
  /** Целевая длина итогового поста (символы). Только для UI/писателя — модель сама решает. */
  targetLength: number
  /** Защита от повторов опубликованных тем. */
  topicGuardEnabled: boolean
  topicGuardLookbackDays: number
  topicGuardMaxTopics: number
}

/**
 * Промпты, специфичные для рубрики (4 шт. на каждом шаге pipeline).
 * Общие промпты (topic_selection_system / compression_system) хранятся
 * глобально и не редактируются на уровне рубрики.
 */
export interface ContentRubricPrompts {
  /** Шаблон промпта для Perplexity. Поддерживает {start_date}/{end_date}. */
  perplexitySearchPrompt: string
  /** Шаблон промпта для Reddit. Поддерживает {start_date}/{end_date}. */
  redditSearchPrompt: string
  /** System-prompt для финальной генерации поста. */
  postWriterSystemPrompt: string
}

/**
 * Канал — сущность верхнего уровня, объединяющая набор рубрик одного
 * продукта/проекта (например, «ЦФУ Групп · Налоги»). У канала есть свои
 * дефолтные настройки pipeline и стилевой профиль — рубрики наследуют их
 * через JSONB-override в собственных settings.
 */
export const contentChannels = pgTable(
  "content_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Эмодзи для быстрой визуальной идентификации в селекторе. */
    icon: text("icon"),
    /** Дефолтные настройки pipeline, наследуются рубриками. */
    defaultSettings: jsonb("default_settings").$type<ContentRubricSettings>().notNull(),
    /** Стилевая «обвязка» для writer-промпта — кратко о тоне канала, ЦА, запретах. */
    voiceProfile: text("voice_profile").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_content_channels_slug").on(table.slug)],
)

export const contentRubrics = pgTable(
  "content_rubrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Стабильный ключ: base_real_work | prompt_of_week | … */
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /**
     * Канал, к которому относится рубрика. Может быть null для legacy
     * рубрик без канала — они попадают в группу «Без канала» в UI.
     */
    channelId: uuid("channel_id").references(() => contentChannels.id, {
      onDelete: "set null",
    }),
    /**
     * Legacy строковое поле «коллекция». Сохранено для миграции и обратной
     * совместимости — после переезда на channelId не используется.
     */
    collection: text("collection"),
    /** Видна ли рубрика пользователям. */
    isActive: boolean("is_active").notNull().default(true),
    /** Системные рубрики (3 дефолтные) — нельзя удалить, можно отключить/переписать. */
    isBuiltin: boolean("is_builtin").notNull().default(false),
    settings: jsonb("settings").$type<ContentRubricSettings>().notNull(),
    prompts: jsonb("prompts").$type<ContentRubricPrompts>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_content_rubrics_slug").on(table.slug),
    index("idx_content_rubrics_channel_id").on(table.channelId),
  ],
)

export type ContentChannel = typeof contentChannels.$inferSelect

/**
 * Глобальные системные промпты, используемые во всех рубриках.
 * Хранятся как key/value, чтобы можно было редактировать через UI.
 */
export const contentSettings = pgTable("content_settings", {
  key: text("key").primaryKey(), // topic_selection_system | web_context_compression_system
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export type ContentRunStatus =
  | "pending"
  | "perplexity"
  | "reddit"
  | "topic"
  | "compression"
  | "writing"
  | "done"
  | "error"

/**
 * Запуск пайплайна. Все артефакты каждого шага сохраняем в JSONB-поля
 * рядом, чтобы можно было показать «как получилось» и при желании
 * перегенерировать только финальный пост.
 */
export interface ContentRunTopicData {
  topic: string
  angle: string
  keyFacts: string[]
}

/**
 * Источник из Perplexity. Поле формы — точно как у Perplexity API: title/url/date/source.
 * Хранится в artifacts.perplexitySources и рендерится в UI как кликабельные карточки.
 */
export interface PerplexitySource {
  title?: string
  url?: string
  date?: string
  source?: string
  snippet?: string
}

/** Один сгенерированный вариант обложки — сохраняется в истории `coverImages`. */
export interface ContentRunCover {
  imageId: string
  prompt: string
  /** "3d_with_text" / "minimalist" / "photo" — на случай, если решим сравнивать стили. */
  style?: string
  createdAt: string
}

export interface ContentRunArtifacts {
  perplexityPrompt?: string
  perplexityReport?: string
  perplexitySources?: PerplexitySource[]
  redditPrompt?: string
  redditContext?: string
  forbiddenTopics?: string[]
  topicPrompt?: string
  topicData?: ContentRunTopicData
  topicSimilarityWarning?: {
    threshold: number
    triggered: boolean
    maxRatio: number
    matchedTopic: string
  }
  compressionPrompt?: string
  compressedWebContext?: string
  writerPrompt?: string
  /**
   * Текущая активная обложка — её мы показываем как «выбранную» в превью
   * и в Telegram-копии. Сохраняется отдельно, чтобы переключение между
   * вариантами было O(1) и без перегенерации.
   */
  coverImageId?: string
  coverImagePrompt?: string
  /** История всех сгенерированных вариантов — для галереи / отката. */
  coverImages?: ContentRunCover[]
}

export interface ContentRunCosts {
  perplexity?: number
  reddit?: number
  topic?: number
  compression?: number
  writer?: number
  /** Сумма всех refine-итераций в чате после готового поста. */
  refine?: number
  /** Стоимость генерации обложки (через /api/generate). */
  cover?: number
  total?: number
}

export const contentRuns = pgTable(
  "content_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Может быть null для свободных постов без рубрики (привязка к каналу). */
    rubricId: uuid("rubric_id").references(() => contentRubrics.id, {
      onDelete: "set null",
    }),
    /** Канал, к которому относится запуск. Для свободного поста — главная связь. */
    channelId: uuid("channel_id").references(() => contentChannels.id, {
      onDelete: "set null",
    }),
    /** Снимок slug рубрики на момент запуска — пригодится при переименовании. */
    rubricSlug: text("rubric_slug").notNull(),
    status: text("status").$type<ContentRunStatus>().notNull().default("pending"),
    /** На каком шаге сейчас или где упало (тот же набор значений, что и status). */
    stage: text("stage").$type<ContentRunStatus>().notNull().default("pending"),
    /** Финальный текст поста после успешного завершения. */
    postText: text("post_text"),
    /** Параметры запуска: модели, опции — берём снимок настроек рубрики. */
    settings: jsonb("settings").$type<ContentRubricSettings>().notNull(),
    artifacts: jsonb("artifacts").$type<ContentRunArtifacts>().notNull().default({}),
    /** Расход в долларах по шагам. Сумма уходит в `user.totalSpent`. */
    costs: jsonb("costs").$type<ContentRunCosts>().notNull().default({}),
    errorStage: text("error_stage").$type<ContentRunStatus>(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    index("idx_content_runs_user_id").on(table.userId),
    index("idx_content_runs_rubric_id").on(table.rubricId),
    index("idx_content_runs_created_at").on(table.createdAt),
    index("idx_content_runs_status").on(table.status),
  ],
)

/**
 * История сгенерированных и опубликованных тем — для topic_guard.
 * Подписываем published вручную (кнопка в UI), либо при отправке
 * во внешнюю площадку (фаза 2).
 */
export const contentTopics = pgTable(
  "content_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => contentRuns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Nullable: при свободном посте темы нет привязки к рубрике. */
    rubricId: uuid("rubric_id").references(() => contentRubrics.id, {
      onDelete: "set null",
    }),
    /** Для свободного поста — основная привязка. */
    channelId: uuid("channel_id").references(() => contentChannels.id, {
      onDelete: "set null",
    }),
    rubricSlug: text("rubric_slug").notNull(),
    topic: text("topic").notNull(),
    /** Нормализованная для нечёткого сравнения (нижний регистр, пунктуация → пробел). */
    normalizedTopic: text("normalized_topic").notNull(),
    angle: text("angle").notNull().default(""),
    published: boolean("published").notNull().default(false),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_content_topics_user_rubric").on(table.userId, table.rubricId),
    index("idx_content_topics_published").on(table.published, table.publishedAt),
    index("idx_content_topics_normalized").on(table.normalizedTopic),
  ],
)

/**
 * Сообщения чата-доработки готового поста. После того как пайплайн
 * вернул первый пост, пользователь может в свободном диалоге попросить
 * «сделай короче», «переформулируй заголовок» — ассистент возвращает
 * новый текст, который перезаписывает content_runs.post_text.
 */
export const contentRunMessages = pgTable(
  "content_run_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => contentRuns.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    /** Снимок поста после ответа ассистента (если меняли) — для отката. */
    postSnapshot: text("post_snapshot"),
    model: text("model"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    cost: numeric("cost", { precision: 10, scale: 6 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_content_run_messages_run_id").on(table.runId),
    index("idx_content_run_messages_created_at").on(table.createdAt),
  ],
)

export type ContentRubric = typeof contentRubrics.$inferSelect
export type ContentRun = typeof contentRuns.$inferSelect
export type ContentTopic = typeof contentTopics.$inferSelect
export type ContentSetting = typeof contentSettings.$inferSelect
export type ContentRunMessage = typeof contentRunMessages.$inferSelect
/** Стоимость в долларах по шагам — alias на ContentRunCosts. */
export type ContentRunCostsBreakdown = ContentRunCosts
