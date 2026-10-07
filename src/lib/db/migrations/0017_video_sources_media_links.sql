-- Видео → видео (Runway Aleph 2 через OpenRouter, Kling Motion Control через fal.ai)
-- и замена голоса: провайдеры принимают входные файлы только по публичному HTTPS-URL.
--  * video_sources — файл, загруженный пользователем заранее (исходное видео / образец
--    голоса), лежит в S3 под video-sources/{id}/..., чистится кроном по TTL 24 ч;
--  * public_media_links — публичные ссылки-токены на файл в S3 (в БД только SHA-256
--    хеш токена), с истечением (expires_at) и отзывом (revoked_at) по завершении задачи.
-- Идемпотентна (IF NOT EXISTS) — push-friendly, как 0003+.
CREATE TABLE IF NOT EXISTS "video_sources" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "kind" text NOT NULL DEFAULT 'video',
    "s3_key" text NOT NULL,
    "content_type" text NOT NULL,
    "size_bytes" integer NOT NULL,
    "duration_seconds" numeric(8, 3),
    "width" integer,
    "height" integer,
    "has_audio" boolean NOT NULL DEFAULT false,
    "original_name" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "video_sources_user_id_user_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public_media_links" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "token_hash" text NOT NULL,
    "s3_key" text NOT NULL,
    "content_type" text NOT NULL,
    "size_bytes" integer,
    "purpose" text NOT NULL,
    "user_id" text NOT NULL,
    "generation_id" uuid,
    "expires_at" timestamp NOT NULL,
    "revoked_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "public_media_links_user_id_user_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade,
    CONSTRAINT "public_media_links_generation_id_video_generations_id_fk"
        FOREIGN KEY ("generation_id") REFERENCES "video_generations"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_video_sources_user_id" ON "video_sources" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_video_sources_created_at" ON "video_sources" ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_public_media_links_token_hash" ON "public_media_links" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_public_media_links_generation_id" ON "public_media_links" ("generation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_public_media_links_expires_at" ON "public_media_links" ("expires_at");
