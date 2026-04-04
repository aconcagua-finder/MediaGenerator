import { pgTable, uuid, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core"
import { generations } from "./generations"
import { folders } from "./folders"

export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  generationId: uuid("generation_id")
    .notNull()
    .references(() => generations.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => folders.id, {
    onDelete: "set null",
  }),
  s3Key: text("s3_key").notNull(),
  s3Url: text("s3_url").notNull(),
  width: integer("width"),
  height: integer("height"),
  format: text("format"), // png | jpeg | webp
  sizeBytes: integer("size_bytes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})
