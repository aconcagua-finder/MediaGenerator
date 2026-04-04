import { pgTable, uuid, text, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core"

export const modelRegistry = pgTable("model_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  paramsSchema: jsonb("params_schema"),
  pricing: jsonb("pricing"),
  isActive: boolean("is_active").notNull().default(true),
  lastCheckedAt: timestamp("last_checked_at"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
}, (table) => [
  index("idx_model_registry_provider").on(table.provider),
  index("idx_model_registry_provider_model").on(table.provider, table.modelId),
])
