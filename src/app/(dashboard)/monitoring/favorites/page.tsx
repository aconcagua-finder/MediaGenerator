import { and, desc, eq } from "drizzle-orm"
import Link from "next/link"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import {
  monitoringItems,
  monitoringRuns,
  monitoringTemplates,
} from "@/lib/db/schema/monitoring"
import { getSession } from "@/lib/auth-server"
import { FavoritesShell } from "@/components/monitoring/favorites-shell"

export const dynamic = "force-dynamic"

export default async function FavoritesPage() {
  const session = await getSession()
  if (!session?.user) redirect("/login")

  const rows = await db
    .select({
      id: monitoringItems.id,
      sourceId: monitoringItems.sourceId,
      sourceType: monitoringItems.sourceType,
      sourceUrl: monitoringItems.sourceUrl,
      sourceLabel: monitoringItems.sourceLabel,
      postUrl: monitoringItems.postUrl,
      publishedAt: monitoringItems.publishedAt,
      title: monitoringItems.title,
      content: monitoringItems.content,
      excerpt: monitoringItems.excerpt,
      images: monitoringItems.images,
      matchType: monitoringItems.matchType,
      matchTopicName: monitoringItems.matchTopicName,
      matchReason: monitoringItems.matchReason,
      favoritedAt: monitoringItems.favoritedAt,
      engagement: monitoringItems.engagement,
      engagementScore: monitoringItems.engagementScore,
      templateId: monitoringTemplates.id,
      templateTitle: monitoringTemplates.title,
    })
    .from(monitoringItems)
    .innerJoin(monitoringRuns, eq(monitoringItems.runId, monitoringRuns.id))
    .innerJoin(monitoringTemplates, eq(monitoringRuns.templateId, monitoringTemplates.id))
    .where(and(eq(monitoringRuns.userId, session.user.id), eq(monitoringItems.isFavorite, true)))
    .orderBy(desc(monitoringItems.favoritedAt))
    .limit(500)

  const items = rows.map((r) => ({
    id: r.id,
    sourceId: r.sourceId,
    sourceType: r.sourceType,
    sourceUrl: r.sourceUrl,
    sourceLabel: r.sourceLabel,
    postUrl: r.postUrl,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    title: r.title,
    content: r.content,
    excerpt: r.excerpt,
    images: r.images,
    matchType: r.matchType,
    matchTopicName: r.matchTopicName,
    matchReason: r.matchReason,
    favoritedAt: r.favoritedAt ? r.favoritedAt.toISOString() : null,
    engagement: r.engagement,
    engagementScore: r.engagementScore,
    templateId: r.templateId,
    templateTitle: r.templateTitle,
  }))

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Избранное</h1>
          <p className="text-sm text-neutral-400">
            Посты, которые ты пометил сердечком. {items.length} шт.
          </p>
        </div>
        <Link
          href="/monitoring"
          className="text-sm text-neutral-400 hover:text-white"
        >
          ← К мониторингу
        </Link>
      </header>
      <div className="min-h-0 flex-1">
        <FavoritesShell initialItems={items} />
      </div>
    </div>
  )
}
