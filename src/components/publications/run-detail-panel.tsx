"use client"

import { useState, useTransition } from "react"
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  Send,
  Undo2,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { markRunAsPublished, unmarkRunAsPublished } from "@/lib/actions/content"
import { STAGE_LABELS, STAGE_ORDER, type RubricCardData, type RunDetail } from "./types"
import type { ContentRunArtifacts } from "@/lib/db/schema"
import { TelegramPreview } from "./telegram-preview"
import { SourcesList } from "./sources-list"
import { RefineChat } from "./refine-chat"
import { CoverGallery, type CoverItem } from "./cover-gallery"
import { telegramMarkdownToHtml } from "@/lib/content/markdown-to-html"

interface RunDetailPanelProps {
  rubric: RubricCardData | null
  run: RunDetail | null
  loading: boolean
  onPublishedChanged: () => void
  /** Колбэк, если детальная панель локально обновила стоимость (refine/cover) — родитель синхронизирует список. */
  onCostUpdated?: (runId: string, newTotalCost: number) => void
}

const ACTIVE = new Set(["pending", "perplexity", "reddit", "topic", "compression", "writing"])

export function RunDetailPanel({
  rubric,
  run,
  loading,
  onPublishedChanged,
  onCostUpdated,
}: RunDetailPanelProps) {
  const [copied, setCopied] = useState(false)
  // Локальное состояние «опубликовано» — берётся из `run.isPublished` (свежее
  // значение с сервера), переключается оптимистично при клике.
  const [isPublished, setIsPublished] = useState<boolean>(Boolean(run?.isPublished))
  const [isPending, startTransition] = useTransition()
  // Локальные оверрайды — обновляются через refine/cover, чтобы не ждать polling.
  // Сброс при смене run.id делается родителем через `key={run.id}`.
  const [postOverride, setPostOverride] = useState<string | null>(null)
  const [coverImageId, setCoverImageId] = useState<string | null>(
    run?.artifacts?.coverImageId || null,
  )
  const [coverHistory, setCoverHistory] = useState<CoverItem[]>(
    run?.artifacts?.coverImages || [],
  )
  const [coverPromptDefault, setCoverPromptDefault] = useState<string | null>(
    run?.artifacts?.coverImagePrompt || null,
  )
  const [localTotalCost, setLocalTotalCost] = useState<number | null>(null)

  if (!run) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-white/[0.08] bg-white/[0.01] p-8 text-center text-sm text-neutral-500">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Загрузка…
          </span>
        ) : (
          <span>Выберите запуск слева или создайте новый.</span>
        )}
      </section>
    )
  }

  const isExpress = run.settings.pipelineMode === "express"
  const visibleStages = STAGE_ORDER.filter((s) => {
    if (s === "reddit" && !run.settings.redditEnabled) return false
    // В express-режиме шаги topic и compression выполняются внутри writing
    if (isExpress && (s === "topic" || s === "compression")) return false
    return true
  })

  const stageIndex = visibleStages.indexOf(run.stage)
  const isError = run.status === "error"
  const isDone = run.status === "done"
  const postText = postOverride ?? run.postText ?? ""
  const displayedTotalCost =
    localTotalCost ?? (typeof run.costs?.total === "number" ? run.costs.total : null)

  const copyPost = async () => {
    if (!postText) return
    try {
      const html = telegramMarkdownToHtml(postText)
      // Кладём и HTML, и plain text — Telegram-десктоп/веб при Cmd+V
      // берёт HTML и сохраняет жирный/курсив/ссылки/цитаты, а если
      // приложение HTML не понимает (например мобильный Telegram через
      // веб-share) — фоллбэк на plain markdown.
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([postText], { type: "text/plain" }),
        }),
      ])
      setCopied(true)
      toast.success("Скопировано с форматированием", {
        description: "Вставь в Telegram через Cmd+V — жирный, цитаты и ссылки сохранятся.",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Браузер может не разрешить write() — фоллбэк на старый writeText
      await navigator.clipboard.writeText(postText)
      setCopied(true)
      toast.success("Скопировано", {
        description: "Браузер не дал HTML-формат — вставится как обычный текст.",
      })
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const togglePublished = () => {
    startTransition(async () => {
      try {
        if (isPublished) {
          await unmarkRunAsPublished(run.id)
          setIsPublished(false)
          onPublishedChanged()
          toast.success("Снято с публикации", {
            description: "Тема снова может появиться в будущих запусках.",
          })
        } else {
          await markRunAsPublished(run.id)
          setIsPublished(true)
          onPublishedChanged()
          toast.success("Помечено как опубликованное", {
            description: "В следующих запусках эта тема не повторится.",
          })
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Не удалось обновить статус")
      }
    })
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-white/[0.08] bg-white/[0.02]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/[0.06] px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="truncate text-base font-semibold text-white">
              {rubric?.title || run.rubricSlug}
            </h2>
            {rubric?.collection && (
              <span className="text-[11px] text-neutral-500">· {rubric.collection}</span>
            )}
            {isPublished && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                <CheckCircle2 className="size-3" /> опубликовано
              </span>
            )}
            <span className="text-[11px] text-neutral-500">
              {new Date(run.createdAt).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {run.finishedAt && (
                <>
                  {" → "}
                  {new Date(run.finishedAt).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </>
              )}
            </span>
          </div>
          <PipelineModels settings={run.settings} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {displayedTotalCost !== null && (
            <span className="text-sm font-medium text-neutral-300">
              ${displayedTotalCost.toFixed(4)}
            </span>
          )}
          {isDone && postText && (
            <>
              <Button size="sm" variant="outline" onClick={copyPost}>
                {copied ? (
                  <Check className="mr-1.5 size-3.5" />
                ) : (
                  <Copy className="mr-1.5 size-3.5" />
                )}
                Копировать
              </Button>
              {isPublished ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={togglePublished}
                  disabled={isPending}
                  title="Снять отметку — тема снова станет доступна для будущих запусков"
                >
                  {isPending ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Undo2 className="mr-1.5 size-3.5" />
                  )}
                  Снять с публикации
                </Button>
              ) : (
                <Button size="sm" onClick={togglePublished} disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 size-3.5" />
                  )}
                  Пометить опубликованным
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <StagesIndicator
            stages={visibleStages}
            currentIndex={stageIndex}
            isError={isError}
            isDone={isDone}
            stage={run.stage}
          />

          {isError && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-400" />
                <div className="space-y-1">
                  <div className="font-medium text-rose-100">
                    Упали на шаге: {STAGE_LABELS[run.errorStage || run.stage] || run.stage}
                  </div>
                  {run.errorMessage && (
                    <pre className="whitespace-pre-wrap break-words text-xs text-rose-200/90">
                      {run.errorMessage}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}

          {isDone && postText && (
            <div className="space-y-3">
              {/* Превью Telegram — сразу на виду, это главный «выхлоп» */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide">
                  <span className="text-emerald-300">Превью Telegram</span>
                  <span className="text-neutral-500">{postText.length} символов</span>
                </div>
                <TelegramPreview
                  text={postText}
                  coverImageUrl={coverImageId ? `/api/images/${coverImageId}` : null}
                />
              </div>

              {/* Галерея обложек: главная активная + миниатюры остальных + кнопка «ещё вариант» */}
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-wide text-neutral-400">
                    Обложки
                    {coverHistory.length > 0 && (
                      <span className="ml-1.5 text-neutral-500">({coverHistory.length})</span>
                    )}
                  </div>
                  <span className="text-[11px] text-neutral-500">
                    Логотип в верхнем левом углу добавишь вручную после копирования
                  </span>
                </div>
                <CoverGallery
                  runId={run.id}
                  items={coverHistory}
                  activeImageId={coverImageId}
                  initialPrompt={coverPromptDefault}
                  onGenerated={({ history, activeImageId, totalCost }) => {
                    setCoverHistory(history)
                    setCoverImageId(activeImageId)
                    const newest = history.find((c) => c.imageId === activeImageId)
                    if (newest) setCoverPromptDefault(newest.prompt)
                    setLocalTotalCost(totalCost)
                    onCostUpdated?.(run.id, totalCost)
                  }}
                  onSelected={(imageId) => {
                    setCoverImageId(imageId)
                    const picked = coverHistory.find((c) => c.imageId === imageId)
                    if (picked) setCoverPromptDefault(picked.prompt)
                  }}
                />
              </div>

              {/* Редактор текста — свёрнут по умолчанию */}
              <details className="group rounded-lg border border-white/[0.08] bg-white/[0.02]">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="inline-flex items-center gap-2 text-neutral-300">
                    <ChevronDown className="size-3.5 text-neutral-500 transition-transform group-open:rotate-180" />
                    Править текст вручную
                  </span>
                  <span className="text-xs text-neutral-500">или используй чат ниже</span>
                </summary>
                <div className="space-y-2 border-t border-white/[0.06] p-3">
                  <textarea
                    value={postText}
                    onChange={(e) => setPostOverride(e.target.value)}
                    rows={Math.min(20, Math.max(8, postText.split("\n").length + 2))}
                    className="w-full resize-y rounded-md border border-white/[0.06] bg-black/30 p-3 font-sans text-sm leading-relaxed text-neutral-100 outline-none focus-visible:border-emerald-500/30"
                  />
                  <p className="text-[11px] text-neutral-500">
                    Правки остаются локально, пока не отправишь сообщение в чат-доработке —
                    тогда модель пересоберёт пост из текущего состояния.
                  </p>
                </div>
              </details>
            </div>
          )}

          {isDone && postText && (
            <RefineChat
              runId={run.id}
              initialMessages={[]}
              onPostUpdated={(newPost) => setPostOverride(newPost)}
              onCostUpdated={(newTotal) => {
                setLocalTotalCost(newTotal)
                onCostUpdated?.(run.id, newTotal)
              }}
            />
          )}

          {isDone && (
            <details className="group rounded-lg border border-white/[0.08] bg-white/[0.02]">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-2 text-neutral-300">
                  <ChevronDown className="size-3.5 text-neutral-500 transition-transform group-open:rotate-180" />
                  Источники
                  <Badge variant="outline" className="border-white/[0.08] text-[10px] text-neutral-400">
                    {run.artifacts.perplexitySources?.length || 0}
                  </Badge>
                </span>
                <span className="text-xs text-neutral-500">
                  что нашёл Perplexity
                </span>
              </summary>
              <div className="border-t border-white/[0.06] p-3">
                <SourcesList sources={run.artifacts.perplexitySources} />
              </div>
            </details>
          )}

          <ArtifactSections artifacts={run.artifacts} settings={run.settings} />
        </div>
      </ScrollArea>
    </section>
  )
}

/** Маленькая строка под заголовком: «sonar-pro · Sonnet 4.6». Зависит от режима. */
function PipelineModels({ settings }: { settings: RunDetail["settings"] }) {
  // Короткие алиасы для длинных идентификаторов моделей
  const shortName = (id: string) =>
    id
      .replace(/^[\w-]+\//, "") // openai/ → openai snip
      .replace("-preview", "")
      .replace("anthropic/", "")
      .replace("google/", "")
  const isExpress = settings.pipelineMode === "express"
  const parts = [
    `🔍 ${shortName(settings.perplexityModel)}`,
    settings.redditEnabled ? `💬 ${shortName(settings.redditModel)}` : null,
    !isExpress ? `🎯 ${shortName(settings.topicSelectionModel)}` : null,
    !isExpress ? `✂️ ${shortName(settings.compressionModel)}` : null,
    `✍️ ${shortName(settings.postGenerationModel)}`,
  ].filter(Boolean) as string[]
  const modeBadge = isExpress
    ? { text: "express", color: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" }
    : { text: "full", color: "text-sky-300 bg-sky-500/10 border-sky-500/30" }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-500">
      <span
        className={`mr-1 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${modeBadge.color}`}
        title={
          isExpress
            ? "Express: 2 шага — Perplexity + writer (быстрее и дешевле)"
            : "Full: 4 шага — Perplexity → выбор темы → сжатие → writer"
        }
      >
        {modeBadge.text}
      </span>
      {parts.map((p, idx) => (
        <span key={idx} className="inline-flex items-center">
          {p}
          {idx < parts.length - 1 && <span className="ml-2 text-neutral-700">→</span>}
        </span>
      ))}
    </div>
  )
}

function StagesIndicator({
  stages,
  currentIndex,
  isError,
  isDone,
  stage,
}: {
  stages: typeof STAGE_ORDER
  currentIndex: number
  isError: boolean
  isDone: boolean
  stage: RunDetail["stage"]
}) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs">
      {stages.map((s, idx) => {
        const isCurrentError = isError && stage === s
        // «Текущий шаг» — только если pipeline активно крутится. При ошибке
        // этот шаг помечается isCurrentError, спиннер не показываем.
        const isCurrent = !isError && !isDone && stage === s && ACTIVE.has(stage)
        const isPast = isDone || (currentIndex >= 0 && idx < currentIndex)
        const colour = isCurrentError
          ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
          : isCurrent
          ? "border-sky-400/40 bg-sky-500/10 text-sky-100"
          : isPast
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200/90"
          : "border-white/[0.08] bg-white/[0.02] text-neutral-500"
        return (
          <li
            key={s}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5", colour)}
          >
            <span className="font-mono text-[10px] opacity-70">{idx + 1}</span>
            <span>{STAGE_LABELS[s]}</span>
            {isCurrent && <Loader2 className="size-3 animate-spin" />}
            {isCurrentError && <AlertCircle className="size-3" />}
          </li>
        )
      })}
    </ol>
  )
}

interface ArtifactRow {
  key: keyof ContentRunArtifacts
  title: string
  hint: string
}

function ArtifactSections({
  artifacts,
  settings,
}: {
  artifacts: ContentRunArtifacts
  settings: RunDetail["settings"]
}) {
  const rows: ArtifactRow[] = [
    {
      key: "perplexityReport",
      title: "Perplexity-отчёт",
      hint: "Свежий веб-контекст по запросу рубрики.",
    },
    ...(settings.redditEnabled
      ? [
          {
            key: "redditContext" as const,
            title: "Reddit-обсуждения",
            hint: "OpenAI Responses API + web_search.",
          },
        ]
      : []),
    {
      key: "topicData",
      title: "Выбранная тема",
      hint: "JSON: topic / angle / key_facts.",
    },
    {
      key: "compressedWebContext",
      title: "Сжатый и переведённый контекст",
      hint: "Используется как основной вход для финального поста.",
    },
    {
      key: "writerPrompt",
      title: "User-prompt финальной модели",
      hint: "Точный текст, который ушёл в writer-модель.",
    },
  ]

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-neutral-500">Детали pipeline</div>
      {rows.map((row) => (
        <ArtifactBlock
          key={row.key}
          title={row.title}
          hint={row.hint}
          value={artifacts[row.key]}
        />
      ))}
      {artifacts.topicSimilarityWarning?.triggered && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <div className="font-medium">⚠ Похожесть с ранее опубликованной темой</div>
          <div className="mt-1 text-amber-100/80">
            ratio={artifacts.topicSimilarityWarning.maxRatio} ≥{" "}
            {artifacts.topicSimilarityWarning.threshold} —{" "}
            «{artifacts.topicSimilarityWarning.matchedTopic}»
          </div>
        </div>
      )}
      {artifacts.forbiddenTopics && artifacts.forbiddenTopics.length > 0 && (
        <ArtifactBlock
          title="Запрещённые темы (topic guard)"
          hint={`Темы, опубликованные за последние ${settings.topicGuardLookbackDays} дн.`}
          value={artifacts.forbiddenTopics}
        />
      )}
    </div>
  )
}

function ArtifactBlock({
  title,
  hint,
  value,
}: {
  title: string
  hint?: string
  value: unknown
}) {
  const [open, setOpen] = useState(false)
  const isEmpty =
    value === undefined ||
    value === null ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0)

  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  return (
    <details
      className="rounded-md border border-white/[0.08] bg-white/[0.02]"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm text-neutral-200">
        <span className="inline-flex items-center gap-2">
          <ChevronDown
            className={cn("size-3.5 text-neutral-500 transition-transform", open && "rotate-180")}
          />
          {title}
          {isEmpty ? (
            <Badge variant="outline" className="border-white/[0.08] text-[10px] text-neutral-500">
              пусто
            </Badge>
          ) : null}
        </span>
        {hint && <span className="hidden text-xs text-neutral-500 sm:inline">{hint}</span>}
      </summary>
      {!isEmpty && (
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap border-t border-white/[0.06] bg-black/30 p-3 text-xs leading-relaxed text-neutral-200">
          {text}
        </pre>
      )}
    </details>
  )
}
