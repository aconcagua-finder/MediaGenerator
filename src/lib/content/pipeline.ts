import { db } from "@/lib/db"
import { and, desc, eq, gte, sql } from "drizzle-orm"
import {
  contentChannels,
  contentRubrics,
  contentRuns,
  contentTopics,
  user,
  type ContentRubric,
  type ContentRubricSettings,
  type ContentRunArtifacts,
  type ContentRunCosts,
  type ContentRunStatus,
} from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import {
  CONTENT_SETTING_KEYS,
  DEFAULT_TOPIC_SELECTION_SYSTEM_PROMPT,
  DEFAULT_WEB_CONTEXT_COMPRESSION_SYSTEM_PROMPT,
  UNIVERSAL_POST_WRITER_PROMPT,
  renderUniversalWriterPrompt,
} from "./default-rubrics"
import { getSystemPrompt } from "./seed"
import {
  buildTopicInstruction,
  buildTopicSimilarityWarning,
  compressWebContext,
  expressGeneratePost,
  generatePost,
  prependTopicToPost,
  selectTopic,
} from "./post-writer"
import { searchPerplexity } from "./perplexity-search"
import { searchRedditViaOpenAI } from "./reddit-search"
import { normalizeTopic } from "./utils"

export interface StartRunInput {
  userId: string
  /** Если задан — берём настройки рубрики. */
  rubricId?: string
  /** Если задан вместо rubricId — создаём ad-hoc run по дефолтам канала («Свободный пост»). */
  channelId?: string
  /** Override режима pipeline на этот конкретный запуск. */
  pipelineModeOverride?: "full" | "express"
}

const FREE_POST_PERPLEXITY_TEMPLATE = `Найди самые свежие и качественные материалы по теме за период с {start_date} по {end_date}.

Тема задана пользователем отдельно (см. "User's specific focus" ниже) — это основной фокус, ему подчинено всё остальное.

Для каждой находки укажи:
- точные имена, числа, даты, цитаты с атрибуцией;
- суть события или вопроса;
- практическое значение для аудитории канала;
- ссылку на источник.

Игнорируй спекулятивные статьи без конкретики, маркетинговые тексты без фактуры.`

/** Создаёт запись в content_runs до начала пайплайна, чтобы UI мог сразу её показать. */
export async function createPendingRun(input: StartRunInput) {
  let rubric: ContentRubric | null = null
  let virtualMode: "rubric" | "free_post" = "rubric"

  if (input.rubricId) {
    const [r] = await db
      .select()
      .from(contentRubrics)
      .where(eq(contentRubrics.id, input.rubricId))
      .limit(1)
    if (!r) throw new Error("Рубрика не найдена")
    rubric = r as ContentRubric
  } else if (input.channelId) {
    virtualMode = "free_post"
    const [channel] = await db
      .select()
      .from(contentChannels)
      .where(eq(contentChannels.id, input.channelId))
      .limit(1)
    if (!channel) throw new Error("Канал не найден")
    // Создаём виртуальную рубрику в памяти — она не сохраняется в БД.
    // Pipeline использует её settings и prompts как обычную рубрику.
    // id оставляем пустой строкой (виртуальный) — все INSERT в content_topics
    // используют только channelId; rubricId для free-post всегда null.
    rubric = {
      id: "",
      slug: `${channel.slug}__free_post`,
      title: "Свободный пост",
      description: channel.description,
      channelId: channel.id,
      collection: channel.title,
      isActive: true,
      isBuiltin: false,
      settings: channel.defaultSettings,
      prompts: {
        perplexitySearchPrompt: FREE_POST_PERPLEXITY_TEMPLATE,
        redditSearchPrompt: "",
        // Voice profile канала идёт как доп-инструкция в writer-prompt
        postWriterSystemPrompt: channel.voiceProfile
          ? `## Voice profile канала\n${channel.voiceProfile}\n\n(Дальше — стандартный универсальный SMM-гайд.)`
          : "",
      },
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    } as ContentRubric
  } else {
    throw new Error("Нужен rubricId или channelId")
  }

  const effectiveSettings = input.pipelineModeOverride
    ? { ...rubric.settings, pipelineMode: input.pipelineModeOverride }
    : rubric.settings

  // Для виртуального free_post rubric_id остаётся null, привязка идёт через channelId.
  const [run] = await db
    .insert(contentRuns)
    .values({
      userId: input.userId,
      rubricId: virtualMode === "free_post" ? null : rubric.id,
      channelId: rubric.channelId,
      rubricSlug: rubric.slug,
      status: "pending",
      stage: "pending",
      settings: effectiveSettings,
      artifacts: {},
      costs: {},
    })
    .returning()

  return {
    run,
    rubric: { ...rubric, settings: effectiveSettings } as ContentRubric,
  }
}

