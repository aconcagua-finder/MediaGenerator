-- Раздел «Мониторинг»: сбор постов из Telegram-каналов и сайтов
-- с двумя режимами — сырая лента (feed) и AI-классификация по темам (topics).
-- Push-friendly: всё через IF NOT EXISTS, без DROP'ов.

CREATE TABLE IF NOT EXISTS "monitoring_templates" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "slug" text,
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "is_builtin" boolean NOT NULL DEFAULT false,
    "is_active" boolean NOT NULL DEFAULT true,
    "mode" text NOT NULL DEFAULT 'feed',
    "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "topics" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "classifier" jsonb,
    "default_interval_days" integer NOT NULL DEFAULT 1,
    "schedule" jsonb NOT NULL DEFAULT '{"enabled":false,"intervalHours":24,"hourUtc":6}'::jsonb,
    "last_run_at" timestamp,
    "next_run_at" timestamp,
    "created_by" text NOT NULL,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "monitoring_templates" ADD CONSTRAINT "monitoring_templates_created_by_user_id_fk"
        FOREIGN KEY ("created_by") REFERENCES "public"."user"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "monitoring_templates" ADD CONSTRAINT "monitoring_templates_slug_unique" UNIQUE ("slug");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_monitoring_templates_created_by" ON "monitoring_templates" ("created_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_templates_next_run_at" ON "monitoring_templates" ("next_run_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_templates_slug" ON "monitoring_templates" ("slug");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "monitoring_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "template_id" uuid NOT NULL,
    "user_id" text NOT NULL,
    "trigger" text NOT NULL DEFAULT 'manual',
    "status" text NOT NULL DEFAULT 'pending',
    "mode" text NOT NULL DEFAULT 'feed',
    "period_from" timestamp NOT NULL,
    "period_to" timestamp NOT NULL,
    "sources_total" integer NOT NULL DEFAULT 0,
    "sources_succeeded" integer NOT NULL DEFAULT 0,
    "sources_failed" integer NOT NULL DEFAULT 0,
    "items_found" integer NOT NULL DEFAULT 0,
    "items_matched" integer NOT NULL DEFAULT 0,
    "cost" numeric(10, 6) NOT NULL DEFAULT '0',
    "error_message" text,
    "artifacts" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "viewed_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "finished_at" timestamp
);
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "monitoring_runs" ADD CONSTRAINT "monitoring_runs_template_id_monitoring_templates_id_fk"
        FOREIGN KEY ("template_id") REFERENCES "public"."monitoring_templates"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "monitoring_runs" ADD CONSTRAINT "monitoring_runs_user_id_user_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_monitoring_runs_template_id" ON "monitoring_runs" ("template_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_runs_user_id" ON "monitoring_runs" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_runs_created_at" ON "monitoring_runs" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_runs_status" ON "monitoring_runs" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_runs_viewed_at" ON "monitoring_runs" ("viewed_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "monitoring_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "run_id" uuid NOT NULL,
    "source_id" text NOT NULL,
    "source_type" text NOT NULL,
    "source_url" text NOT NULL,
    "source_label" text,
    "post_url" text NOT NULL,
    "source_post_id" text,
    "published_at" timestamp,
    "title" text,
    "content" text NOT NULL DEFAULT '',
    "excerpt" text NOT NULL DEFAULT '',
    "images" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "match_type" text,
    "match_topic_id" text,
    "match_topic_name" text,
    "match_reason" text,
    "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "monitoring_items" ADD CONSTRAINT "monitoring_items_run_id_monitoring_runs_id_fk"
        FOREIGN KEY ("run_id") REFERENCES "public"."monitoring_runs"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_monitoring_items_run_id" ON "monitoring_items" ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_items_match_type" ON "monitoring_items" ("match_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_items_published_at" ON "monitoring_items" ("published_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_monitoring_items_source" ON "monitoring_items" ("run_id", "source_id");
