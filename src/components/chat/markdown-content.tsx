"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import "highlight.js/styles/github-dark.css"

interface MarkdownContentProps {
  content: string
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="prose prose-invert prose-sm max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 mt-5 text-xl font-bold text-white">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-lg font-bold text-white">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-base font-bold text-white">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-3 leading-relaxed text-neutral-200 last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 text-neutral-200 marker:text-neutral-500">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 text-neutral-200 marker:text-neutral-500">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-x-blue underline decoration-x-blue/40 underline-offset-2 transition-colors hover:text-x-blue-hover hover:decoration-x-blue"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic text-neutral-100">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-x-blue/40 bg-white/[0.02] py-2 pl-4 text-neutral-300 italic">
              {children}
            </blockquote>
          ),
          code: ({ inline, className, children }: {
            inline?: boolean
            className?: string
            children?: React.ReactNode
          }) => {
            if (inline) {
              return (
                <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.9em] text-pink-300">
                  {children}
                </code>
              )
            }
            return (
              <code className={`${className || ""} block`}>{children}</code>
            )
          },
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-lg border border-white/[0.08] bg-[#0d1117] p-4 text-sm">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto rounded-lg border border-white/[0.12]">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-white/[0.12] bg-white/[0.04] px-3 py-2 text-left font-bold text-white">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-white/[0.06] px-3 py-2 text-neutral-200">{children}</td>
          ),
          hr: () => <hr className="my-4 border-white/[0.08]" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
