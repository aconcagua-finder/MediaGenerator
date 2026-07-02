-- Доработки раздела «Публикации» под SMM-нужды (май 2026):
--   1) Новая таблица content_run_messages — чат-доработка готового поста
--   2) JSONB-схемы рубрик/раннов расширились новыми полями: эти изменения
--      применяются автоматически (поля внутри JSONB не требуют ALTER), ниже
--      только новая таблица.

CREATE TABLE IF NOT EXISTS "content_run_messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "run_id" uuid NOT NULL,
    "role" text NOT NULL,
    "content" text NOT NULL,
    "post_snapshot" text,
    "model" text,
    "tokens_in" integer,
    "tokens_out" integer,
    "cost" numeric(10, 6),
    "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "content_run_messages" ADD CONSTRAINT "content_run_messages_run_id_content_runs_id_fk"
        FOREIGN KEY ("run_id") REFERENCES "public"."content_runs"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_run_messages_run_id"
    ON "content_run_messages" ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_run_messages_created_at"
    ON "content_run_messages" ("created_at");
