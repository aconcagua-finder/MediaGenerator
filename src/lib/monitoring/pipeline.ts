/**
 * Оркестратор запуска мониторинга. Стадии:
 *  1. fetching — параллельно тянем все источники, бьём в RawPost[]
 *  2. classifying — если mode=topics: гоним посты через OpenRouter
 *  3. сохраняем items в БД, обновляем счётчики runs
 *
 * Запускается асинхронно из API-эндпоинта (без ожидания клиентом).
 * Каждое падение источника логируется в `artifacts.sourceLog`, но не
 * валит весь запуск — другие источники продолжают работать.
 */

import { db } from "@/lib/db"
import {
  monitoringItems,
  monitoringRuns,
  monitoringTemplates,
  type MonitoringRunArtifacts,
  type MonitoringSource,
  type MonitoringTemplate,
} from "@/lib/db/schema/monitoring"
import { and, desc, eq, gte, lte, sql } from "drizzle-orm"
import { fetchTelegramChannel } from "./sources/telegram"
import { fetchWebsiteFeed } from "./sources/website"
import type { RawPost } from "./sources/types"
import {
  DEFAULT_CLASSIFIER,
  classifyPosts,
  type ClassifierInput,
} from "./classifier"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { user as userTable } from "@/lib/db/schema/auth"

const EXCERPT_LENGTH = 240
/**
 * Сколько websites fetch'им параллельно. RSS-ленты разных доменов не мешают
 * друг другу, 5 — комфортный лимит.
 */
const WEBSITE_CONCURRENCY = 5
/**
 * Сколько Telegram-каналов fetch'им параллельно. Все идут на один домен t.me,
 * поэтому agressive concurrency приводит к TLS-стэмпиду и серии «fetch failed».
 * 2 — компромисс между скоростью и устойчивостью.
 */
const TELEGRAM_CONCURRENCY = 2
/**
 * За какое время мы готовы переиспользовать items из предыдущего прогона
 * вместо повторного fetch источников. 6 часов — для типичного use case
 * «feed-прогон, потом topics-прогон» хватает с запасом.
 */
const REUSE_WINDOW_HOURS = 6

function buildExcerpt(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim()
  if (normalized.length <= EXCERPT_LENGTH) return normalized
  return `${normalized.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`
}

/**
 * Численный показатель «горячести» поста. Простой weighted-sum: просмотры
 * базово учитываются с весом 1, реакции/репосты — с весом 15-20 (один отклик
 * стоит как 15-20 пассивных просмотров), комментарии — 30 (требует
 * максимального вовлечения, поэтому сильный сигнал).
 *
 * Подобрано «на глаз», чтобы у небольшого канала пост с 50 реакциями всё
 * равно обгонял у крупного канала пост с 5000 просмотров и нулём реакций.
 */
export function computeEngagementScore(engagement?: {
  views?: number
  reactionsTotal?: number
  comments?: number
  forwards?: number
}): number {
  if (!engagement) return 0
  const views = engagement.views ?? 0
  const reactions = engagement.reactionsTotal ?? 0
  const comments = engagement.comments ?? 0
  const forwards = engagement.forwards ?? 0
  return views + reactions * 15 + forwards * 20 + comments * 30
}

/**
 * Простой семафор: запускает не более `limit` задач параллельно.
 * Возвращает массив результатов в том же порядке, что и входные задачи.
 */
async function runWithConcurrency<T>(
  items: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(items.length)
  let cursor = 0
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      results[idx] = await items[idx]()
    }
  })
  await Promise.all(workers)
  return results
}

interface FetchedSource {
  source: MonitoringSource
  posts: RawPost[]
  status: "ok" | "empty" | "error"
  errorMessage?: string
  feedUrl?: string
  durationMs: number
  /** Авто-определённое название источника (если удалось вытащить). */
  detectedTitle?: string
}

async function fetchOneSource(
  source: MonitoringSource,
  since: Date,
  until: Date,
  tgMaxPages: number,
): Promise<FetchedSource> {
  const start = Date.now()
  try {
    if (source.type === "telegram") {
      const result = await fetchTelegramChannel({
        handle: source.url,
        since,
        until,
        maxPages: tgMaxPages,
      })
      return {
        source,
        posts: result.posts,
        status: result.posts.length > 0 ? "ok" : "empty",
        durationMs: Date.now() - start,
        detectedTitle: result.channelTitle,
      }
    }
    if (source.type === "website") {
      const result = await fetchWebsiteFeed({
        url: source.url,
        feedUrl: source.feedUrl,
        since,
        until,
      })
      return {
        source,
        posts: result.posts,
        status: result.posts.length > 0 ? "ok" : "empty",
        feedUrl: result.feedUrl,
        durationMs: Date.now() - start,
      }
    }
    return {
      source,
      posts: [],
      status: "error",
      errorMessage: `Неизвестный тип источника: ${(source as { type: string }).type}`,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      source,
      posts: [],
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    }
  }
}

