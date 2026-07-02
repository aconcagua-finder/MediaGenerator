"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  contentChannels,
  contentRubrics,
  contentRuns,
  contentSettings,
  contentTopics,
  type ContentRubricPrompts,
  type ContentRubricSettings,
} from "@/lib/db/schema"
import { getSession } from "@/lib/auth-server"
import {
  CONTENT_SETTING_KEYS,
  DEFAULT_TOPIC_SELECTION_SYSTEM_PROMPT,
  DEFAULT_WEB_CONTEXT_COMPRESSION_SYSTEM_PROMPT,
  DEFAULT_RUBRIC_SETTINGS,
} from "@/lib/content/default-rubrics"
import { ensureContentDefaults, setSystemPrompt } from "@/lib/content/seed"
import { markRunPublished, unmarkRunPublished } from "@/lib/content/pipeline"

function requireSession() {
  return getSession().then((session) => {
    if (!session?.user) throw new Error("Не авторизован")
    return session
  })
}

export async function listRubrics() {
  await requireSession()
  await ensureContentDefaults()
  return db
    .select()
    .from(contentRubrics)
    .orderBy(desc(contentRubrics.isBuiltin), contentRubrics.title)
}

// ── Channels ───────────────────────────────────────────────────────────────

export async function listChannels() {
  await requireSession()
  await ensureContentDefaults()
  return db.select().from(contentChannels).orderBy(contentChannels.title)
}

export async function createChannel(input: {
  slug: string
  title: string
  description?: string
  icon?: string
  defaultSettings?: Partial<ContentRubricSettings>
  voiceProfile?: string
}) {
  const session = await requireSession()
  if (session.user.role !== "admin") {
    throw new Error("Создавать каналы может только админ")
  }
  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_")
  if (!slug) throw new Error("Slug канала обязателен")
  if (!input.title.trim()) throw new Error("Название канала обязательно")

  const { DEFAULT_RUBRIC_SETTINGS } = await import("@/lib/content/default-rubrics")
  const defaultSettings: ContentRubricSettings = {
    ...DEFAULT_RUBRIC_SETTINGS,
    ...(input.defaultSettings || {}),
  }
  const [channel] = await db
    .insert(contentChannels)
    .values({
      slug,
      title: input.title.trim(),
      description: (input.description || "").trim(),
      icon: input.icon || null,
      defaultSettings,
      voiceProfile: (input.voiceProfile || "").trim(),
    })
    .returning()
  revalidatePath("/publications")
  revalidatePath("/publications/rubrics")
  return channel
}

export async function updateChannel(input: {
  id: string
  title?: string
  description?: string
  icon?: string | null
  defaultSettings?: ContentRubricSettings
  voiceProfile?: string
  isActive?: boolean
}) {
  const session = await requireSession()
  if (session.user.role !== "admin") {
    throw new Error("Редактировать каналы может только админ")
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.description !== undefined) patch.description = input.description.trim()
  if (input.icon !== undefined) patch.icon = input.icon || null
  if (input.defaultSettings !== undefined) patch.defaultSettings = input.defaultSettings
  if (input.voiceProfile !== undefined) patch.voiceProfile = input.voiceProfile.trim()
  if (input.isActive !== undefined) patch.isActive = input.isActive
  await db.update(contentChannels).set(patch).where(eq(contentChannels.id, input.id))
  revalidatePath("/publications")
  revalidatePath("/publications/rubrics")
}

export async function deleteChannel(channelId: string) {
  const session = await requireSession()
  if (session.user.role !== "admin") {
    throw new Error("Удалять каналы может только админ")
  }
  await db.delete(contentChannels).where(eq(contentChannels.id, channelId))
  revalidatePath("/publications")
  revalidatePath("/publications/rubrics")
}

/**
 * Применить черновик канала из ассистента: создаёт канал и набор рубрик в нём.
 * Слаги при коллизии разрешаются добавлением суффикса.
 */
