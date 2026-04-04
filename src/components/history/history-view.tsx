"use client"

import { useState, useCallback, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { HistoryTable } from "./history-table"
import { HistoryFilters } from "./history-filters"
import { HistoryPagination } from "./history-pagination"
import { getGenerations, type GenerationWithImages } from "@/lib/actions/generations"

interface HistoryViewProps {
  initialGenerations: GenerationWithImages[]
  initialTotal: number
  providers: string[]
  isAdmin?: boolean
}

const PER_PAGE = 20

export function HistoryView({
  initialGenerations,
  initialTotal,
  providers,
  isAdmin = false,
}: HistoryViewProps) {
  const router = useRouter()
  const [generations, setGenerations] = useState(initialGenerations)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [provider, setProvider] = useState("")
  const [status, setStatus] = useState("")
  const [isPending, startTransition] = useTransition()

  const [debouncedSearch, setDebouncedSearch] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchData = useCallback(
    (opts: {
      page: number
      search: string
      provider: string
      status: string
    }) => {
      startTransition(async () => {
        const result = await getGenerations({
          limit: PER_PAGE,
          offset: (opts.page - 1) * PER_PAGE,
          search: opts.search || undefined,
          provider: opts.provider || undefined,
          status: opts.status || undefined,
          showAll: isAdmin,
        })
        setGenerations(result.items)
        setTotal(result.total)
      })
    },
    [isAdmin]
  )

  useEffect(() => {
    fetchData({ page, search: debouncedSearch, provider, status })
  }, [page, debouncedSearch, provider, status, fetchData])

  function handlePageChange(newPage: number) {
    setPage(newPage)
  }

  function handleReset() {
    setSearch("")
    setProvider("")
    setStatus("")
    setPage(1)
  }

  function handleRegenerate(gen: GenerationWithImages) {
    const params = new URLSearchParams({
      provider: gen.provider,
      model: gen.model,
      prompt: gen.prompt,
    })
    if (gen.params) {
      params.set("params", JSON.stringify(gen.params))
    }
    router.push(`/generate?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <HistoryFilters
        search={search}
        provider={provider}
        status={status}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        onProviderChange={(v) => {
          setProvider(v)
          setPage(1)
        }}
        onStatusChange={(v) => {
          setStatus(v)
          setPage(1)
        }}
        onReset={handleReset}
        providers={providers}
      />

      <HistoryTable
        generations={generations}
        onRegenerate={handleRegenerate}
        showUser={isAdmin}
      />

      <HistoryPagination
        page={page}
        total={total}
        perPage={PER_PAGE}
        onPageChange={handlePageChange}
      />
    </div>
  )
}
