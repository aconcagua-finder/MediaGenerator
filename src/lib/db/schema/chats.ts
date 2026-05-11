import { pgTable, uuid, text, integer, timestamp, jsonb, numeric, index } from "drizzle-orm/pg-core"
import { user } from "./auth"

export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  model: text("model").notNull(),
  systemPrompt: text("system_prompt"),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_chats_user_id").on(table.userId),
  index("idx_chats_updated_at").on(table.updatedAt),
])

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: uuid("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant | system
  content: text("content").notNull(),
  model: text("model"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  cost: numeric("cost", { precision: 10, scale: 6 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_chat_messages_chat_id").on(table.chatId),
  index("idx_chat_messages_created_at").on(table.createdAt),
])
