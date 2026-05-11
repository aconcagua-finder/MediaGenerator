import { pgTable, uuid, text, integer, timestamp, jsonb, index, type AnyPgColumn } from "drizzle-orm/pg-core"
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
  // Если изображение — результат правки, ссылается на исходное
  parentImageId: uuid("parent_image_id").references((): AnyPgColumn => images.id, {
    onDelete: "set null",
  }),
  editPrompt: text("edit_prompt"),
  s3Key: text("s3_key").notNull(),
  s3Url: text("s3_url").notNull(),
  width: integer("width"),
  height: integer("height"),
  format: text("format"), // png | jpeg | webp
  sizeBytes: integer("size_bytes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_images_generation_id").on(table.generationId),
  index("idx_images_folder_id").on(table.folderId),
  index("idx_images_created_at").on(table.createdAt),
  index("idx_images_parent_id").on(table.parentImageId),
])
