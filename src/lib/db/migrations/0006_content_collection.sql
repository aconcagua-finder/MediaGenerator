-- Добавляем поле «коллекция» к рубрикам — это глобальный тег
-- для группировки в селекторе (ЦФУ / Legal AI / другие проекты).
-- Язык источников (ru/en/mixed) живёт внутри JSONB settings — миграция
-- ему не нужна.

ALTER TABLE "content_rubrics" ADD COLUMN IF NOT EXISTS "collection" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_rubrics_collection" ON "content_rubrics" ("collection");
