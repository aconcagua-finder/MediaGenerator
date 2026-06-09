import { pgTable, uuid, text, integer, decimal, timestamp, jsonb, boolean, index, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "./auth"
import { folders } from "./folders"
import { videoCompositions } from "./video-compositions"

/**
 * Генерации видео. Зеркало `generations`, но с поправкой на асинхронность:
 * провайдер (OpenRouter) принимает job и отдаёт результат не сразу, поэтому
 * храним `providerJobId` для опроса статуса и `mode` (t2v / i2v).
 */
export const videoGenerations = pgTable("video_generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  prompt: text("prompt").notNull(),
  mode: text("mode").notNull().default("t2v"), // t2v | i2v
  params: jsonb("params"),
  status: text("status").notNull().default("pending"), // pending | processing | done | error
  /** ID задачи на стороне провайдера (для опроса статуса) */
  providerJobId: text("provider_job_id"),
  cost: decimal("cost", { precision: 10, scale: 4 }),
  errorMessage: text("error_message"),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_video_generations_user_id").on(table.userId),
  index("idx_video_generations_created_at").on(table.createdAt),
  index("idx_video_generations_status").on(table.status),
])

/**
 * Готовые видеофайлы. Зеркало `images`: один generation обычно даёт один файл,
 * но схема 1→N оставлена для совместимости с паттерном картинок.
 *
 * Владелец видео — РОВНО ОДИН из двух источников (XOR, enforced CHECK-constraint
 * `videos_owner_xor`):
 *  - `videoGenerationId` — клип, сгенерированный нейросетью (`video_generations`);
 *  - `compositionId` — клип, склеенный из других в редакторе (`video_compositions`).
 * Поэтому `videoGenerationId` теперь nullable. FK и CHECK объявлены и здесь, и в
 * SQL-миграции 0015 — иначе `drizzle-kit push` снёс бы их при следующей синхронизации.
 * Циклический импорт с `video_compositions` безопасен: ссылки ленивые (`() => …`).
 */
export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoGenerationId: uuid("video_generation_id")
    .references(() => videoGenerations.id, { onDelete: "cascade" }),
  /** Источник-склейка (см. video_compositions) */
  compositionId: uuid("composition_id")
    .references(() => videoCompositions.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  s3Key: text("s3_key").notNull(),
  s3Url: text("s3_url").notNull(),
  durationSeconds: integer("duration_seconds"),
  width: integer("width"),
  height: integer("height"),
  format: text("format").notNull().default("mp4"),
  hasAudio: boolean("has_audio").notNull().default(false),
  sizeBytes: integer("size_bytes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_videos_video_generation_id").on(table.videoGenerationId),
  index("idx_videos_composition_id").on(table.compositionId),
  index("idx_videos_folder_id").on(table.folderId),
  index("idx_videos_created_at").on(table.createdAt),
  // Ровно один источник: генерация XOR склейка (см. миграцию 0015)
  check(
    "videos_owner_xor",
    sql`("video_generation_id" is not null) <> ("composition_id" is not null)`,
  ),
])
