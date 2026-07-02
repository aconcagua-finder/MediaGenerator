"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  createRubric,
  deleteRubric,
  updateRubric,
  updateSystemPrompts,
} from "@/lib/actions/content"
import { DEFAULT_RUBRIC_SETTINGS } from "@/lib/content/default-rubrics"
import type {
  ContentRubricPrompts,
  ContentRubricSettings,
} from "@/lib/db/schema"
import { RubricAssistantDialog } from "./rubric-assistant-dialog"
import { RubricBadges } from "./rubric-badges"
import { ChannelAssistantDialog } from "./channel-assistant-dialog"

interface RubricFull {
  id: string
  slug: string
  title: string
  description: string
  collection: string | null
  channelId: string | null
  isActive: boolean
  isBuiltin: boolean
  settings: ContentRubricSettings
  prompts: ContentRubricPrompts
}

export interface ChannelFull {
  id: string
  slug: string
  title: string
  description: string
  icon: string | null
  defaultSettings: ContentRubricSettings
  voiceProfile: string
  isActive: boolean
}

interface RubricsEditorProps {
  isAdmin: boolean
  channels: ChannelFull[]
  rubrics: RubricFull[]
  systemPrompts: {
    topicSelectionSystem: string
    webContextCompressionSystem: string
  }
}

const EMPTY_RUBRIC_PROMPTS: ContentRubricPrompts = {
  perplexitySearchPrompt: "Find materials from {start_date} to {end_date} for the rubric '...'.",
  redditSearchPrompt: "Сегодня {end_date}. Найди на Reddit обсуждения за {start_date}–{end_date} о ...",
  postWriterSystemPrompt: "## Role\nТы пишешь Telegram-пост на русском по теме ...",
}

