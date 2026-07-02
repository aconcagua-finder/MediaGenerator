import type { ChannelCardData, RubricCardData } from "./types"

/**
 * Возвращает человекочитаемый заголовок запуска: для обычной рубрики —
 * её title, для свободного поста — «Свободный пост · {канал}».
 */
export function buildRunTitle(args: {
  rubricSlug: string
  rubrics: RubricCardData[]
  channels: ChannelCardData[]
}): { title: string; subtitle: string | null; channelIcon: string | null } {
  const { rubricSlug, rubrics, channels } = args
  // Свободный пост — slug имеет вид «{channelSlug}__free_post»
  if (rubricSlug.endsWith("__free_post")) {
    const channelSlug = rubricSlug.replace(/__free_post$/, "")
    const channel = channels.find((c) => c.slug === channelSlug)
    return {
      title: "Свободный пост",
      subtitle: channel?.title || null,
      channelIcon: channel?.icon || null,
    }
  }
  const rubric = rubrics.find((r) => r.slug === rubricSlug)
  if (rubric) {
    const channel = channels.find((c) => c.id === rubric.channelId)
    return {
      title: rubric.title,
      subtitle: channel?.title || null,
      channelIcon: channel?.icon || null,
    }
  }
  return { title: rubricSlug, subtitle: null, channelIcon: null }
}