export async function applyChannelDraft(draft: {
  channel: {
    slug: string
    title: string
    description?: string
    icon?: string
    voiceProfile?: string
    defaultSettings: ContentRubricSettings
  }
  rubrics: Array<{
    slug: string
    title: string
    description?: string
    settingsOverride?: Partial<ContentRubricSettings>
    prompts: ContentRubricPrompts
  }>
}) {
  const session = await requireSession()
  if (session.user.role !== "admin") {
    throw new Error("Создавать каналы может только админ")
  }

  // Уникализируем slug канала
  let channelSlug = draft.channel.slug
  for (let i = 0; i < 50; i++) {
    const exists = await db
      .select({ id: contentChannels.id })
      .from(contentChannels)
      .where(eq(contentChannels.slug, channelSlug))
      .limit(1)
    if (exists.length === 0) break
    channelSlug = `${draft.channel.slug}_${i + 2}`
  }

  const [channel] = await db
    .insert(contentChannels)
    .values({
      slug: channelSlug,
      title: draft.channel.title,
      description: draft.channel.description || "",
      icon: draft.channel.icon || null,
      defaultSettings: draft.channel.defaultSettings,
      voiceProfile: draft.channel.voiceProfile || "",
    })
    .returning()

  const createdRubrics = [] as Array<typeof contentRubrics.$inferSelect>
  for (const r of draft.rubrics) {
    // Уникализируем slug рубрики
    let rubricSlug = r.slug
    for (let i = 0; i < 50; i++) {
      const exists = await db
        .select({ id: contentRubrics.id })
        .from(contentRubrics)
        .where(eq(contentRubrics.slug, rubricSlug))
        .limit(1)
      if (exists.length === 0) break
      rubricSlug = `${r.slug}_${i + 2}`
    }
    const [created] = await db
      .insert(contentRubrics)
      .values({
        slug: rubricSlug,
        title: r.title,
        description: r.description || "",
        channelId: channel.id,
        isActive: true,
        isBuiltin: false,
        settings: { ...channel.defaultSettings, ...(r.settingsOverride || {}) },
        prompts: r.prompts,
      })
      .returning()
    createdRubrics.push(created)
  }

  revalidatePath("/publications")
  revalidatePath("/publications/rubrics")
  return { channel, rubrics: createdRubrics }
}

export async function getRubricBySlug(slug: string) {
  await requireSession()
  const [rubric] = await db
    .select()
    .from(contentRubrics)
    .where(eq(contentRubrics.slug, slug))
    .limit(1)
  return rubric || null
}

export async function createRubric(input: {
  slug: string
  title: string
  description?: string
  collection?: string | null
  channelId?: string | null
  settings?: Partial<ContentRubricSettings>
  prompts: ContentRubricPrompts
}) {
  const session = await requireSession()
  if (session.user.role !== "admin") {
    throw new Error("Создавать рубрики может только админ")
  }
  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_")
  if (!slug) throw new Error("Slug рубрики обязателен")
  if (!input.title.trim()) throw new Error("Название рубрики обязательно")

  const settings: ContentRubricSettings = {
    ...DEFAULT_RUBRIC_SETTINGS,
    ...(input.settings || {}),
  }

  const [rubric] = await db
    .insert(contentRubrics)
    .values({
      slug,
      title: input.title.trim(),
      description: (input.description || "").trim(),
      collection: (input.collection || "").trim() || null,
      channelId: input.channelId || null,
      isActive: true,
      isBuiltin: false,
      settings,
      prompts: input.prompts,
    })
    .returning()

  revalidatePath("/publications")
  revalidatePath("/publications/rubrics")
  return rubric
}

export async function updateRubric(input: {
  id: string
  title?: string
  description?: string
  collection?: string | null
  channelId?: string | null
  isActive?: boolean
  settings?: ContentRubricSettings
  prompts?: ContentRubricPrompts
}) {
  const session = await requireSession()
  if (session.user.role !== "admin") {
    throw new Error("Редактировать рубрики может только админ")
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.description !== undefined) patch.description = input.description.trim()
  if (input.collection !== undefined) {
    patch.collection = input.collection ? input.collection.trim() || null : null
  }
  if (input.channelId !== undefined) patch.channelId = input.channelId || null
  if (input.isActive !== undefined) patch.isActive = input.isActive
  if (input.settings !== undefined) patch.settings = input.settings
  if (input.prompts !== undefined) patch.prompts = input.prompts

  await db.update(contentRubrics).set(patch).where(eq(contentRubrics.id, input.id))
  revalidatePath("/publications")
  revalidatePath("/publications/rubrics")
}

export async function deleteRubric(rubricId: string) {
  const session = await requireSession()
  if (session.user.role !== "admin") {
    throw new Error("Удалять рубрики может только админ")
  }
  const [rubric] = await db
    .select({ isBuiltin: contentRubrics.isBuiltin })
    .from(contentRubrics)
    .where(eq(contentRubrics.id, rubricId))
    .limit(1)
  if (!rubric) throw new Error("Рубрика не найдена")
  if (rubric.isBuiltin) {
    throw new Error("Системную рубрику нельзя удалить — её можно только отключить")
  }
  await db.delete(contentRubrics).where(eq(contentRubrics.id, rubricId))
  revalidatePath("/publications")
  revalidatePath("/publications/rubrics")
}

export async function listRuns(limit = 50) {
  const session = await requireSession()
  await ensureContentDefaults()
  return db
    .select({
      id: contentRuns.id,
      rubricId: contentRuns.rubricId,
      rubricSlug: contentRuns.rubricSlug,
      status: contentRuns.status,
      stage: contentRuns.stage,
      postText: contentRuns.postText,
      costs: contentRuns.costs,
      errorStage: contentRuns.errorStage,
      errorMessage: contentRuns.errorMessage,
      createdAt: contentRuns.createdAt,
      finishedAt: contentRuns.finishedAt,
    })
    .from(contentRuns)
    .where(eq(contentRuns.userId, session.user.id))
    .orderBy(desc(contentRuns.createdAt))
    .limit(limit)
}

