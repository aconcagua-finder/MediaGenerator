-- Engagement-метрики в monitoring_items: парсер собирает views/reactions/forwards/
-- comments (для TG) и slash:comments (для RSS). Хранятся в jsonb для гибкости,
-- но score вынесен в отдельную колонку для быстрого ORDER BY ... DESC.
ALTER TABLE "monitoring_items"
    ADD COLUMN IF NOT EXISTS "engagement" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "monitoring_items"
    ADD COLUMN IF NOT EXISTS "engagement_score" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_items_engagement"
    ON "monitoring_items" ("run_id", "engagement_score");
