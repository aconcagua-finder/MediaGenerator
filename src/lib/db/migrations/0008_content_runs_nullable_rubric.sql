-- Делаем content_runs.rubric_id nullable и добавляем channel_id —
-- нужно для «Свободного поста», который не привязан к рубрике.

ALTER TABLE "content_runs" ALTER COLUMN "rubric_id" DROP NOT NULL;
--> statement-breakpoint

-- Пересоздаём FK на rubric_id с ON DELETE SET NULL (вместо CASCADE) —
-- чтобы удаление рубрики не уносило всю историю запусков.
DO $$ BEGIN
    ALTER TABLE "content_runs" DROP CONSTRAINT IF EXISTS "content_runs_rubric_id_content_rubrics_id_fk";
    ALTER TABLE "content_runs" ADD CONSTRAINT "content_runs_rubric_id_content_rubrics_id_fk"
        FOREIGN KEY ("rubric_id") REFERENCES "public"."content_rubrics"("id")
        ON DELETE set null ON UPDATE no action;
END $$;
--> statement-breakpoint

ALTER TABLE "content_runs" ADD COLUMN IF NOT EXISTS "channel_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "content_runs" ADD CONSTRAINT "content_runs_channel_id_content_channels_id_fk"
        FOREIGN KEY ("channel_id") REFERENCES "public"."content_channels"("id")
        ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_runs_channel_id" ON "content_runs" ("channel_id");
--> statement-breakpoint

-- Бэкфил channel_id у существующих runs из их рубрик
UPDATE content_runs r
SET channel_id = ru.channel_id
FROM content_rubrics ru
WHERE r.rubric_id = ru.id AND r.channel_id IS NULL;
