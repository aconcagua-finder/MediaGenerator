-- Миграция под фичу «Публикации» (контент-пайплайн):
-- 1) content_rubrics — настройки и промпты рубрик
-- 2) content_settings — глобальные системные промпты
-- 3) content_runs — запуски пайплайна с артефактами по шагам
-- 4) content_topics — история тем для topic guard
--
-- Файл совместим с `drizzle-kit push` (IF NOT EXISTS повсюду).

CREATE TABLE IF NOT EXISTS "content_rubrics" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "slug" text NOT NULL UNIQUE,
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "is_active" boolean NOT NULL DEFAULT true,
    "is_builtin" boolean NOT NULL DEFAULT false,
    "settings" jsonb NOT NULL,
    "prompts" jsonb NOT NULL,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_rubrics_slug" ON "content_rubrics" ("slug");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "content_settings" (
    "key" text PRIMARY KEY,
    "value" text NOT NULL,
    "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "content_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "rubric_id" uuid NOT NULL,
    "rubric_slug" text NOT NULL,
    "status" text NOT NULL DEFAULT 'pending',
    "stage" text NOT NULL DEFAULT 'pending',
    "post_text" text,
    "settings" jsonb NOT NULL,
    "artifacts" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "costs" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "error_stage" text,
    "error_message" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "finished_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "content_runs" ADD CONSTRAINT "content_runs_user_id_user_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "content_runs" ADD CONSTRAINT "content_runs_rubric_id_content_rubrics_id_fk"
        FOREIGN KEY ("rubric_id") REFERENCES "public"."content_rubrics"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_runs_user_id" ON "content_runs" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_runs_rubric_id" ON "content_runs" ("rubric_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_runs_created_at" ON "content_runs" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_runs_status" ON "content_runs" ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "content_topics" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "run_id" uuid NOT NULL,
    "user_id" text NOT NULL,
    "rubric_id" uuid NOT NULL,
    "rubric_slug" text NOT NULL,
    "topic" text NOT NULL,
    "normalized_topic" text NOT NULL,
    "angle" text NOT NULL DEFAULT '',
    "published" boolean NOT NULL DEFAULT false,
    "published_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "content_topics" ADD CONSTRAINT "content_topics_run_id_content_runs_id_fk"
        FOREIGN KEY ("run_id") REFERENCES "public"."content_runs"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "content_topics" ADD CONSTRAINT "content_topics_user_id_user_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "content_topics" ADD CONSTRAINT "content_topics_rubric_id_content_rubrics_id_fk"
        FOREIGN KEY ("rubric_id") REFERENCES "public"."content_rubrics"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_topics_user_rubric"
    ON "content_topics" ("user_id", "rubric_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_topics_published"
    ON "content_topics" ("published", "published_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_topics_normalized"
    ON "content_topics" ("normalized_topic");
