import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const folders = pgTable("folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_folders_user_id").on(table.userId),
  index("idx_folders_parent_id").on(table.parentId),
])