interface RunPipelineInput {
  runId: string
  template: MonitoringTemplate
  userId: string
  periodFrom: Date
  periodTo: Date
  /**
   * Источник запуска. Для `manual` мы НЕ двигаем `next_run_at` шаблона —
   * иначе нажатие «Запустить сейчас» сбивает расписание и может пропустить
   * следующий автоматический слот.
   */
  trigger?: "manual" | "scheduled"
}

/**
 * Ищет успешный run этого же шаблона <= REUSE_WINDOW_HOURS назад, который
 * покрывает нужный нам период. «Покрывает» = period_from ≤ нашего periodFrom
 * и period_to ≥ нашего periodTo - 1ч (час допуска на запаздывание).
 *
 * Используется только для topics-режима: feed-прогоны всегда тянут свежее.
 */
async function findReusableRun(
  templateId: string,
  periodFrom: Date,
  periodTo: Date,
  excludeRunId: string,
) {
  const cutoff = new Date(Date.now() - REUSE_WINDOW_HOURS * 3_600_000)
  const tolerance = new Date(periodTo.getTime() - 3_600_000)
  const rows = await db
    .select({
      id: monitoringRuns.id,
      periodFrom: monitoringRuns.periodFrom,
      periodTo: monitoringRuns.periodTo,
      sourcesTotal: monitoringRuns.sourcesTotal,
      sourcesSucceeded: monitoringRuns.sourcesSucceeded,
      sourcesFailed: monitoringRuns.sourcesFailed,
      itemsFound: monitoringRuns.itemsFound,
      artifacts: monitoringRuns.artifacts,
    })
    .from(monitoringRuns)
    .where(
      and(
        eq(monitoringRuns.templateId, templateId),
        eq(monitoringRuns.status, "done"),
        gte(monitoringRuns.finishedAt, cutoff),
        lte(monitoringRuns.periodFrom, periodFrom),
        gte(monitoringRuns.periodTo, tolerance),
      ),
    )
    .orderBy(desc(monitoringRuns.finishedAt))
    .limit(1)
  const candidate = rows[0]
  if (!candidate) return null
  if (candidate.id === excludeRunId) return null
  return candidate
}

/**
 * После fetch обновляет `template.sources[i].label`, если для TG-источника
 * детектировано настоящее название канала, а в шаблоне стоит дефолт-плейсхолдер
 * («Закрытый канал», голый handle или пустота). Идемпотентна — если label
 * пользователь переименовал вручную, не трогаем.
 */
async function updateAutoDetectedLabels(
  template: MonitoringTemplate,
  fetched: FetchedSource[],
): Promise<void> {
  const updates = new Map<string, string>()
  for (const f of fetched) {
    if (f.source.type !== "telegram") continue
    const detected = f.detectedTitle?.trim()
    if (!detected) continue
    const current = (f.source.label ?? "").trim()
    const looksDefault =
      !current ||
      current === "Закрытый канал" ||
      current.toLowerCase() === f.source.url.toLowerCase()
    if (looksDefault) {
      updates.set(f.source.id, detected)
    }
  }
  if (updates.size === 0) return

  const newSources = template.sources.map((s) =>
    updates.has(s.id) ? { ...s, label: updates.get(s.id)! } : s,
  )
  await db
    .update(monitoringTemplates)
    .set({ sources: newSources, updatedAt: new Date() })
    .where(eq(monitoringTemplates.id, template.id))
}

/**
 * Загружает items предыдущего run и формирует из них список «как будто только
 * что нафетчили». Это позволяет переиспользовать собранные посты для новой
 * классификации без повторного похода в источники.
 */
