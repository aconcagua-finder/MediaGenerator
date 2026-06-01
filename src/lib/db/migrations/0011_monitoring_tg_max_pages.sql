-- Настройка глубины пагинации Telegram per-шаблон.
-- Одна страница t.me/s/{channel} ≈ 20 постов; default 5 = до 100 на канал.
ALTER TABLE "monitoring_templates"
    ADD COLUMN IF NOT EXISTS "tg_max_pages" integer NOT NULL DEFAULT 5;
