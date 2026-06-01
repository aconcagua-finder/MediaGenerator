-- Генерация видео через OpenRouter (POST /api/v1/videos). Асинхронный флоу:
-- submit job → polling по provider_job_id → скачивание mp4 в S3.
-- Зеркало пары generations/images, но с поправкой на job-based провайдер.
CREATE TABLE IF NOT EXISTS "video_generations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "provider" text NOT NULL,
    "model" text NOT NULL,
    "prompt" text NOT NULL,
    "mode" text NOT NULL DEFAULT 't2v',
    "params" jsonb,
    "status" text NOT NULL DEFAULT 'pending',
    "provider_job_id" text,
    "cost" numeric(10, 4),
    "error_message" text,
    "hidden" boolean NOT NULL DEFAULT false,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "completed_at" timestamp,
    CONSTRAINT "video_generations_user_id_user_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "videos" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "video_generation_id" uuid NOT NULL,
    "folder_id" uuid,
    "s3_key" text NOT NULL,
    "s3_url" text NOT NULL,
    "duration_seconds" integer,
    "width" integer,
    "height" integer,
    "format" text NOT NULL DEFAULT 'mp4',
    "has_audio" boolean NOT NULL DEFAULT false,
    "size_bytes" integer,
    "metadata" jsonb,
    "created_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "videos_video_generation_id_video_generations_id_fk"
        FOREIGN KEY ("video_generation_id") REFERENCES "video_generations"("id") ON DELETE cascade,
    CONSTRAINT "videos_folder_id_folders_id_fk"
        FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_video_generations_user_id" ON "video_generations" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_video_generations_created_at" ON "video_generations" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_video_generations_status" ON "video_generations" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_videos_video_generation_id" ON "videos" ("video_generation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_videos_folder_id" ON "videos" ("folder_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_videos_created_at" ON "videos" ("created_at");
