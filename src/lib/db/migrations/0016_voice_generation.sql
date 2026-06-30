-- Озвучка (TTS) через OpenRouter (POST /api/v1/audio/speech). СИНХРОННЫЙ флоу:
-- один запрос сразу отдаёт байты аудио → сразу в S3, без job/poll/cron.
-- Зеркало пары video_generations/videos, но без provider_job_id и без XOR
-- (аудиоредактора нет, источник всегда один — генерация озвучки).
-- Идемпотентна (IF NOT EXISTS) — push-friendly, как 0003+.
CREATE TABLE IF NOT EXISTS "voice_generations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "provider" text NOT NULL,
    "model" text NOT NULL,
    "text" text NOT NULL,
    "voice" text NOT NULL,
    "format" text NOT NULL DEFAULT 'mp3',
    "params" jsonb,
    "status" text NOT NULL DEFAULT 'processing',
    "cost" numeric(10, 4),
    "error_message" text,
    "hidden" boolean NOT NULL DEFAULT false,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "completed_at" timestamp,
    CONSTRAINT "voice_generations_user_id_user_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audios" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "voice_generation_id" uuid NOT NULL,
    "folder_id" uuid,
    "s3_key" text NOT NULL,
    "s3_url" text NOT NULL,
    "duration_seconds" integer,
    "format" text NOT NULL DEFAULT 'mp3',
    "size_bytes" integer,
    "metadata" jsonb,
    "created_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "audios_voice_generation_id_voice_generations_id_fk"
        FOREIGN KEY ("voice_generation_id") REFERENCES "voice_generations"("id") ON DELETE cascade,
    CONSTRAINT "audios_folder_id_folders_id_fk"
        FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_voice_generations_user_id" ON "voice_generations" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_voice_generations_created_at" ON "voice_generations" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_voice_generations_status" ON "voice_generations" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audios_voice_generation_id" ON "audios" ("voice_generation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audios_folder_id" ON "audios" ("folder_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audios_created_at" ON "audios" ("created_at");