export async function getRun(runId: string) {
  const session = await requireSession()
  const [run] = await db
    .select()
    .from(contentRuns)
    .where(and(eq(contentRuns.id, runId), eq(contentRuns.userId, session.user.id)))
    .limit(1)
  return run || null
}

export async function deleteRun(runId: string) {
  const session = await requireSession()
  await db
    .delete(contentRuns)
    .where(and(eq(contentRuns.id, runId), eq(contentRuns.userId, session.user.id)))
  revalidatePath("/publications")
}

/** Помечает тему как опубликованную — учитывается в topic_guard следующих запусков. */
export async function markRunAsPublished(runId: string) {
  const session = await requireSession()
  const ok = await markRunPublished({ runId, userId: session.user.id })
  if (!ok) throw new Error("Тема для этого запуска не найдена")
  revalidatePath(`/publications/${runId}`)
  revalidatePath("/publications")
}

/** Снимает тему с публикации — пост снова попадёт в зону «может появиться в будущих запусках». */
export async function unmarkRunAsPublished(runId: string) {
  const session = await requireSession()
  const ok = await unmarkRunPublished({ runId, userId: session.user.id })
  if (!ok) throw new Error("Тема для этого запуска не найдена")
  revalidatePath(`/publications/${runId}`)
  revalidatePath("/publications")
}

// ── Topic guard управление ────────────────────────────────────────────────

/**
 * Список тем пользователя для управления topic guard'ом.
 * Возвращает и опубликованные, и просто сгенерированные.
 */
export async function listTopics(opts?: {
  publishedOnly?: boolean
  limit?: number
}) {
  const session = await requireSession()
  const limit = Math.min(Math.max(opts?.limit || 200, 1), 500)
  const conditions = [eq(contentTopics.userId, session.user.id)]
  if (opts?.publishedOnly) {
    conditions.push(eq(contentTopics.published, true))
  }
  return db
    .select({
      id: contentTopics.id,
      topic: contentTopics.topic,
      angle: contentTopics.angle,
      rubricSlug: contentTopics.rubricSlug,
      rubricId: contentTopics.rubricId,
      published: contentTopics.published,
      publishedAt: contentTopics.publishedAt,
      createdAt: contentTopics.createdAt,
      runId: contentTopics.runId,
    })
    .from(contentTopics)
    .where(and(...conditions))
    .orderBy(desc(contentTopics.createdAt))
    .limit(limit)
}

/** Изменить published-флаг конкретной темы (отдельной от run-а). */
export async function setTopicPublished(topicId: string, published: boolean) {
  const session = await requireSession()
  await db
    .update(contentTopics)
    .set({
      published,
      publishedAt: published ? new Date() : null,
    })
    .where(
      and(
        eq(contentTopics.id, topicId),
        eq(contentTopics.userId, session.user.id),
      ),
    )
  revalidatePath("/publications")
  revalidatePath("/publications/topics")
}

/** Полное удаление темы из истории — больше не учитывается topic_guard'ом. */
export async function deleteTopic(topicId: string) {
  const session = await requireSession()
  await db
    .delete(contentTopics)
    .where(
      and(
        eq(contentTopics.id, topicId),
        eq(contentTopics.userId, session.user.id),
      ),
    )
  revalidatePath("/publications")
  revalidatePath("/publications/topics")
}

export async function getSystemPrompts() {
  await requireSession()
  await ensureContentDefaults()
  const rows = await db.select().from(contentSettings)
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    topicSelectionSystem:
      map.get(CONTENT_SETTING_KEYS.topicSelectionSystem) || DEFAULT_TOPIC_SELECTION_SYSTEM_PROMPT,
    webContextCompressionSystem:
      map.get(CONTENT_SETTING_KEYS.webContextCompressionSystem) ||
      DEFAULT_WEB_CONTEXT_COMPRESSION_SYSTEM_PROMPT,
  }
}

export async function updateSystemPrompts(input: {
  topicSelectionSystem?: string
  webContextCompressionSystem?: string
}) {
  const session = await requireSession()
  if (session.user.role !== "admin") {
    throw new Error("Редактировать общие промпты может только админ")
  }
  if (input.topicSelectionSystem !== undefined) {
    const v = input.topicSelectionSystem.trim()
    if (!v) throw new Error("Промпт topic_selection_system не может быть пустым")
    await setSystemPrompt(CONTENT_SETTING_KEYS.topicSelectionSystem, v)
  }
  if (input.webContextCompressionSystem !== undefined) {
    const v = input.webContextCompressionSystem.trim()
    if (!v) throw new Error("Промпт web_context_compression_system не может быть пустым")
    await setSystemPrompt(CONTENT_SETTING_KEYS.webContextCompressionSystem, v)
  }
  revalidatePath("/publications/rubrics")
}
