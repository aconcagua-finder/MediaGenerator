import { pgTable, uuid, text, integer, real, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { videos } from "./videos"

/**
 * Склейка (редактор) видео: пользователь собирает несколько уже готовых клипов
 * в один файл, опционально подрезая и переставляя их.
 *
 * Это локальная ffmpeg-задача, БЕЗ провайдера и БЕЗ стоимости — поэтому здесь
 * нет колонок provider/model/cost из `video_generations`. Но job-флоу зеркалит
 * генерацию: status (processing → saving → done|error), race-safe claim,
 * cron-дореконсиляция зависших. Готовый mp4 кладётся в общую таблицу `videos`
 * (через `videos.composition_id`), поэтому появляется в библиотеке как обычное
 * видео. См. `src/lib/video/compose.ts`.
 */
export const videoCompositions = pgTable("video_compositions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Имя итогового файла / заметка пользователя (опционально) */
  title: text("title"),
  /** Настройки вывода: { width, height, fps, audio, orientation } */
  params: jsonb("params"),
  status: text("status").notNull().default("processing"), // processing | saving | done | error
  /** Прогресс рендера 0..100 (из `ffmpeg -progress`), null пока не считается */
  progress: integer("progress"),
  errorMessage: text("error_message"),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_video_compositions_user_id").on(table.userId),
  index("idx_video_compositions_status").on(table.status),
  index("idx_video_compositions_created_at").on(table.createdAt),
])

/**
 * EDL (edit decision list) одной склейки: упорядоченный список сегментов.
 * Нормализованная таблица (а не jsonb) — ради FK-целостности к исходным клипам,
 * удобного re-edit и запроса «какие склейки используют клип X».
 *
 * `source_video_id` → ON DELETE SET NULL: удаление исходного клипа после склейки
 * НЕ ломает уже отрендеренный mp4 (он самостоятельный объект в S3), лишь теряется
 * ссылка на источник.
 */
export const videoCompositionSegments = pgTable("video_composition_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  compositionId: uuid("composition_id")
    .notNull()
    .references(() => videoCompositions.id, { onDelete: "cascade" }),
  sourceVideoId: uuid("source_video_id").references(() => videos.id, { onDelete: "set null" }),
  /** Порядковый номер сегмента в дорожке (0-based) */
  position: integer("position").notNull(),
  /** Обрезка: начало/конец в секундах от начала клипа (null = без обрезки с этой стороны) */
  trimStartSeconds: real("trim_start_seconds"),
  trimEndSeconds: real("trim_end_seconds"),
  /** Заглушить звук этого сегмента */
  mute: boolean("mute").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_vcs_composition_id").on(table.compositionId),
  index("idx_vcs_source_video_id").on(table.sourceVideoId),
])