async function loadFetchedFromRun(
  sourceRunId: string,
  templateSources: MonitoringSource[],
  periodFrom: Date,
  periodTo: Date,
): Promise<FetchedSource[]> {
  const rows = await db
    .select()
    .from(monitoringItems)
    .where(eq(monitoringItems.runId, sourceRunId))
  // Группируем по sourceId, фильтруем по периоду (cached run мог покрывать больше)
  const bySource = new Map<string, RawPost[]>()
  for (const row of rows) {
    const ts = row.publishedAt
    if (ts && (ts < periodFrom || ts > periodTo)) continue
    const existing = bySource.get(row.sourceId) ?? []
    existing.push({
      sourcePostId: row.sourcePostId ?? row.postUrl,
      postUrl: row.postUrl,
      publishedAt: row.publishedAt ?? undefined,
      title: row.title ?? undefined,
      content: row.content,
      images: row.images,
      engagement: row.engagement && Object.keys(row.engagement).length > 0 ? row.engagement : undefined,
    })
    bySource.set(row.sourceId, existing)
  }
  const result: FetchedSource[] = []
  for (const source of templateSources) {
    const posts = bySource.get(source.id) ?? []
    result.push({
      source,
      posts,
      status: posts.length > 0 ? "ok" : "empty",
      durationMs: 0,
    })
  }
  return result
}

