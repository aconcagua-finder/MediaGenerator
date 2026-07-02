import { listChannels, listRubrics, listRuns } from "@/lib/actions/content"
import { getApiKeys } from "@/lib/actions/api-keys"
import { PublicationsShell } from "@/components/publications/publications-shell"

export const dynamic = "force-dynamic"

export default async function PublicationsPage() {
  const [channels, rubrics, runs, keys] = await Promise.all([
    listChannels(),
    listRubrics(),
    listRuns(),
    getApiKeys(),
  ])
  const providers = new Set(keys.map((k) => k.provider))

  return (
    <PublicationsShell
      channels={channels.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: c.description,
        icon: c.icon,
        isActive: c.isActive,
      }))}
      rubrics={rubrics.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        description: r.description,
        collection: r.collection,
        channelId: r.channelId,
        isActive: r.isActive,
        isBuiltin: r.isBuiltin,
        settings: r.settings,
      }))}
      runs={runs.map((r) => ({
        id: r.id,
        rubricSlug: r.rubricSlug,
        status: r.status,
        stage: r.stage,
        errorStage: r.errorStage,
        errorMessage: r.errorMessage,
        postText: r.postText,
        totalCost: typeof r.costs?.total === "number" ? r.costs.total : null,
        createdAt: r.createdAt.toISOString(),
        finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      }))}
      hasOpenRouterKey={providers.has("openrouter")}
      hasPerplexityKey={providers.has("perplexity")}
      hasOpenAiKey={providers.has("openai")}
    />
  )
}
