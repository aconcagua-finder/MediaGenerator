"use client"

import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"

interface HistoryFiltersProps {
  search: string
  provider: string
  status: string
  onSearchChange: (value: string) => void
  onProviderChange: (value: string) => void
  onStatusChange: (value: string) => void
  onReset: () => void
  providers: string[]
}

export function HistoryFilters({
  search,
  provider,
  status,
  onSearchChange,
  onProviderChange,
  onStatusChange,
  onReset,
  providers,
}: HistoryFiltersProps) {
  const hasFilters = search || provider || status

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Поиск по промпту */}
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по промпту..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-9 pl-8"
        />
      </div>

      {/* Фильтр по провайдеру */}
      <Select value={provider || "all"} onValueChange={(v) => v && onProviderChange(v === "all" ? "" : v)}>
        <SelectTrigger className="h-9 w-[150px]">
          <SelectValue placeholder="Провайдер" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все провайдеры</SelectItem>
          {providers.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Фильтр по статусу */}
      <Select value={status || "all"} onValueChange={(v) => v && onStatusChange(v === "all" ? "" : v)}>
        <SelectTrigger className="h-9 w-[130px]">
          <SelectValue placeholder="Статус" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все статусы</SelectItem>
          <SelectItem value="done">Готово</SelectItem>
          <SelectItem value="error">Ошибка</SelectItem>
          <SelectItem value="processing">В процессе</SelectItem>
          <SelectItem value="pending">Ожидание</SelectItem>
        </SelectContent>
      </Select>

      {/* Сброс фильтров */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <X className="mr-1 size-3.5" />
          Сбросить
        </Button>
      )}
    </div>
  )
}
