import { pgTable, uuid, text, integer, decimal, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { videoGenerations } from "./videos"

/**
 * Пользовательские входные файлы для видео-задач: исходное видео (video-to-video,
 * Kling Motion Control) или образец голоса (замена голоса). Загружаются заранее,
 * отдельным запросом, чтобы пользователь мог посмотреть превью, а после ошибки
 * (например, модерации) повторить задачу без повторной загрузки. Файл лежит в S3
 * под `video-sources/{id}/...`, чистится кроном по истечении TTL (24 ч).
 */
export const videoSources = pgTable("video_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** video | audio */
  kind: text("kind").notNull().default("video"),
  s3Key: text("s3_key").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  /** Длительность по ffprobe (секунды, до миллисекунд) */
  durationSeconds: decimal("duration_seconds", { precision: 8, scale: 3 }),
  width: integer("width"),
  height: integer("height"),
  hasAudio: boolean("has_audio").notNull().default(false),
  originalName: text("original_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_video_sources_user_id").on(table.userId),
  index("idx_video_sources_created_at").on(table.createdAt),
])

/**
 * Публичные одноразовые ссылки на файл в S3. Нужны провайдерам, которые принимают
 * вход ТОЛЬКО по публичному HTTPS-URL (OpenRouter/Runway, fal.ai): MinIO снаружи
 * недоступен, поэтому отдаём файл через публичный маршрут `/api/media-link/{token}`.
 *
 * В БД лежит только SHA-256 хеш токена (утечка БД не раскрывает рабочих ссылок);
 * сам токен (256 бит) существует лишь в URL, отданном провайдеру. Ссылка живёт
 * `expires_at` (24 ч) и отзывается (`revoked_at`) при завершении задачи.
 */
export const publicMediaLinks = pgTable("public_media_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull(),
  s3Key: text("s3_key").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes"),
  /** Для чего ссылка: v2v-source | character-image | voice-audio | voice-sample */
  purpose: text("purpose").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  generationId: uuid("generation_id").references(() => videoGenerations.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_public_media_links_token_hash").on(table.tokenHash),
  index("idx_public_media_links_generation_id").on(table.generationId),
  index("idx_public_media_links_expires_at").on(table.expiresAt),
])
