import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core"
import { user } from "./auth"

/**
 * Картинки, которые пользователь загружает сам (через paste/drag-drop/file picker),
 * чтобы потом отправить в чат как вложение или в форму генерации как референс.
 *
 * Отдельная таблица от `images`, потому что у тех есть FK на generation —
 * а здесь источник не наша генерация, а пользователь.
 */
export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  s3Key: text("s3_key").notNull(),
  mimeType: text("mime_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  sizeBytes: integer("size_bytes").notNull(),
  /**
   * Откуда загружено: paste / drop / picker.
   * Полезно для аналитики и дебага, но необязательное.
   */
  source: text("source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_uploads_user_id").on(table.userId),
  index("idx_uploads_created_at").on(table.createdAt),
])
