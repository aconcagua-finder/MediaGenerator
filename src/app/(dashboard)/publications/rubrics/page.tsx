import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-server"
import { getSystemPrompts, listChannels, listRubrics } from "@/lib/actions/content"
import { RubricsEditor } from "@/components/publications/rubrics-editor"

export const dynamic = "force-dynamic"

export default async function PublicationsRubricsPage() {
  const session = await getSession()
  if (!session?.user) redirect("/login")
  const isAdmin = session.user.role === "admin"

  const [channels, rubrics, systemPrompts] = await Promise.all([
    listChannels(),
    listRubrics(),
    getSystemPrompts(),
  ])

  return (
    <RubricsEditor
      isAdmin={isAdmin}
      channels={channels.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: c.description,
        icon: c.icon,
        defaultSettings: c.defaultSettings,
        voiceProfile: c.voiceProfile,
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
        prompts: r.prompts,
      }))}
      systemPrompts={systemPrompts}
    />
  )
}