async function updateStage(
  runId: string,
  stage: ContentRunStatus,
  status: ContentRunStatus = stage,
): Promise<void> {
  await db
    .update(contentRuns)
    .set({ status, stage })
    .where(eq(contentRuns.id, runId))
}

async function patchArtifacts(
  runId: string,
  patch: Partial<ContentRunArtifacts>,
): Promise<void> {
  await db
    .update(contentRuns)
    .set({
      // jsonb || jsonb сольёт верхний уровень, чего нам и нужно
      artifacts: sql`${contentRuns.artifacts} || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(eq(contentRuns.id, runId))
}

async function patchCosts(runId: string, patch: Partial<ContentRunCosts>): Promise<void> {
  await db
    .update(contentRuns)
    .set({
      costs: sql`${contentRuns.costs} || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(eq(contentRuns.id, runId))
}

async function failRun(args: {
  runId: string
  stage: ContentRunStatus
  message: string
}): Promise<void> {
  await db
    .update(contentRuns)
    .set({
      status: "error",
      stage: args.stage,
      errorStage: args.stage,
      errorMessage: args.message,
      finishedAt: new Date(),
    })
    .where(eq(contentRuns.id, args.runId))
}

async function loadForbiddenTopics(args: {
  userId: string
  rubricId: string
  settings: ContentRubricSettings
}): Promise<string[]> {
  if (!args.settings.topicGuardEnabled) return []
  const lookbackMs = Math.max(1, args.settings.topicGuardLookbackDays) * 24 * 60 * 60 * 1000
  const cutoff = new Date(Date.now() - lookbackMs)
  const rows = await db
    .select({ topic: contentTopics.topic, normalized: contentTopics.normalizedTopic })
    .from(contentTopics)
    .where(
      and(
        eq(contentTopics.userId, args.userId),
        eq(contentTopics.published, true),
        gte(contentTopics.publishedAt, cutoff),
      ),
    )
    .orderBy(desc(contentTopics.publishedAt))
    .limit(Math.max(1, args.settings.topicGuardMaxTopics))

  const seen = new Set<string>()
  const result: string[] = []
  for (const row of rows) {
    if (!row.topic) continue
    const norm = row.normalized || normalizeTopic(row.topic)
    if (norm && seen.has(norm)) continue
    if (norm) seen.add(norm)
    result.push(row.topic)
  }
  return result
}

async function bumpUserSpent(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return
  await db
    .update(user)
    .set({
      totalSpent: sql`${user.totalSpent}::numeric + ${amount.toFixed(6)}::numeric`,
    })
    .where(eq(user.id, userId))
}

interface RunPipelineArgs {
  runId: string
  userId: string
  rubric: ContentRubric
  topicHint?: string
}

/**
 * Публичный entry-point: оборачивает _runPipelineInner в глобальный
 * try/catch. Любая неожиданная ошибка превращается в status='error' с
 * понятным сообщением — иначе run завис бы в активном статусе до тех пор,
 * пока stale-детектор не пометит его «таймаутом».
 */
export async function runPipeline(args: RunPipelineArgs): Promise<void> {
  try {
    await _runPipelineInner(args)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[content pipeline ${args.runId}] unhandled:`, err)
    // Пытаемся обновить status в БД — если БД тоже отвалилась, ничего не поделаешь.
    try {
      await db
        .update(contentRuns)
        .set({
          status: "error",
          errorMessage: `Внутренняя ошибка: ${msg}`,
          finishedAt: new Date(),
        })
        .where(eq(contentRuns.id, args.runId))
    } catch {
      // молча
    }
  }
}

async function _runPipelineInner(args: RunPipelineArgs): Promise<void> {
  const { runId, userId, rubric, topicHint } = args
  const settings = rubric.settings

  const openRouterKey = await getDecryptedApiKey(userId, "openrouter")
  if (!openRouterKey) {
    await failRun({
      runId,
      stage: "pending",
      message:
        "Не найден ключ OpenRouter. Добавьте его в Настройках — без него pipeline не работает.",
    })
    return
  }

  const perplexityKey = await getDecryptedApiKey(userId, "perplexity")
  if (!perplexityKey) {
    await failRun({
      runId,
      stage: "perplexity",
      message:
        "Не найден ключ Perplexity. Добавьте его в Настройках — он нужен для шага Deep Research.",
    })
    return
  }

  let openAIKey: string | null = null
  if (settings.redditEnabled) {
    openAIKey = await getDecryptedApiKey(userId, "openai")
    if (!openAIKey) {
      await failRun({
        runId,
        stage: "reddit",
        message:
          "Reddit-поиск включён в рубрике, но нет ключа OpenAI. Добавьте его в Настройках или отключите Reddit-поиск в рубрике.",
      })
      return
    }
  }

  // ── Stage 1: Perplexity ────────────────────────────────────────────────
  await updateStage(runId, "perplexity")
  let perplexityResult: Awaited<ReturnType<typeof searchPerplexity>>
  try {
    perplexityResult = await searchPerplexity({
      apiKey: perplexityKey,
      promptTemplate: rubric.prompts.perplexitySearchPrompt,
      settings,
      topicHint,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await failRun({ runId, stage: "perplexity", message: msg })
    return
  }
  await patchArtifacts(runId, {
    perplexityPrompt: perplexityResult.prompt,
    perplexityReport: perplexityResult.reportText,
    perplexitySources: perplexityResult.sources,
  })
  await patchCosts(runId, { perplexity: perplexityResult.cost })
  await bumpUserSpent(userId, perplexityResult.cost)

  // ── Stage 2: Reddit (опционально) ──────────────────────────────────────
  let redditContext = ""
  let redditCost = 0
  if (settings.redditEnabled && openAIKey) {
    await updateStage(runId, "reddit")
    try {
      const reddit = await searchRedditViaOpenAI({
        apiKey: openAIKey,
        promptTemplate: rubric.prompts.redditSearchPrompt,
        settings,
      })
      redditContext = reddit.reportText
      redditCost = reddit.cost
      await patchArtifacts(runId, {
        redditPrompt: reddit.prompt,
        redditContext,
      })
      await patchCosts(runId, { reddit: reddit.cost })
      await bumpUserSpent(userId, reddit.cost)
    } catch (err) {
      // Не валим пайплайн целиком — Reddit не критичен. Логируем в artifacts.
      const msg = err instanceof Error ? err.message : String(err)
      await patchArtifacts(runId, {
        redditContext: `[reddit step failed: ${msg}]`,
      })
    }
  }

  const forbiddenTopics = await loadForbiddenTopics({
    userId,
    rubricId: rubric.id,
    settings,
  })

  // Какой writer-промпт — из рубрики или универсальный
  const writerTemplate = await getSystemPrompt(
    CONTENT_SETTING_KEYS.universalPostWriterSystem,
    UNIVERSAL_POST_WRITER_PROMPT,
  )
  const writerSystemPrompt = (rubric.prompts.postWriterSystemPrompt || "").trim()
    ? rubric.prompts.postWriterSystemPrompt
    : renderUniversalWriterPrompt({
        template: writerTemplate,
        audience: settings.audience,
        postFormat: settings.postFormat,
      })

  // Контейнеры для финальной записи в БД — заполняются в зависимости от режима
  let finalTopic: import("@/lib/db/schema").ContentRunTopicData | null = null
  let finalPostText = ""
  let stageCosts = 0

  if (settings.pipelineMode === "express") {
    // ── EXPRESS: одна модель за один вызов делает тему + сжатие + пост ─
    await updateStage(runId, "writing")
    let express
    try {
      express = await expressGeneratePost({
        apiKey: openRouterKey,
        systemPrompt: writerSystemPrompt,
        rubric,
        settings,
        webContext: perplexityResult.reportText,
        redditContext,
        forbiddenTopics,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await failRun({ runId, stage: "writing", message: msg })
      return
    }
    await patchArtifacts(runId, {
      forbiddenTopics,
      topicData: express.topic || undefined,
      writerPrompt: express.writerPrompt,
      topicSimilarityWarning: express.similarityWarning,
    })
    await patchCosts(runId, { writer: express.usage.cost })
    await bumpUserSpent(userId, express.usage.cost)
    stageCosts = express.usage.cost

    if (!express.topic || !express.post.trim()) {
      await failRun({
        runId,
        stage: "writing",
        message: !express.post.trim()
          ? "Модель не вернула пост. В контексте, видимо, не нашлось темы."
          : "Модель не выбрала тему.",
      })
      return
    }
    finalTopic = express.topic
    finalPostText = express.post
  } else {
    // ── FULL: классическая цепочка из 3 шагов после Perplexity ─────────
    await updateStage(runId, "topic")
    const topicSystem = await getSystemPrompt(
      CONTENT_SETTING_KEYS.topicSelectionSystem,
      DEFAULT_TOPIC_SELECTION_SYSTEM_PROMPT,
    )
    let selected
    try {
      selected = await selectTopic({
        apiKey: openRouterKey,
        systemPrompt: topicSystem,
        rubric,
        settings,
        webContext: perplexityResult.reportText,
        redditContext,
        forbiddenTopics,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await failRun({ runId, stage: "topic", message: msg })
      return
    }
    await patchArtifacts(runId, {
      topicPrompt: selected.topicPrompt,
      topicData: selected.topic || undefined,
      forbiddenTopics,
    })
    await patchCosts(runId, { topic: selected.usage.cost })
    await bumpUserSpent(userId, selected.usage.cost)

    if (!selected.topic) {
      await failRun({
        runId,
        stage: "topic",
        message: "Модель не выбрала тему. Проверь Perplexity-отчёт или попробуй другую модель.",
      })
      return
    }

    const similarity = buildTopicSimilarityWarning({
      selected: selected.topic.topic,
      forbidden: forbiddenTopics,
    })
    await patchArtifacts(runId, { topicSimilarityWarning: similarity })

    await updateStage(runId, "compression")
    const compressionSystem = await getSystemPrompt(
      CONTENT_SETTING_KEYS.webContextCompressionSystem,
      DEFAULT_WEB_CONTEXT_COMPRESSION_SYSTEM_PROMPT,
    )
    const compression = await compressWebContext({
      apiKey: openRouterKey,
      systemPrompt: compressionSystem,
      rubric,
      settings,
      topicInstruction: buildTopicInstruction(selected.topic),
      webContext: perplexityResult.reportText,
    })
    await patchArtifacts(runId, {
      compressionPrompt: compression.compressionPrompt,
      compressedWebContext: compression.compressed,
    })
    await patchCosts(runId, { compression: compression.usage.cost })
    await bumpUserSpent(userId, compression.usage.cost)

    await updateStage(runId, "writing")
    let postOutput
    try {
      postOutput = await generatePost({
        apiKey: openRouterKey,
        systemPrompt: writerSystemPrompt,
        rubric,
        settings,
        topic: selected.topic,
        compressedWebContext: compression.compressed,
        redditContext,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await failRun({ runId, stage: "writing", message: msg })
      return
    }
    await patchArtifacts(runId, { writerPrompt: postOutput.writerPrompt })
    await patchCosts(runId, { writer: postOutput.usage.cost })
    await bumpUserSpent(userId, postOutput.usage.cost)
    stageCosts = selected.usage.cost + compression.usage.cost + postOutput.usage.cost

    if (!postOutput.post.trim()) {
      await failRun({
        runId,
        stage: "writing",
        message: "Модель не вернула текст поста. Попробуй другую модель или повтори запрос.",
      })
      return
    }
    finalTopic = selected.topic
    finalPostText = postOutput.post
  }

  const finalPost = prependTopicToPost(finalTopic, finalPostText)

  // Тема — в историю topic guard (пока не опубликована).
  // Для свободного поста rubric.id пустой («виртуальная» рубрика) — пишем null,
  // привязка идёт через channelId.
  if (finalTopic) {
    await db.insert(contentTopics).values({
      runId,
      userId,
      rubricId: rubric.id || null,
      channelId: rubric.channelId,
      rubricSlug: rubric.slug,
      topic: finalTopic.topic,
      normalizedTopic: normalizeTopic(finalTopic.topic),
      angle: finalTopic.angle,
      published: false,
    })
  }

  // Финальное состояние
  const total = (perplexityResult.cost || 0) + redditCost + stageCosts
  await db
    .update(contentRuns)
    .set({
      status: "done",
      stage: "done",
      postText: finalPost,
      finishedAt: new Date(),
      costs: sql`${contentRuns.costs} || ${JSON.stringify({ total })}::jsonb`,
    })
    .where(eq(contentRuns.id, runId))
}

/** Помечает тему как опубликованную (учитывается в topic guard). */
export async function markRunPublished(args: { runId: string; userId: string }): Promise<boolean> {
  const updated = await db
    .update(contentTopics)
    .set({ published: true, publishedAt: new Date() })
    .where(
      and(
        eq(contentTopics.runId, args.runId),
        eq(contentTopics.userId, args.userId),
      ),
    )
    .returning({ id: contentTopics.id })
  return updated.length > 0
}

/** Снимает с публикации — тема снова станет доступна для следующих запусков. */
export async function unmarkRunPublished(args: {
  runId: string
  userId: string
}): Promise<boolean> {
  const updated = await db
    .update(contentTopics)
    .set({ published: false, publishedAt: null })
    .where(
      and(
        eq(contentTopics.runId, args.runId),
        eq(contentTopics.userId, args.userId),
      ),
    )
    .returning({ id: contentTopics.id })
  return updated.length > 0
}

/** Возвращает true, если хоть одна тема этого run-а помечена опубликованной. */
export async function isRunPublished(args: {
  runId: string
  userId: string
}): Promise<boolean> {
  const rows = await db
    .select({ id: contentTopics.id })
    .from(contentTopics)
    .where(
      and(
        eq(contentTopics.runId, args.runId),
        eq(contentTopics.userId, args.userId),
        eq(contentTopics.published, true),
      ),
    )
    .limit(1)
  return rows.length > 0
}
