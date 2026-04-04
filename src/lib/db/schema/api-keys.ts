import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core"
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
}, (table) => [
  index("idx_api_keys_created_by").on(table.createdBy),
  index("idx_api_keys_provider_user").on(table.provider, table.createdBy),
])
