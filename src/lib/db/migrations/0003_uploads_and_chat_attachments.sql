-- Эта миграция НЕ в _journal.json, потому что таблицы chats/chat_messages
-- тоже не были автогеном — проект использует `drizzle-kit push` для синка
-- схемы. Файл можно применить либо ручным psql, либо просто запустить
-- `drizzle-kit push` после обновления схемы — он создаст всё сам.
--
-- Здесь зафиксированы изменения, чтобы не потерять историю:
-- 1) новая таблица uploads под пользовательские вложения
-- 2) колонка attachments в chat_messages

CREATE TABLE IF NOT EXISTS "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"s3_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"size_bytes" integer NOT NULL,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_user_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_uploads_user_id" ON "uploads" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_uploads_created_at" ON "uploads" ("created_at");
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "attachments" jsonb;
