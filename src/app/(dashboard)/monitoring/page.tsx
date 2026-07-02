import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { monitoringRuns } from "@/lib/db/schema/monitoring"
import { listTemplates } from "@/lib/actions/monitoring"
import { getApiKeys } from "@/lib/actions/api-keys"
import { getSession } from "@/lib/auth-server"
import { redirect } from "next/navigation"
import { MonitoringShell } from "@/components/monitoring/monitoring-shell"
import type { RunCard, TemplateCard } from "@/components/monitoring/types"

export const dynamic = "force-dynamic"

export default async function MonitoringPage() {
  const session = await getSession()
  if (!session?.user) redirect("/login")

  const [templates, keys] = await Promise.all([listTemplates(), getApiKeys()])

  const runs = templates.length === 0
    ? []
    : await db
        .select()
        .from(monitoringRuns)
        .where(eq(monitoringRuns.userId, session.user.id))
        .orderBy(desc(monitoringRuns.createdAt))
        .limit(50)

  const providers = new Set(keys.map((k) => k.provider))

  const templateCards: TemplateCard[] = templates.map((t) => ({
    id: t.id,
    slug: t.slug,
    title: t.title,
    description: t.description,
    isBuiltin: t.isBuiltin,
    isActive: t.isActive,
    mode: t.mode === "topics" ? "topics" : "feed",
    sources: t.sources,
    topics: t.topics,
    classifier: t.classifier,
    defaultIntervalDays: t.defaultIntervalDays,
    tgMaxPages: t.tgMaxPages,
    schedule: t.schedule,
    lastRunAt: t.lastRunAt ? t.lastRunAt.toISOString() : null,
    nextRunAt: t.nextRunAt ? t.nextRunAt.toISOString() : null,
  }))

  const runCards: RunCard[] = runs.map((r) => ({
    id: r.id,
    templateId: r.templateId,
    trigger: r.trigger,
    status: r.status,
    mode: r.mode === "topics" ? "topics" : "feed",
    periodFrom: r.periodFrom.toISOString(),
    periodTo: r.periodTo.toISOString(),
    sourcesTotal: r.sourcesTotal,
    sourcesSucceeded: r.sourcesSucceeded,
    sourcesFailed: r.sourcesFailed,
    itemsFound: r.itemsFound,
    itemsMatched: r.itemsMatched,
    cost: r.cost?.toString() ?? "0",
    errorMessage: r.errorMessage,
    artifacts: r.artifacts,
    viewedAt: r.viewedAt ? r.viewedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
  }))

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-w-0 flex-col overflow-hidden p-4">
      <MonitoringShell
        initialTemplates={templateCards}
        initialRuns={runCards}
        hasOpenRouterKey={providers.has("openrouter")}
      />
    </div>
  )
}
