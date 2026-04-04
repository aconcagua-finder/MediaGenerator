import { pgTable, uuid, text, integer, decimal, timestamp, jsonb, index } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const generations = pgTable("generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  prompt: text("prompt").notNull(),
  params: jsonb("params"),
  status: text("status").notNull().default("pending"), // pending | processing | done | error
  imagesCount: integer("images_count").notNull().default(1),
  cost: decimal("cost", { precision: 10, scale: 4 }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_generations_user_id").on(table.userId),
  index("idx_generations_created_at").on(table.createdAt),
  index("idx_generations_status").on(table.status),
])
