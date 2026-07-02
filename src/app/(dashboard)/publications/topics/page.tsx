import { listTopics } from "@/lib/actions/content"
import { TopicsView } from "@/components/publications/topics-view"

export const dynamic = "force-dynamic"

export default async function PublicationsTopicsPage() {
  const topics = await listTopics({ limit: 300 })
  return (
    <TopicsView
      topics={topics.map((t) => ({
        id: t.id,
        topic: t.topic,
        angle: t.angle,
        rubricSlug: t.rubricSlug,
        published: t.published,
        publishedAt: t.publishedAt ? t.publishedAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
        runId: t.runId,
      }))}
    />
  )
}
