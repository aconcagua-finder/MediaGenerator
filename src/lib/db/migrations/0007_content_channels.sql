-- Сущность «Канал» — продукт/проект, объединяющий несколько рубрик.
-- Авто-миграция: для каждой уникальной collection создаётся канал,
-- channel_id у соответствующих рубрик проставляется автоматически.

CREATE TABLE IF NOT EXISTS "content_channels" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "slug" text NOT NULL UNIQUE,
    "title" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "icon" text,
    "default_settings" jsonb NOT NULL,
    "voice_profile" text NOT NULL DEFAULT '',
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_channels_slug" ON "content_channels" ("slug");
--> statement-breakpoint

ALTER TABLE "content_rubrics" ADD COLUMN IF NOT EXISTS "channel_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "content_rubrics" ADD CONSTRAINT "content_rubrics_channel_id_content_channels_id_fk"
        FOREIGN KEY ("channel_id") REFERENCES "public"."content_channels"("id")
        ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_rubrics_channel_id" ON "content_rubrics" ("channel_id");
--> statement-breakpoint

-- Авто-миграция collection → channels
-- Для каждой уникальной непустой collection создаётся канал с дефолтными
-- настройками. Берём settings первой рубрики из этой коллекции как стартовые
-- defaults канала. Слаг канала — slugify(collection).
DO $$
DECLARE
    rec RECORD;
    channel_slug TEXT;
BEGIN
    FOR rec IN
        SELECT DISTINCT ON (collection)
            collection,
            settings
        FROM content_rubrics
        WHERE collection IS NOT NULL AND collection <> ''
        ORDER BY collection, created_at ASC
    LOOP
        -- упрощённый slugify: lower, латиница только
        channel_slug := lower(regexp_replace(rec.collection, '[^a-zA-Z0-9]+', '_', 'g'));
        -- кириллицу слугификация не вытянет — fallback на md5
        IF channel_slug = '_' OR channel_slug = '' OR length(channel_slug) < 3 THEN
            channel_slug := 'ch_' || substring(md5(rec.collection) from 1 for 8);
        END IF;
        INSERT INTO content_channels (slug, title, description, default_settings, voice_profile)
        VALUES (channel_slug, rec.collection, '', rec.settings, '')
        ON CONFLICT (slug) DO NOTHING;
    END LOOP;

    -- Привязываем рубрики к каналам по совпадению title канала и collection
    UPDATE content_rubrics r
    SET channel_id = c.id
    FROM content_channels c
    WHERE r.channel_id IS NULL
      AND r.collection IS NOT NULL
      AND r.collection = c.title;
END $$;
