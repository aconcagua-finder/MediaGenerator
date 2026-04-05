"use client"

import { useState, useCallback, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Trash2, CheckSquare, XSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { HistoryTable } from "./history-table"
import { HistoryFilters } from "./history-filters"
import { HistoryPagination } from "./history-pagination"
import { getGenerations, deleteGenerations, type GenerationWithImages } from "@/lib/actions/generations"

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
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
        setSelectedIds(new Set())
      })
    },
    [isAdmin]
  )

  useEffect(() => {
    fetchData({ page, search: debouncedSearch, provider, status })
  }, [page, debouncedSearch, provider, status, fetchData])

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSelectAll() {
    setSelectedIds(new Set(generations.map((g) => g.id)))
  }

  function handleDeselectAll() {
    setSelectedIds(new Set())
  }

  function handleBulkDelete() {
    startTransition(async () => {
      const result = await deleteGenerations([...selectedIds])
      toast.success(`Удалено ${result.deleted} записей из истории`)
      setSelectedIds(new Set())
      fetchData({ page, search: debouncedSearch, provider, status })
    })
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
        onReset={() => {
          setSearch("")
          setProvider("")
          setStatus("")
          setPage(1)
        }}
        providers={providers}
      />

      {/* Панель массовых действий */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.02] px-4 py-2">
          <span className="text-sm font-medium">
            Выбрано: {selectedIds.size}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleSelectAll}>
              <CheckSquare className="mr-1 size-4" />
              Выбрать все
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
              <XSquare className="mr-1 size-4" />
              Снять
            </Button>
            <div className="mx-2 h-6 w-px bg-white/10" />
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleBulkDelete}
              disabled={isPending}
            >
              <Trash2 className="mr-1 size-4" />
              Удалить из истории
            </Button>
          </div>
        </div>
      )}

      <HistoryTable
        generations={generations}
        onRegenerate={handleRegenerate}
        showUser={isAdmin}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onRefresh={() => fetchData({ page, search: debouncedSearch, provider, status })}
      />

      <HistoryPagination
        page={page}
        total={total}
        perPage={PER_PAGE}
        onPageChange={(p) => setPage(p)}
      />
    </div>
  )
}