export async function runMonitoringPipeline(input: RunPipelineInput): Promise<void> {
  const { runId, template, periodFrom, periodTo, userId } = input
  const sources = template.sources.filter((s) => !s.disabled)

  // === Стадия 1: fetching (или reuse из недавнего прогона) ===
  await db
    .update(monitoringRuns)
    .set({ status: "fetching", sourcesTotal: sources.length })
    .where(eq(monitoringRuns.id, runId))

  // Если topics-режим и есть свежий done-run этого же шаблона — переиспользуем
  // его items. Так topics-прогоны через 5 минут после feed-прогона не дёргают
  // источники второй раз.
  let fetched: FetchedSource[] = []
  let reusedFromRunId: string | null = null
  if (template.mode === "topics") {
    const reusable = await findReusableRun(template.id, periodFrom, periodTo, runId)
    if (reusable) {
      fetched = await loadFetchedFromRun(reusable.id, sources, periodFrom, periodTo)
      reusedFromRunId = reusable.id
    }
  }

  if (fetched.length === 0) {
    // Разводим TG и сайты по разным «дорожкам»: один домен t.me не любит
    // параллельных подключений, разные сайты — без проблем.
    const tgSources = sources.filter((s) => s.type === "telegram")
    const webSources = sources.filter((s) => s.type === "website")
    const tgMaxPages = template.tgMaxPages ?? 5
    const [tgFetched, webFetched] = await Promise.all([
      runWithConcurrency(
        tgSources.map((s) => () => fetchOneSource(s, periodFrom, periodTo, tgMaxPages)),
        TELEGRAM_CONCURRENCY,
      ),
      runWithConcurrency(
        webSources.map((s) => () => fetchOneSource(s, periodFrom, periodTo, tgMaxPages)),
        WEBSITE_CONCURRENCY,
      ),
    ])
    // Возвращаем в исходном порядке источников (для красивого журнала)
    let tgIdx = 0
    let webIdx = 0
    for (const s of sources) {
      if (s.type === "telegram") fetched.push(tgFetched[tgIdx++])
      else fetched.push(webFetched[webIdx++])
    }
  }

  // Авто-подтягивание имён каналов. Если у TG-источника детектировано имя
  // и текущий label либо пуст, либо это дефолт «Закрытый канал» / совпадает
  // с handle — обновляем шаблон. Пользовательские лейблы трогать не будем
  // (если он явно переименовал — не перезапишем).
  await updateAutoDetectedLabels(template, fetched)

  const sourceLog: NonNullable<MonitoringRunArtifacts["sourceLog"]> = fetched.map((f) => ({
    sourceId: f.source.id,
    type: f.source.type,
    url: f.source.url,
    label: f.source.label,
    status: f.status,
    itemsCount: f.posts.length,
    feedUrl: f.feedUrl,
    errorMessage: f.errorMessage,
    durationMs: f.durationMs,
  }))

  const succeeded = fetched.filter((f) => f.status !== "error").length
  const failed = fetched.length - succeeded
  const allPosts: Array<{ source: MonitoringSource; post: RawPost }> = []
  for (const f of fetched) {
    for (const post of f.posts) {
      allPosts.push({ source: f.source, post })
    }
  }

  // Дедуп по (sourceId + sourcePostId)
  const seen = new Set<string>()
  const unique: Array<{ source: MonitoringSource; post: RawPost }> = []
  for (const entry of allPosts) {
    const key = `${entry.source.id}::${entry.post.sourcePostId}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(entry)
  }

  // === Стадия 2: classifying (если mode=topics) ===
  let totalCost = 0
  let itemsMatched = 0
  const artifacts: MonitoringRunArtifacts = { sourceLog }
  if (reusedFromRunId) artifacts.reusedFromRunId = reusedFromRunId

  let classifierInputs: ClassifierInput[] = []
  if (template.mode === "topics" && template.topics.length > 0 && unique.length > 0) {
    await db
      .update(monitoringRuns)
      .set({ status: "classifying", itemsFound: unique.length })
      .where(eq(monitoringRuns.id, runId))

    classifierInputs = unique.map((u) => ({
      text: u.post.content,
      postUrl: u.post.postUrl,
      sourceLabel: u.source.label ?? u.source.url,
    }))

    const apiKey = await getDecryptedApiKey(userId, "openrouter")
    if (!apiKey) {
      const errMsg = "Для режима тем нужен API-ключ OpenRouter. Добавьте его в настройках."
      await db
        .update(monitoringRuns)
        .set({
          status: "error",
          errorMessage: errMsg,
          itemsFound: unique.length,
          sourcesSucceeded: succeeded,
          sourcesFailed: failed,
          artifacts,
          finishedAt: new Date(),
        })
        .where(eq(monitoringRuns.id, runId))
      return
    }

    const classifierSettings = template.classifier ?? DEFAULT_CLASSIFIER
    const result = await classifyPosts({
      apiKey,
      topics: template.topics,
      classifier: classifierSettings,
      posts: classifierInputs,
      // Инкрементальный прогресс: пишем classifierLog после каждого батча
      // (с актуальным batchesProcessed/avgBatchMs/costSoFar), чтобы UI мог
      // показать «Обработано X из Y · ~M мин осталось».
      onProgress: async (info) => {
        const progressArtifacts: MonitoringRunArtifacts = {
          ...artifacts,
          classifierLog: {
            model: classifierSettings.model,
            batches: info.batchesProcessed,
            inputTokens: 0, // финальные значения проставим в конце
            outputTokens: 0,
            cost: info.costSoFar,
            batchesProcessed: info.batchesProcessed,
            batchesTotal: info.batchesTotal,
            avgBatchMs: info.avgBatchMs,
          },
        }
        await db
          .update(monitoringRuns)
          .set({
            artifacts: progressArtifacts,
            cost: info.costSoFar.toFixed(6),
          })
          .where(eq(monitoringRuns.id, runId))
      },
    })

    totalCost = result.cost
    artifacts.classifierLog = {
      model: classifierSettings.model,
      batches: result.batches,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cost: result.cost,
      batchesProcessed: result.batches,
      batchesTotal: result.batches,
    }

    const keepNonMatches = classifierSettings.keepNonMatches
    const filteredEntries: Array<{
      source: MonitoringSource
      post: RawPost
      matchType: "close" | "indirect" | "none"
      topicId?: string
      topicName?: string
      reason: string
    }> = []
    for (let i = 0; i < unique.length; i++) {
      const verdict = result.verdicts[i]
      if (verdict.matchType !== "none") itemsMatched++
      if (verdict.matchType === "none" && !keepNonMatches) continue
      filteredEntries.push({
        source: unique[i].source,
        post: unique[i].post,
        matchType: verdict.matchType,
        topicId: verdict.topicId,
        topicName: verdict.topicName,
        reason: verdict.reason,
      })
    }

    if (filteredEntries.length > 0) {
      await db.insert(monitoringItems).values(
        filteredEntries.map((e) => ({
          runId,
          sourceId: e.source.id,
          sourceType: e.source.type,
          sourceUrl: e.source.url,
          sourceLabel: e.source.label,
          postUrl: e.post.postUrl,
          sourcePostId: e.post.sourcePostId,
          publishedAt: e.post.publishedAt,
          title: e.post.title,
          content: e.post.content,
          excerpt: buildExcerpt(e.post.content),
          images: e.post.images,
          engagement: e.post.engagement ?? {},
          engagementScore: computeEngagementScore(e.post.engagement),
          matchType: e.matchType,
          matchTopicId: e.topicId,
          matchTopicName: e.topicName,
          matchReason: e.reason,
        })),
      )
    }
  } else if (unique.length > 0) {
    // feed-режим: пишем всё как есть
    await db.insert(monitoringItems).values(
      unique.map((e) => ({
        runId,
        sourceId: e.source.id,
        sourceType: e.source.type,
        sourceUrl: e.source.url,
        sourceLabel: e.source.label,
        postUrl: e.post.postUrl,
        sourcePostId: e.post.sourcePostId,
        publishedAt: e.post.publishedAt,
        title: e.post.title,
        content: e.post.content,
        excerpt: buildExcerpt(e.post.content),
        images: e.post.images,
        engagement: e.post.engagement ?? {},
        engagementScore: computeEngagementScore(e.post.engagement),
      })),
    )
  }

  // === Финал ===
  await db
    .update(monitoringRuns)
    .set({
      status: "done",
      itemsFound: unique.length,
      itemsMatched,
      sourcesSucceeded: succeeded,
      sourcesFailed: failed,
      cost: totalCost.toFixed(6),
      artifacts,
      finishedAt: new Date(),
    })
    .where(eq(monitoringRuns.id, runId))

  // Учёт расхода в user.totalSpent (только если был AI-вызов)
  if (totalCost > 0) {
    await db
      .update(userTable)
      .set({ totalSpent: sql`COALESCE(${userTable.totalSpent}, 0) + ${totalCost}` })
      .where(eq(userTable.id, userId))
  }

  // === Обновляем lastRunAt и (только для scheduled) nextRunAt ===
  // Manual-запуск не трогает next_run_at: иначе нажатие «Запустить сейчас»
  // в середине дня сбивает следующий автоматический слот (пропускает день,
  // если interval > now - lastScheduledHour).
  const patch: { lastRunAt: Date; updatedAt: Date; nextRunAt?: Date | null } = {
    lastRunAt: new Date(),
    updatedAt: new Date(),
  }
  if (input.trigger === "scheduled") {
    patch.nextRunAt = computeNextRunAt(template)
  }
  await db
    .update(monitoringTemplates)
    .set(patch)
    .where(eq(monitoringTemplates.id, template.id))
}

/**
 * Считает следующее время авто-запуска. Если расписание выключено — null.
 *
 * Семантика: «каждые N дней в `hourUtc` часов UTC».
 *  - `intervalHours = 24` → каждый день в `hourUtc`.
 *  - `intervalHours = 48` → каждые два дня в `hourUtc`.
 *
 * Алгоритм: «следующий момент времени с часом `hourUtc`, который наступает
 * строго после `baseTime`», с шагом `ceil(intervalHours/24)` дней.
 *
 * Почему так, а не «now + interval, потом snap»: если scheduled-запуск опоздал
 * (например cron был выключен и стартанул в 08:47 вместо 06:00), старый алгоритм
 * брал `earliest = 08:47 + 24h = завтра 08:47`, потом snap к 06:00 уходил
 * в `послезавтра 06:00` — то есть один день расписания терялся. Новый алгоритм
 * вернёт `завтра 06:00`, как и ожидает пользователь, который видит «раз в день
 * в 06:00 UTC».
 *
 * `baseTime` — момент, от которого считаем (по умолчанию now). Параметр нужен
 * для детерминированных юнит-тестов.
 */
export function computeNextRunAt(
  template: MonitoringTemplate,
  baseTime: Date = new Date(),
): Date | null {
  const sched = template.schedule
  if (!sched.enabled) return null

  const interval = Math.max(24, sched.intervalHours)
  const hour = Math.max(0, Math.min(23, sched.hourUtc))
  // Шаг в днях: 24h → 1, 48h → 2, 72h → 3. Округление вверх — на случай
  // нестандартных значений вроде 36h, чтобы расписание двигалось ВПЕРЁД и
  // никогда не получалось «следующий запуск через ноль дней».
  const stepDays = Math.max(1, Math.ceil(interval / 24))

  // Кандидат: «сегодня (по UTC) в hour:00». Дальше двигаем вперёд шагами
  // stepDays, пока не окажемся строго после baseTime.
  const candidate = new Date(baseTime)
  candidate.setUTCHours(hour, 0, 0, 0)
  while (candidate.getTime() <= baseTime.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + stepDays)
  }
  return candidate
}

export function safeRunPipeline(input: RunPipelineInput): void {
  // Запускаем без await — пусть выполняется в фоне.
  // Все ошибки логируем в БД через try/catch на самом верхнем уровне.
  void runMonitoringPipeline(input).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err)
    try {
      await db
        .update(monitoringRuns)
        .set({
          status: "error",
          errorMessage: message,
          finishedAt: new Date(),
        })
        .where(eq(monitoringRuns.id, input.runId))
    } catch {
      // больше ничего сделать не можем
    }
  })
}
