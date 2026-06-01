-- Делаем content_topics.rubric_id nullable и добавляем channel_id —
-- нужно для тем из «Свободного поста», которые не привязаны к рубрике.
-- Также позволяет сохранять историю при удалении рубрики (ON DELETE SET NULL).

ALTER TABLE "content_topics" ALTER COLUMN "rubric_id" DROP NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "content_topics" DROP CONSTRAINT IF EXISTS "content_topics_rubric_id_content_rubrics_id_fk";
    ALTER TABLE "content_topics" ADD CONSTRAINT "content_topics_rubric_id_content_rubrics_id_fk"
        FOREIGN KEY ("rubric_id") REFERENCES "public"."content_rubrics"("id")
        ON DELETE set null ON UPDATE no action;
END $$;
--> statement-breakpoint

ALTER TABLE "content_topics" ADD COLUMN IF NOT EXISTS "channel_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "content_topics" ADD CONSTRAINT "content_topics_channel_id_content_channels_id_fk"
        FOREIGN KEY ("channel_id") REFERENCES "public"."content_channels"("id")
        ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_topics_channel_id" ON "content_topics" ("channel_id");
--> statement-breakpoint

-- Бэкфил channel_id у существующих тем из их рубрик
UPDATE content_topics t
SET channel_id = r.channel_id
FROM content_rubrics r
WHERE t.rubric_id = r.id AND t.channel_id IS NULL;
