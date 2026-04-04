import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(),
  params: jsonb("params"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})
