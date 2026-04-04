import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(), // openai | xai | openrouter
  encryptedKey: text("encrypted_key").notNull(),
  keyHint: text("key_hint").notNull(), // последние 4 символа
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})
