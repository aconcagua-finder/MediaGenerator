-- Избранное в monitoring_items: пользователь помечает интересные посты, чтобы
-- видеть их в отдельной «библиотеке».
ALTER TABLE "monitoring_items"
    ADD COLUMN IF NOT EXISTS "is_favorite" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "monitoring_items"
    ADD COLUMN IF NOT EXISTS "favorited_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_items_favorite"
    ON "monitoring_items" ("is_favorite", "favorited_at");
