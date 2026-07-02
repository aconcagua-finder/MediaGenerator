"use client"

import { ExternalLink } from "lucide-react"
import type { PerplexitySource } from "@/lib/db/schema"

interface SourcesListProps {
  sources: PerplexitySource[] | undefined
}

function getDomain(url?: string): string {
  if (!url) return ""
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function formatDate(date?: string): string {
  if (!date) return ""
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function SourcesList({ sources }: SourcesListProps) {
  if (!sources || sources.length === 0) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-neutral-500">
        Источников нет — Perplexity не вернул цитаты.
      </div>
    )
  }
  return (
    <ul className="space-y-1.5">
      {sources.map((s, idx) => {
        const domain = getDomain(s.url) || s.source || ""
        const date = formatDate(s.date)
        return (
          <li
            key={`${idx}-${s.url || s.title}`}
            className="group rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 transition-colors hover:bg-white/[0.04]"
          >
            <a
              href={s.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 text-sm"
            >
              <span className="mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-[10px] font-mono text-neutral-400">
                {idx + 1}
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block truncate font-medium text-neutral-100 group-hover:text-white">
                  {s.title || s.url || "(без названия)"}
                </span>
                <span className="flex items-center gap-2 text-xs text-neutral-500">
                  {domain && <span className="truncate">{domain}</span>}
                  {date && <span>{date}</span>}
                </span>
              </span>
              <ExternalLink className="mt-1 size-3.5 shrink-0 text-neutral-500 group-hover:text-neutral-300" />
            </a>
          </li>
        )
      })}
    </ul>
  )
}