export function RubricsEditor({
  isAdmin,
  channels,
  rubrics,
  systemPrompts,
}: RubricsEditorProps) {
  const router = useRouter()
  const [items, setItems] = useState<RubricFull[]>(rubrics)
  const [channelList, setChannelList] = useState<ChannelFull[]>(channels)
  const [channelAssistantOpen, setChannelAssistantOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | "system" | "new" | null>(
    rubrics[0]?.id || "system",
  )
  const [topicSystem, setTopicSystem] = useState(systemPrompts.topicSelectionSystem)
  const [compressionSystem, setCompressionSystem] = useState(
    systemPrompts.webContextCompressionSystem,
  )
  const [pendingSystem, startSystemTransition] = useTransition()
  const [creating, setCreating] = useState(false)

  /** Группировка рубрик в боковом списке по каналу — те же группы, что и в селекторе на главной. */
  const groupedItems = useMemo(() => {
    const channelMap = new Map<string, ChannelFull>(channelList.map((c) => [c.id, c]))
    const map = new Map<string, RubricFull[]>()
    for (const r of items) {
      const channel = r.channelId ? channelMap.get(r.channelId) : null
      const key = channel
        ? `${channel.icon ? channel.icon + " " : ""}${channel.title}`
        : (r.collection || "").trim() || "Без канала"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "Без канала") return 1
      if (b === "Без канала") return -1
      return a.localeCompare(b, "ru")
    })
  }, [items, channelList])

  const selected = useMemo(() => {
    if (selectedId === "system") return null
    if (selectedId === "new") return null
    return items.find((r) => r.id === selectedId) || null
  }, [items, selectedId])

  const saveSystem = () => {
    startSystemTransition(async () => {
      try {
        await updateSystemPrompts({
          topicSelectionSystem: topicSystem,
          webContextCompressionSystem: compressionSystem,
        })
        toast.success("Общие промпты сохранены")
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Не удалось сохранить")
      }
    })
  }

  const handleCreate = async (draft: NewRubricDraft) => {
    setCreating(true)
    try {
      const rubric = await createRubric({
        slug: draft.slug,
        title: draft.title,
        description: draft.description,
        collection: draft.collection || null,
        settings: draft.settings,
        prompts: draft.prompts,
      })
      setItems((prev) => [...prev, rubric])
      setSelectedId(rubric.id)
      toast.success("Рубрика создана")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось создать")
    } finally {
      setCreating(false)
    }
  }

  const handleUpdate = async (patch: Partial<RubricFull> & { id: string }) => {
    try {
      await updateRubric({
        id: patch.id,
        title: patch.title,
        description: patch.description,
        collection: patch.collection,
        isActive: patch.isActive,
        settings: patch.settings,
        prompts: patch.prompts,
      })
      setItems((prev) =>
        prev.map((r) =>
          r.id === patch.id
            ? {
                ...r,
                ...(patch.title !== undefined ? { title: patch.title } : {}),
                ...(patch.description !== undefined ? { description: patch.description } : {}),
                ...(patch.collection !== undefined ? { collection: patch.collection } : {}),
                ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
                ...(patch.settings !== undefined ? { settings: patch.settings } : {}),
                ...(patch.prompts !== undefined ? { prompts: patch.prompts } : {}),
              }
            : r,
        ),
      )
      toast.success("Сохранено")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить")
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteRubric(id)
      setItems((prev) => prev.filter((r) => r.id !== id))
      setSelectedId("system")
      toast.success("Рубрика удалена")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось удалить")
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-white/[0.08] pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="mb-1 -ml-2"
            render={<Link href="/publications" />}
          >
            <ArrowLeft className="mr-1.5 size-3.5" />К списку запусков
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Рубрики и промпты
          </h1>
          <p className="text-sm text-neutral-400">
            Что искать на каждом шаге pipeline и в каком стиле писать пост.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setChannelAssistantOpen(true)}>
              <Sparkles className="mr-1.5 size-3.5 text-amber-300" />
              Канал через ассистента
            </Button>
            <Button onClick={() => setSelectedId("new")}>
              <Plus className="mr-1.5 size-4" />
              Новая рубрика
            </Button>
          </div>
        )}
      </header>

      <ChannelAssistantDialog
        open={channelAssistantOpen}
        onOpenChange={setChannelAssistantOpen}
        onCreated={(channel, newRubrics) => {
          setChannelList((prev) => [...prev, channel])
          setItems((prev) => [
            ...prev,
            ...(newRubrics as RubricFull[]).map((r) => ({
              ...r,
              channelId: channel.id,
            })),
          ])
          router.refresh()
        }}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex h-full min-h-0 flex-col rounded-lg border border-white/[0.08] bg-white/[0.02]">
          <ScrollArea className="min-h-0 flex-1">
            <ul className="divide-y divide-white/[0.04]">
              <li>
                <button
                  type="button"
                  onClick={() => setSelectedId("system")}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.04] ${
                    selectedId === "system" ? "bg-white/[0.05] text-white" : "text-neutral-300"
                  }`}
                >
                  <span>Общие промпты</span>
                  <Badge variant="outline" className="border-white/[0.08] text-[10px]">
                    система
                  </Badge>
                </button>
              </li>
              {groupedItems.map(([collection, rubricsInGroup]) => (
                <li key={collection} className="py-1">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
                    {collection}
                  </div>
                  <ul className="divide-y divide-white/[0.04]">
                    {rubricsInGroup.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(r.id)}
                          className={`flex w-full flex-col items-stretch gap-1.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.04] ${
                            selectedId === r.id ? "bg-white/[0.05]" : ""
                          }`}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span
                              className={`min-w-0 flex-1 truncate text-sm ${
                                selectedId === r.id ? "text-white" : "text-neutral-200"
                              }`}
                            >
                              {r.title}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              {r.isBuiltin && (
                                <Badge variant="outline" className="border-white/[0.08] text-[10px]">
                                  встроена
                                </Badge>
                              )}
                              {!r.isActive && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-500/30 text-[10px] text-amber-200"
                                >
                                  off
                                </Badge>
                              )}
                            </span>
                          </span>
                          <RubricBadges settings={r.settings} size="xs" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </aside>

        <ScrollArea className="min-h-0 rounded-lg border border-white/[0.08] bg-white/[0.02]">
          <div className="p-4">
            {selectedId === "system" && (
              <SystemPromptsForm
                topicSystem={topicSystem}
                setTopicSystem={setTopicSystem}
                compressionSystem={compressionSystem}
                setCompressionSystem={setCompressionSystem}
                onSave={saveSystem}
                pending={pendingSystem}
                isAdmin={isAdmin}
              />
            )}
            {selectedId === "new" && (
              <NewRubricForm onCancel={() => setSelectedId("system")} onCreate={handleCreate} creating={creating} />
            )}
            {selected && (
              <RubricForm
                key={selected.id}
                rubric={selected}
                isAdmin={isAdmin}
                onSave={handleUpdate}
                onDelete={handleDelete}
              />
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function SystemPromptsForm({
  topicSystem,
  setTopicSystem,
  compressionSystem,
  setCompressionSystem,
  onSave,
  pending,
  isAdmin,
}: {
  topicSystem: string
  setTopicSystem: (v: string) => void
  compressionSystem: string
  setCompressionSystem: (v: string) => void
  onSave: () => void
  pending: boolean
  isAdmin: boolean
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Общие промпты</CardTitle>
          <p className="text-xs text-neutral-500">
            Используются на всех рубриках. Меняй осторожно — отразится на pipeline целиком.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="topic-system">topic_selection_system</Label>
            <Textarea
              id="topic-system"
              rows={10}
              value={topicSystem}
              onChange={(e) => setTopicSystem(e.target.value)}
              disabled={!isAdmin}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compression-system">web_context_compression_system</Label>
            <Textarea
              id="compression-system"
              rows={10}
              value={compressionSystem}
              onChange={(e) => setCompressionSystem(e.target.value)}
              disabled={!isAdmin}
              className="font-mono text-xs"
            />
          </div>
          {isAdmin && (
            <div className="pt-1">
              <Button onClick={onSave} disabled={pending}>
                {pending ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-3.5" />
                )}
                Сохранить
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RubricForm({
  rubric,
  isAdmin,
  onSave,
  onDelete,
}: {
  rubric: RubricFull
  isAdmin: boolean
  onSave: (patch: Partial<RubricFull> & { id: string }) => Promise<void>
  onDelete: (id: string) => void
}) {
  const [title, setTitle] = useState(rubric.title)
  const [description, setDescription] = useState(rubric.description)
  const [isActive, setIsActive] = useState(rubric.isActive)
  const [settings, setSettings] = useState<ContentRubricSettings>(rubric.settings)
  const [prompts, setPrompts] = useState<ContentRubricPrompts>(rubric.prompts)
  const [collection, setCollection] = useState<string>(rubric.collection || "")
  const [pending, startTransition] = useTransition()

  // Переинициализация при смене рубрики делается за счёт `key={rubric.id}` в родителе.

  const save = () => {
    startTransition(async () => {
      await onSave({
        id: rubric.id,
        title,
        description,
        collection: collection || null,
        isActive,
        settings,
        prompts,
      })
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base">{rubric.title}</CardTitle>
              <p className="text-xs text-neutral-500">
                slug:{" "}
                <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[11px] text-neutral-300">
                  {rubric.slug}
                </code>
                {rubric.isBuiltin && (
                  <Badge variant="outline" className="ml-2 border-white/[0.08] text-[10px]">
                    встроена
                  </Badge>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor={`active-${rubric.id}`} className="text-xs text-neutral-400">
                Активна
              </Label>
              <Switch
                id={`active-${rubric.id}`}
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={!isAdmin}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`title-${rubric.id}`}>Название</Label>
              <Input
                id={`title-${rubric.id}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`collection-${rubric.id}`}>Коллекция / Проект</Label>
              <Input
                id={`collection-${rubric.id}`}
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                disabled={!isAdmin}
                placeholder="Например: ЦФУ Групп · Налоги"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`desc-${rubric.id}`}>Краткое описание</Label>
              <Input
                id={`desc-${rubric.id}`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="prompts">
        <TabsList>
          <TabsTrigger value="prompts">Промпты</TabsTrigger>
          <TabsTrigger value="models">Модели</TabsTrigger>
          <TabsTrigger value="params">Параметры</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="space-y-3">
          <PromptField
            label="Perplexity search"
            hint="Поддерживает {start_date} и {end_date}. Шаблон уходит в Perplexity Sonar."
            value={prompts.perplexitySearchPrompt}
            onChange={(v) => setPrompts({ ...prompts, perplexitySearchPrompt: v })}
            disabled={!isAdmin}
            rows={14}
          />
          {settings.redditEnabled && (
            <PromptField
              label="Reddit search"
              hint="Уходит в OpenAI Responses API с инструментом web_search."
              value={prompts.redditSearchPrompt}
              onChange={(v) => setPrompts({ ...prompts, redditSearchPrompt: v })}
              disabled={!isAdmin}
              rows={14}
            />
          )}
          <PromptField
            label="Post writer system"
            hint="Стилевые рамки рубрики. Пусто — используется универсальный SMM-гайд."
            value={prompts.postWriterSystemPrompt}
            onChange={(v) => setPrompts({ ...prompts, postWriterSystemPrompt: v })}
            disabled={!isAdmin}
            rows={20}
          />
        </TabsContent>

        <TabsContent value="models" className="space-y-3">
          <ModelInputs settings={settings} setSettings={setSettings} disabled={!isAdmin} />
        </TabsContent>

        <TabsContent value="params" className="space-y-3">
          <ParamsInputs settings={settings} setSettings={setSettings} disabled={!isAdmin} />
        </TabsContent>
      </Tabs>

      {isAdmin && (
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
          <Button onClick={save} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 size-3.5" />
            )}
            Сохранить
          </Button>
          {!rubric.isBuiltin && (
            <Button
              variant="ghost"
              className="text-rose-300 hover:text-rose-200"
              onClick={() => {
                if (window.confirm("Удалить рубрику? Запуски этой рубрики тоже удалятся.")) {
                  onDelete(rubric.id)
                }
              }}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Удалить
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function PromptField({
  label,
  hint,
  value,
  onChange,
  disabled,
  rows,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  rows?: number
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      </div>
      <Textarea
        rows={rows || 8}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="font-mono text-xs"
      />
    </div>
  )
}

function ModelInputs({
  settings,
  setSettings,
  disabled,
}: {
  settings: ContentRubricSettings
  setSettings: (v: ContentRubricSettings) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FieldText
        label="Perplexity модель"
        value={settings.perplexityModel}
        onChange={(v) => setSettings({ ...settings, perplexityModel: v })}
        disabled={disabled}
        hint="Напр. sonar-deep-research, sonar-pro, sonar"
      />
      <FieldText
        label="Reddit модель (OpenAI)"
        value={settings.redditModel}
        onChange={(v) => setSettings({ ...settings, redditModel: v })}
        disabled={disabled}
        hint="Responses API: gpt-5.4, gpt-5.5 и т.д."
      />
      <FieldText
        label="Topic selection (OpenRouter)"
        value={settings.topicSelectionModel}
        onChange={(v) => setSettings({ ...settings, topicSelectionModel: v })}
        disabled={disabled}
      />
      <FieldText
        label="Compression (OpenRouter)"
        value={settings.compressionModel}
        onChange={(v) => setSettings({ ...settings, compressionModel: v })}
        disabled={disabled}
      />
      <FieldText
        label="Post generation (OpenRouter)"
        value={settings.postGenerationModel}
        onChange={(v) => setSettings({ ...settings, postGenerationModel: v })}
        disabled={disabled}
      />
    </div>
  )
}

function ParamsInputs({
  settings,
  setSettings,
  disabled,
}: {
  settings: ContentRubricSettings
  setSettings: (v: ContentRubricSettings) => void
  disabled?: boolean
}) {
  const [showAdvanced, setShowAdvanced] = useState(settings.redditEnabled)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldText
          label="Аудитория"
          value={settings.audience}
          onChange={(v) => setSettings({ ...settings, audience: v })}
          disabled={disabled}
          hint="Подставляется в writer-prompt — кому пишем."
        />
        <FieldSelect
          label="Формат поста"
          value={settings.postFormat}
          options={["telegram", "twitter", "instagram", "email"]}
          onChange={(v) =>
            setSettings({ ...settings, postFormat: v as ContentRubricSettings["postFormat"] })
          }
          disabled={disabled}
        />
        <FieldNumber
          label="Окно поиска (дней)"
          value={settings.researchWindowDays}
          onChange={(v) => setSettings({ ...settings, researchWindowDays: v })}
          disabled={disabled}
          min={1}
          max={90}
        />
        <FieldNumber
          label="Целевая длина (символов)"
          value={settings.targetLength}
          onChange={(v) => setSettings({ ...settings, targetLength: v })}
          disabled={disabled}
          min={300}
          max={6000}
        />
        <FieldSelect
          label="Свежесть источников"
          value={settings.searchRecencyFilter || ""}
          options={["", "day", "week", "month", "year"]}
          onChange={(v) =>
            setSettings({
              ...settings,
              searchRecencyFilter: v as ContentRubricSettings["searchRecencyFilter"],
            })
          }
          disabled={disabled}
        />
        <FieldSelect
          label="Язык источников"
          value={settings.searchLanguage}
          options={["ru", "en", "mixed"]}
          onChange={(v) =>
            setSettings({
              ...settings,
              searchLanguage: v as ContentRubricSettings["searchLanguage"],
            })
          }
          disabled={disabled}
        />
        <FieldSelect
          label="Режим pipeline"
          value={settings.pipelineMode}
          options={["express", "full"]}
          onChange={(v) =>
            setSettings({
              ...settings,
              pipelineMode: v as ContentRubricSettings["pipelineMode"],
            })
          }
          disabled={disabled}
        />
        <FieldSelect
          label="Глубина веб-контекста"
          value={settings.perplexitySearchContextSize}
          options={["low", "medium", "high"]}
          onChange={(v) =>
            setSettings({
              ...settings,
              perplexitySearchContextSize:
                v as ContentRubricSettings["perplexitySearchContextSize"],
            })
          }
          disabled={disabled}
        />
      </div>

      <FieldDomainList
        value={settings.searchDomainFilter || []}
        onChange={(v) => setSettings({ ...settings, searchDomainFilter: v })}
        disabled={disabled}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldSwitch
          label="Topic guard"
          hint="Не повторять темы, уже опубликованные за окно ниже."
          checked={settings.topicGuardEnabled}
          onChange={(v) => setSettings({ ...settings, topicGuardEnabled: v })}
          disabled={disabled}
        />
        <FieldNumber
          label="Topic guard окно (дней)"
          value={settings.topicGuardLookbackDays}
          onChange={(v) => setSettings({ ...settings, topicGuardLookbackDays: v })}
          disabled={disabled || !settings.topicGuardEnabled}
          min={1}
          max={365}
        />
        <FieldNumber
          label="Topic guard: макс. тем"
          value={settings.topicGuardMaxTopics}
          onChange={(v) => setSettings({ ...settings, topicGuardMaxTopics: v })}
          disabled={disabled || !settings.topicGuardEnabled}
          min={1}
          max={100}
        />
      </div>

      <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between text-left text-sm text-neutral-300 hover:text-white"
        >
          <span>Advanced: Reddit-поиск (опционально)</span>
          <span className="text-xs text-neutral-500">{showAdvanced ? "скрыть" : "показать"}</span>
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-3">
            <FieldSwitch
              label="Включить Reddit-поиск"
              hint="Для русскоязычных правовых тем — не рекомендуется (Reddit англоязычный). Требует ключ OpenAI."
              checked={settings.redditEnabled}
              onChange={(v) => setSettings({ ...settings, redditEnabled: v })}
              disabled={disabled}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldNumber
                label="Reddit окно (дней)"
                value={settings.redditDays}
                onChange={(v) => setSettings({ ...settings, redditDays: v })}
                disabled={disabled || !settings.redditEnabled}
                min={1}
                max={60}
              />
              <FieldNumber
                label="Reddit: max tool calls"
                value={settings.redditMaxToolCalls}
                onChange={(v) => setSettings({ ...settings, redditMaxToolCalls: v })}
                disabled={disabled || !settings.redditEnabled}
                min={1}
                max={32}
              />
              <FieldNumber
                label="Reddit: max output tokens"
                value={settings.redditMaxOutputTokens}
                onChange={(v) => setSettings({ ...settings, redditMaxOutputTokens: v })}
                disabled={disabled || !settings.redditEnabled}
                min={500}
                max={32000}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FieldDomainList({
  value,
  onChange,
  disabled,
}: {
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(value.join("\n"))
  return (
    <div className="space-y-1.5">
      <Label>Доверенные домены (по одному в строке)</Label>
      <Textarea
        rows={Math.max(3, Math.min(8, value.length + 1))}
        value={draft}
        placeholder="nalog.gov.ru&#10;consultant.ru&#10;garant.ru"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const list = draft
            .split(/[\n,;\s]+/)
            .map((s) => s.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))
            .filter(Boolean)
          onChange(list)
        }}
        disabled={disabled}
        className="font-mono text-xs"
      />
      <p className="text-[11px] text-neutral-500">
        Пусто = искать везде. Если задано — Perplexity ищет только в этих доменах.
      </p>
    </div>
  )
}

function FieldText({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="font-mono text-xs"
      />
      {hint && <p className="text-[11px] text-neutral-500">{hint}</p>}
    </div>
  )
}

function FieldNumber({
  label,
  value,
  onChange,
  disabled,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  min?: number
  max?: number
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10)
          if (Number.isFinite(v)) onChange(v)
        }}
        disabled={disabled}
      />
    </div>
  )
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select
        className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-neutral-100 transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-neutral-900">
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}

