import { db } from "@/lib/db"
import { contentRubrics, contentSettings } from "@/lib/db/schema/content"
import { eq, sql } from "drizzle-orm"
import {
  CONTENT_SETTING_KEYS,
  DEFAULT_RUBRICS,
  DEFAULT_RUBRIC_SETTINGS,
  DEFAULT_TOPIC_SELECTION_SYSTEM_PROMPT,
  DEFAULT_WEB_CONTEXT_COMPRESSION_SYSTEM_PROMPT,
  UNIVERSAL_POST_WRITER_PROMPT,
} from "./default-rubrics"

/**
 * Идемпотентно засеивает дефолтные рубрики и системные промпты.
 * Если запись с тем же slug/key уже есть — НЕ перезаписываем (даём
 * админу возможность отредактировать через UI без отката).
 *
 * Вызывается лениво при первом обращении к разделу «Публикации» —
 * `ON CONFLICT DO NOTHING` защищает от race condition, если две
 * параллельные ветки (Promise.all listRubrics+listRuns) запустят
 * сидинг одновременно.
 */
export async function ensureContentDefaults(): Promise<void> {
  // 1) Системные промпты — глобальные настройки
  const expectedSettings = [
    {
      key: CONTENT_SETTING_KEYS.topicSelectionSystem,
      value: DEFAULT_TOPIC_SELECTION_SYSTEM_PROMPT,
    },
    {
      key: CONTENT_SETTING_KEYS.webContextCompressionSystem,
      value: DEFAULT_WEB_CONTEXT_COMPRESSION_SYSTEM_PROMPT,
    },
    {
      key: CONTENT_SETTING_KEYS.universalPostWriterSystem,
      value: UNIVERSAL_POST_WRITER_PROMPT,
    },
  ]
  for (const row of expectedSettings) {
    await db
      .insert(contentSettings)
      .values(row)
      .onConflictDoNothing({ target: contentSettings.key })
  }

  // 2) Дефолтные рубрики — `ON CONFLICT (slug) DO NOTHING` атомарно решает
  // и про существующие записи, и про конкурентную вставку. Делаем одной
  // пачкой, чтобы избежать N round-trip'ов.
  if (DEFAULT_RUBRICS.length > 0) {
    await db
      .insert(contentRubrics)
      .values(
        DEFAULT_RUBRICS.map((rubric) => ({
          slug: rubric.slug,
          title: rubric.title,
          description: rubric.description,
          collection: rubric.collection ?? null,
          isActive: true,
          isBuiltin: true,
          settings: { ...DEFAULT_RUBRIC_SETTINGS, ...(rubric.settingsOverride || {}) },
          prompts: rubric.prompts,
        })),
      )
      .onConflictDoNothing({ target: contentRubrics.slug })
  }
}

/**
 * Прочитать глобальный системный промпт. Возвращает значение по умолчанию,
 * если запись отсутствует (но обычно ensureContentDefaults её создаёт).
 */
export async function getSystemPrompt(key: string, fallback: string): Promise<string> {
  const [row] = await db
    .select({ value: contentSettings.value })
    .from(contentSettings)
    .where(eq(contentSettings.key, key))
    .limit(1)
  return (row?.value || fallback).trim()
}

/**
 * Обновить глобальный системный промпт. Используется UI редактора рубрик.
 */
export async function setSystemPrompt(key: string, value: string): Promise<void> {
  await db
    .insert(contentSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: contentSettings.key,
      set: { value, updatedAt: sql`now()` },
    })
}
