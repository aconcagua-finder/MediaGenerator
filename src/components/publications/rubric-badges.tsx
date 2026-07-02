"use client"

import { cn } from "@/lib/utils"
import type { ContentRubricSettings } from "@/lib/db/schema"

const LANGUAGE_LABEL: Record<ContentRubricSettings["searchLanguage"], { flag: string; title: string }> = {
  ru: { flag: "🇷🇺", title: "RU" },
  en: { flag: "🇬🇧", title: "EN" },
  mixed: { flag: "🌍", title: "RU + EN" },
}

const FORMAT_LABEL: Record<ContentRubricSettings["postFormat"], string> = {
  telegram: "Telegram",
  twitter: "X / Twitter",
  instagram: "Instagram",
  email: "Email",
}

/**
 * Компактный набор бейджей под рубрику: язык источников, формат поста,
 * Reddit on/off. Показывается в селекторе и в шапке детальной панели —
 * чтобы SMM-щик сразу видел, под что заточена рубрика.
 */
export function RubricBadges({
  settings,
  size = "sm",
  className,
}: {
  settings: ContentRubricSettings
  size?: "sm" | "xs"
  className?: string
}) {
  const lang = LANGUAGE_LABEL[settings.searchLanguage] || LANGUAGE_LABEL.ru
  const fmt = FORMAT_LABEL[settings.postFormat] || settings.postFormat
  const px = size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] text-neutral-300",
          px,
        )}
        title={`Язык источников: ${lang.title}`}
      >
        <span aria-hidden>{lang.flag}</span>
        <span>{lang.title}</span>
      </span>
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-neutral-300",
          px,
        )}
      >
        {fmt}
      </span>
      {settings.redditEnabled && (
        <span
          className={cn(
            "inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200",
            px,
          )}
          title="Включён Reddit-поиск через OpenAI"
        >
          + Reddit
        </span>
      )}
    </div>
  )
}