function FieldSwitch({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <div className="space-y-0.5 pr-3">
        <div className="text-sm text-neutral-100">{label}</div>
        {hint && <div className="text-xs text-neutral-500">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}

interface NewRubricDraft {
  slug: string
  title: string
  description: string
  collection: string
  settings: ContentRubricSettings
  prompts: ContentRubricPrompts
}

function NewRubricForm({
  onCancel,
  onCreate,
  creating,
}: {
  onCancel: () => void
  onCreate: (draft: NewRubricDraft) => void
  creating: boolean
}) {
  const [draft, setDraft] = useState<NewRubricDraft>({
    slug: "",
    title: "",
    description: "",
    collection: "",
    settings: { ...DEFAULT_RUBRIC_SETTINGS },
    prompts: { ...EMPTY_RUBRIC_PROMPTS },
  })
  const [assistantOpen, setAssistantOpen] = useState(false)

  return (
    <div className="space-y-4">
      <RubricAssistantDialog
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        onApply={(d) => {
          setDraft({
            slug: d.slug || draft.slug,
            title: d.title || draft.title,
            description: d.description || draft.description,
            collection: d.collection || draft.collection,
            settings: { ...DEFAULT_RUBRIC_SETTINGS, ...d.settings },
            prompts: {
              perplexitySearchPrompt:
                d.prompts.perplexitySearchPrompt || draft.prompts.perplexitySearchPrompt,
              redditSearchPrompt: d.prompts.redditSearchPrompt || "",
              postWriterSystemPrompt: d.prompts.postWriterSystemPrompt || "",
            },
          })
        }}
      />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">Новая рубрика</CardTitle>
              <p className="text-xs text-neutral-500">
                Заполни поля вручную или попроси ассистента собрать черновик.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setAssistantOpen(true)}>
              <Sparkles className="mr-1.5 size-3.5 text-amber-300" />
              Ассистент
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldText
              label="Slug"
              value={draft.slug}
              onChange={(v) => setDraft({ ...draft, slug: v })}
              hint="латиницей: smm_news, weekly_digest, …"
            />
            <FieldText
              label="Название"
              value={draft.title}
              onChange={(v) => setDraft({ ...draft, title: v })}
            />
          </div>
          <FieldText
            label="Краткое описание"
            value={draft.description}
            onChange={(v) => setDraft({ ...draft, description: v })}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldText
              label="Коллекция / Проект"
              value={draft.collection}
              onChange={(v) => setDraft({ ...draft, collection: v })}
              hint='Например: "ЦФУ Групп · Налоги", "Personal blog". Можно оставить пустым.'
            />
            <FieldSelect
              label="Язык источников"
              value={draft.settings.searchLanguage}
              options={["ru", "en", "mixed"]}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  settings: {
                    ...draft.settings,
                    searchLanguage: v as ContentRubricSettings["searchLanguage"],
                  },
                })
              }
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldText
              label="Аудитория"
              value={draft.settings.audience}
              onChange={(v) =>
                setDraft({ ...draft, settings: { ...draft.settings, audience: v } })
              }
              hint="Кому пишем. Подставится в writer-prompt."
            />
            <FieldNumber
              label="Целевая длина (символов)"
              value={draft.settings.targetLength}
              onChange={(v) =>
                setDraft({ ...draft, settings: { ...draft.settings, targetLength: v } })
              }
              min={300}
              max={6000}
            />
          </div>
          <FieldDomainList
            value={draft.settings.searchDomainFilter || []}
            onChange={(v) =>
              setDraft({ ...draft, settings: { ...draft.settings, searchDomainFilter: v } })
            }
          />
          <PromptField
            label="Perplexity search"
            hint="Что искать. Поддерживает {start_date} и {end_date}."
            value={draft.prompts.perplexitySearchPrompt}
            onChange={(v) =>
              setDraft({
                ...draft,
                prompts: { ...draft.prompts, perplexitySearchPrompt: v },
              })
            }
            rows={6}
          />
          <PromptField
            label="Post writer system (опционально)"
            hint="Можно оставить пустым — тогда применится универсальный SMM-гайд с подстановкой аудитории и формата."
            value={draft.prompts.postWriterSystemPrompt}
            onChange={(v) =>
              setDraft({
                ...draft,
                prompts: { ...draft.prompts, postWriterSystemPrompt: v },
              })
            }
            rows={10}
          />
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={() => onCreate(draft)} disabled={creating}>
              {creating ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 size-3.5" />
              )}
              Создать
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Отмена
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

