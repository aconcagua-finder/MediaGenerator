-- Склейка (редактор) видео: пользователь собирает несколько готовых клипов в один.
-- Локальный ffmpeg-рендер (без провайдера и без стоимости). Job-флоу зеркалит
-- video_generations (status processing→saving→done|error, cron-дореконсиляция).
-- Готовый mp4 кладётся в общую таблицу videos через videos.composition_id,
-- поэтому появляется в библиотеке как обычное видео.
-- Идемпотентна (IF NOT EXISTS / DROP IF EXISTS) — push-friendly, как 0003+.
CREATE TABLE IF NOT EXISTS "video_compositions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "title" text,
    "params" jsonb,
    "status" text NOT NULL DEFAULT 'processing',
    "progress" integer,
    "error_message" text,
    "hidden" boolean NOT NULL DEFAULT false,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "completed_at" timestamp,
    CONSTRAINT "video_compositions_user_id_user_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_composition_segments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "composition_id" uuid NOT NULL,
    "source_video_id" uuid,
    "position" integer NOT NULL,
    "trim_start_seconds" real,
    "trim_end_seconds" real,
    "mute" boolean NOT NULL DEFAULT false,
    "created_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "vcs_composition_id_fk"
        FOREIGN KEY ("composition_id") REFERENCES "video_compositions"("id") ON DELETE cascade,
    CONSTRAINT "vcs_source_video_id_fk"
        FOREIGN KEY ("source_video_id") REFERENCES "videos"("id") ON DELETE set null
);
--> statement-breakpoint
-- videos теперь может принадлежать либо генерации, либо склейке (ровно одному).
ALTER TABLE "videos" ALTER COLUMN "video_generation_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "composition_id" uuid;
--> statement-breakpoint
ALTER TABLE "videos" DROP CONSTRAINT IF EXISTS "videos_composition_id_fk";
--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_composition_id_fk"
    FOREIGN KEY ("composition_id") REFERENCES "video_compositions"("id") ON DELETE cascade;
--> statement-breakpoint
-- XOR-владелец: ровно один из источников задан. Существующие строки проходят
-- (у всех video_generation_id задан, composition_id NULL), бэкфилл не нужен.
ALTER TABLE "videos" DROP CONSTRAINT IF EXISTS "videos_owner_xor";
--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_owner_xor"
    CHECK (("video_generation_id" IS NOT NULL) <> ("composition_id" IS NOT NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_video_compositions_user_id" ON "video_compositions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_video_compositions_status" ON "video_compositions" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_video_compositions_created_at" ON "video_compositions" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vcs_composition_id" ON "video_composition_segments" ("composition_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vcs_source_video_id" ON "video_composition_segments" ("source_video_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_videos_composition_id" ON "videos" ("composition_id");
