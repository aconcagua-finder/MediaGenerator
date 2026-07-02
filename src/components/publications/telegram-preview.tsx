"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

interface TelegramPreviewProps {
  text: string
  /** Опциональная обложка над постом — как делает Telegram при превью ссылки. */
  coverImageUrl?: string | null
  className?: string
}

/**
 * Превью того, как пост будет выглядеть в Telegram. Поддерживаем то,
 * что Telegram действительно рендерит:
 * - **жирный**, _курсив_, ~~зачёркнутый~~;
 * - inline-`код` и блоки кода;
 * - ссылки [text](url);
 * - blockquote через `>` (фиолетовая полоса слева как в TG);
 * - маркированные списки (показываем компактно).
 *
 * Заголовки h1/h2/h3 в Telegram не существуют — рендерим как **bold**.
 * Эмодзи отображаются как Unicode (Telegram заменит платформенными).
 */
export function TelegramPreview({ text, coverImageUrl, className }: TelegramPreviewProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[520px] rounded-2xl border border-white/[0.08] bg-[#0e1622] p-1 shadow-lg",
        className,
      )}
    >
      <div className="overflow-hidden rounded-2xl bg-[#17212b] text-[15px] leading-[1.4] text-[#e1e3e6]">
        {coverImageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={coverImageUrl}
            alt="cover"
            className="block h-auto max-h-[560px] w-full object-contain bg-[#0e1622]"
          />
        )}
        <div className="space-y-3 p-3">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => (
                <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.4] text-[#e1e3e6]">
                  {children}
                </p>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-white">{children}</strong>
              ),
              em: ({ children }) => <em className="italic text-[#e1e3e6]">{children}</em>,
              del: ({ children }) => (
                <del className="text-[#a8b1ba] line-through">{children}</del>
              ),
              code: ({ children }) => (
                <code className="rounded bg-[#2b3a4d] px-1 py-0.5 font-mono text-[13.5px] text-[#e1e3e6]">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="overflow-x-auto rounded-md bg-[#0c1620] p-2 font-mono text-[13px] text-[#e1e3e6]">
                  {children}
                </pre>
              ),
              a: ({ children, href }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5cb1ff] underline decoration-[#5cb1ff]/40 underline-offset-2 hover:decoration-[#5cb1ff]"
                >
                  {children}
                </a>
              ),
              ul: ({ children }) => (
                <ul className="space-y-1 text-[#e1e3e6]">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal space-y-1 pl-5 text-[#e1e3e6]">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55em] before:size-1 before:rounded-full before:bg-[#5cb1ff]">
                  <span className="block leading-[1.4]">{children}</span>
                </li>
              ),
              h1: ({ children }) => (
                <p className="text-[15px] font-semibold text-white">{children}</p>
              ),
              h2: ({ children }) => (
                <p className="text-[15px] font-semibold text-white">{children}</p>
              ),
              h3: ({ children }) => (
                <p className="text-[15px] font-semibold text-white">{children}</p>
              ),
              hr: () => <hr className="my-2 border-white/[0.08]" />,
              blockquote: ({ children }) => (
                <blockquote className="my-1 rounded-r-md border-l-[3px] border-[#9087e1] bg-[#9087e1]/10 px-3 py-2 text-[#dcdfe3]">
                  {children}
                </blockquote>
              ),
            }}
          >
            {text}
          </ReactMarkdown>
          <div className="pt-1 text-right text-[11px] text-[#7d8b97]">
            {new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    </div>
  )
}
