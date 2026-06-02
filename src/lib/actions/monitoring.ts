"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { getSession } from "@/lib/auth-server"
import {
  monitoringRuns,
  monitoringTemplates,
  type MonitoringClassifier,
  type MonitoringSchedule,
  type MonitoringSource,
  type MonitoringTemplate,
  type MonitoringTopic,
} from "@/lib/db/schema/monitoring"
import { ensureBuiltinTemplates } from "@/lib/monitoring/seed"
import { DEFAULT_CLASSIFIER } from "@/lib/monitoring/classifier"
import { computeNextRunAt } from "@/lib/monitoring/pipeline"

function requireSession() {
  return getSession().then((session) => {
    if (!session?.user) throw new Error("Не авторизован")
    return session
  })
}

function generateSourceId(): string {
  return `src-${Math.random().toString(36).slice(2, 10)}`
}

function generateTopicId(): string {
  return `topic-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeSources(raw: MonitoringSource[]): MonitoringSource[] {
  return raw.map((s) => ({
    id: s.id?.trim() || generateSourceId(),
    type: s.type === "website" ? "website" : "telegram",
    url: s.url.trim(),
    label: s.label?.trim() || undefined,
    feedUrl: s.feedUrl?.trim() || undefined,
    disabled: !!s.disabled,
  }))
}

function normalizeTopics(raw: MonitoringTopic[]): MonitoringTopic[] {
  return raw
    .map((t) => ({
      id: t.id?.trim() || generateTopicId(),
      name: t.name.trim(),
      description: t.description?.trim() || undefined,
    }))
    .filter((t) => t.name.length > 0)
}

function normalizeSchedule(raw: MonitoringSchedule): MonitoringSchedule {
  return {
    enabled: !!raw.enabled,
    intervalHours: Math.max(24, Math.floor(raw.intervalHours) || 24),
    hourUtc: Math.max(0, Math.min(23, Math.floor(raw.hourUtc) || 0)),
  }
}

function normalizeClassifier(raw: MonitoringClassifier | null | undefined): MonitoringClassifier {
  if (!raw) return { ...DEFAULT_CLASSIFIER }
  return {
    model: raw.model?.trim() || DEFAULT_CLASSIFIER.model,
    batchSize: Math.max(1, Math.min(20, Math.floor(raw.batchSize) || DEFAULT_CLASSIFIER.batchSize)),
    keepNonMatches: !!raw.keepNonMatches,
  }
}

export async function listTemplates(): Promise<MonitoringTemplate[]> {
  await requireSession()
  await ensureBuiltinTemplates()
  return db
    .select()
    .from(monitoringTemplates)
    .orderBy(desc(monitoringTemplates.isBuiltin), monitoringTemplates.title)
}

export interface CreateTemplateInput {
  title: string
  description?: string
  mode: "feed" | "topics"
  sources: MonitoringSource[]
  topics: MonitoringTopic[]
  classifier?: MonitoringClassifier | null
  defaultIntervalDays: number
  schedule: MonitoringSchedule
  tgMaxPages?: number
}

export async function createTemplate(input: CreateTemplateInput): Promise<MonitoringTemplate> {
  const session = await requireSession()
  const title = input.title.trim()
  if (!title) throw new Error("Название шаблона обязательно")
  if (!["feed", "topics"].includes(input.mode)) throw new Error("Некорректный режим")
  if (input.mode === "topics" && input.topics.length === 0) {
    throw new Error("В режиме «по темам» нужно указать хотя бы одну тему")
  }

  const schedule = normalizeSchedule(input.schedule)
  const draft = {
    title,
    description: (input.description ?? "").trim(),
    isBuiltin: false,
    isActive: true,
    mode: input.mode,
    sources: normalizeSources(input.sources),
    topics: normalizeTopics(input.topics),
    classifier: normalizeClassifier(input.classifier),
    defaultIntervalDays: Math.max(1, Math.min(30, Math.floor(input.defaultIntervalDays) || 1)),
    tgMaxPages: Math.max(1, Math.min(15, Math.floor(input.tgMaxPages ?? 5))),
    schedule,
    createdBy: session.user.id,
  } satisfies Omit<MonitoringTemplate, "id" | "slug" | "lastRunAt" | "nextRunAt" | "createdAt" | "updatedAt">

  const [template] = await db
    .insert(monitoringTemplates)
    .values({
      ...draft,
      nextRunAt: schedule.enabled ? computeNextRunAt({ ...draft, schedule } as MonitoringTemplate) : null,
    })
    .returning()
  revalidatePath("/monitoring")
  return template
}

export interface UpdateTemplateInput {
  id: string
  title?: string
  description?: string
  isActive?: boolean
  mode?: "feed" | "topics"
  sources?: MonitoringSource[]
  topics?: MonitoringTopic[]
  classifier?: MonitoringClassifier | null
  defaultIntervalDays?: number
  tgMaxPages?: number
  schedule?: MonitoringSchedule
}

export async function updateTemplate(input: UpdateTemplateInput): Promise<MonitoringTemplate> {
  await requireSession()

  const [existing] = await db
    .select()
    .from(monitoringTemplates)
    .where(eq(monitoringTemplates.id, input.id))
    .limit(1)
  if (!existing) throw new Error("Шаблон не найден")

  const patch: Partial<MonitoringTemplate> = { updatedAt: new Date() }
  if (input.title !== undefined) {
    const t = input.title.trim()
    if (!t) throw new Error("Название не может быть пустым")
    patch.title = t
  }
  if (input.description !== undefined) patch.description = input.description.trim()
  if (input.isActive !== undefined) patch.isActive = input.isActive
  if (input.mode !== undefined) {
    if (!["feed", "topics"].includes(input.mode)) throw new Error("Некорректный режим")
    patch.mode = input.mode
  }
  if (input.sources !== undefined) patch.sources = normalizeSources(input.sources)
  if (input.topics !== undefined) patch.topics = normalizeTopics(input.topics)
  if (input.classifier !== undefined) patch.classifier = normalizeClassifier(input.classifier)
  if (input.defaultIntervalDays !== undefined) {
    patch.defaultIntervalDays = Math.max(1, Math.min(30, Math.floor(input.defaultIntervalDays) || 1))
  }
  if (input.tgMaxPages !== undefined) {
    patch.tgMaxPages = Math.max(1, Math.min(15, Math.floor(input.tgMaxPages) || 5))
  }
  if (input.schedule !== undefined) {
    const sched = normalizeSchedule(input.schedule)
    patch.schedule = sched
    const merged: MonitoringTemplate = { ...existing, ...patch, schedule: sched }
    patch.nextRunAt = sched.enabled ? computeNextRunAt(merged) : null
  }
  // Финальная проверка для mode=topics
  const finalMode = patch.mode ?? existing.mode
  const finalTopics = patch.topics ?? existing.topics
  if (finalMode === "topics" && finalTopics.length === 0) {
    throw new Error("В режиме «по темам» нужно указать хотя бы одну тему")
  }

  const [updated] = await db
    .update(monitoringTemplates)
    .set(patch)
    .where(eq(monitoringTemplates.id, input.id))
    .returning()
  revalidatePath("/monitoring")
  return updated
}

export async function deleteTemplate(id: string): Promise<void> {
  const session = await requireSession()
  const [existing] = await db
    .select()
    .from(monitoringTemplates)
    .where(eq(monitoringTemplates.id, id))
    .limit(1)
  if (!existing) throw new Error("Шаблон не найден")
  if (existing.isBuiltin) throw new Error("Встроенный шаблон нельзя удалить — можно отключить")
  if (existing.createdBy !== session.user.id && session.user.role !== "admin") {
    throw new Error("Нет доступа")
  }
  await db.delete(monitoringTemplates).where(eq(monitoringTemplates.id, id))
  revalidatePath("/monitoring")
}

export async function getUnreadMonitoringCount(): Promise<number> {
  const session = await requireSession()
  const rows = await db
    .select({ id: monitoringRuns.id })
    .from(monitoringRuns)
    .where(
      and(
        eq(monitoringRuns.userId, session.user.id),
        eq(monitoringRuns.status, "done"),
        isNull(monitoringRuns.viewedAt),
      ),
    )
  // Бейдж показываем только если в запуске есть что-то полезное
  // (items_matched > 0 для topics или items_found > 0 для feed).
  // Подсчёт по ids дешевле, чем join — просто берём raw.
  if (rows.length === 0) return 0
  const detailed = await db
    .select({
      id: monitoringRuns.id,
      itemsFound: monitoringRuns.itemsFound,
      itemsMatched: monitoringRuns.itemsMatched,
      mode: monitoringRuns.mode,
    })
    .from(monitoringRuns)
    .where(
      and(
        eq(monitoringRuns.userId, session.user.id),
        eq(monitoringRuns.status, "done"),
        isNull(monitoringRuns.viewedAt),
      ),
    )
  let count = 0
  for (const r of detailed) {
    const useful = r.mode === "topics" ? r.itemsMatched > 0 : r.itemsFound > 0
    if (useful) count++
  }
  return count
}

export async function markRunViewed(runId: string): Promise<void> {
  const session = await requireSession()
  await db
    .update(monitoringRuns)
    .set({ viewedAt: new Date() })
    .where(and(eq(monitoringRuns.id, runId), eq(monitoringRuns.userId, session.user.id)))
  revalidatePath("/monitoring")
}

/**
 * Пометить ВСЕ непросмотренные запуски просмотренными — вызывается при открытии
 * раздела «Мониторинг», чтобы сбросить счётчик-бейдж в сайдбаре.
 */
export async function markAllMonitoringViewed(): Promise<void> {
  const session = await requireSession()
  await db
    .update(monitoringRuns)
    .set({ viewedAt: new Date() })
    .where(and(eq(monitoringRuns.userId, session.user.id), isNull(monitoringRuns.viewedAt)))
  revalidatePath("/monitoring")
}
