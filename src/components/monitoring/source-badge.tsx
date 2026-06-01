"use client"

import { GlobeIcon, MessageCircleIcon, UsersIcon } from "lucide-react"
import { categorizeSource, type SourceCategoryInfo } from "@/lib/monitoring/categorize-source"
import { cn } from "@/lib/utils"

interface SourceBadgeProps {
  type: string
  url: string
  /** Компактный режим — только иконка + категория в title-tooltip. */
  compact?: boolean
  className?: string
}

const ICONS = {
  MessageCircle: MessageCircleIcon,
  Globe: GlobeIcon,
  Users: UsersIcon,
}

/**
 * Бейдж типа источника: «Telegram» / «ВКонтакте» / «Сайт». Цветной по категории.
 * Используется в списке источников, фильтре, карточках items.
 */
export function SourceBadge({ type, url, compact = false, className }: SourceBadgeProps) {
  const info: SourceCategoryInfo = categorizeSource({ type: type as "telegram" | "website", url })
  const Icon = ICONS[info.iconName]
  if (compact) {
    return (
      <span
        title={info.label}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md border p-0.5",
          info.badgeClass,
          className,
        )}
      >
        <Icon className="size-3" />
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        info.badgeClass,
        className,
      )}
    >
      <Icon className="size-3" />
      {info.label}
    </span>
  )
}
