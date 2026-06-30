import { pgTable, uuid, text, integer, decimal, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { folders } from "./folders"

/**
 * Генерации озвучки (TTS). В отличие от видео — синхронные: провайдер сразу
 * отдаёт байты аудио, поэтому нет `providerJobId`/поллинга. Статус живёт коротко:
 * processing → saving → done | error (saving — защита от двойного списания).
 */
export const voiceGenerations = pgTable("voice_generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  /** Озвучиваемый текст */
  text: text("text").notNull(),
  /** Идентификатор голоса */
  voice: text("voice").notNull(),
  /** Формат итогового файла: mp3 | wav */
  format: text("format").notNull().default("mp3"),
  /** Прочие параметры (скорость и т.п.) */
  params: jsonb("params"),
  status: text("status").notNull().default("processing"), // processing | saving | done | error
  cost: decimal("cost", { precision: 10, scale: 4 }),
  errorMessage: text("error_message"),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_voice_generations_user_id").on(table.userId),
  index("idx_voice_generations_created_at").on(table.createdAt),
  index("idx_voice_generations_status").on(table.status),
])

/**
 * Готовые аудиофайлы. Один generation → один файл. Источник всегда один
 * (генерация озвучки), поэтому `voiceGenerationId` NOT NULL — без XOR, как у
 * видео-склеек: аудиоредактора нет.
 */
export const audios = pgTable("audios", {
  id: uuid("id").primaryKey().defaultRandom(),
  voiceGenerationId: uuid("voice_generation_id")
    .notNull()
    .references(() => voiceGenerations.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  s3Key: text("s3_key").notNull(),
  s3Url: text("s3_url").notNull(),
  durationSeconds: integer("duration_seconds"),
  format: text("format").notNull().default("mp3"),
  sizeBytes: integer("size_bytes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_audios_voice_generation_id").on(table.voiceGenerationId),
  index("idx_audios_folder_id").on(table.folderId),
  index("idx_audios_created_at").on(table.createdAt),
])
