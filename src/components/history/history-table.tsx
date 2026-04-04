"use client"

import { useState } from "react"
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Copy,
  RotateCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import type { GenerationWithImages } from "@/lib/actions/generations"

interface HistoryTableProps {
  generations: GenerationWithImages[]
  onRegenerate: (gen: GenerationWithImages) => void
  showUser?: boolean
}

const statusMap: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  done: {
    label: "Готово",
    icon: <CheckCircle2 className="size-3.5" />,
    variant: "default",
  },
  error: {
    label: "Ошибка",
    icon: <XCircle className="size-3.5" />,
    variant: "destructive",
  },
  processing: {
    label: "В процессе",
    icon: <Loader2 className="size-3.5 animate-spin" />,
    variant: "secondary",
  },
  pending: {
    label: "Ожидание",
    icon: <Clock className="size-3.5" />,
    variant: "outline",
  },
}

function formatDate(date: Date) {
  return new Date(date).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function HistoryTable({ generations, onRegenerate, showUser = false }: HistoryTableProps) {
  const [detailGen, setDetailGen] = useState<GenerationWithImages | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (generations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <p className="text-muted-foreground">Нет генераций</p>
      </div>
    )
  }

  function toggleExpand(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <>
      {/* Мобильный вид — карточки */}
      <div className="space-y-2 md:hidden">
        {generations.map((gen) => {
          const status = statusMap[gen.status] || statusMap.pending
          const isExpanded = expandedId === gen.id
          return (
            <div
              key={gen.id}
              className="rounded-lg border p-3 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  className="text-left text-sm"
                  onClick={(e) => toggleExpand(e, gen.id)}
                >
                  <span className={isExpanded ? "" : "line-clamp-2"}>
                    {gen.prompt}
                  </span>
                </button>
                <Badge variant={status.variant} className="shrink-0 gap-1">
                  {status.icon}
                  {status.label}
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {gen.provider}
                  </Badge>
                  <span>{gen.model}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>{formatDate(gen.createdAt)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => setDetailGen(gen)}
                  >
                    <RotateCw className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Десктопный вид — таблица */}
      <div className="hidden md:block overflow-x-auto rounded-md border">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Дата</TableHead>
              {showUser && <TableHead className="w-[120px]">Пользователь</TableHead>}
              <TableHead className="w-auto">Промпт</TableHead>
              <TableHead className="w-[110px]">Модель</TableHead>
              <TableHead className="w-[100px]">Провайдер</TableHead>
              <TableHead className="w-[95px]">Статус</TableHead>
              <TableHead className="w-[60px] text-right">Цена</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {generations.map((gen) => {
              const status = statusMap[gen.status] || statusMap.pending
              const isExpanded = expandedId === gen.id
              const isLong = gen.prompt.length > 60

              return (
                <TableRow
                  key={gen.id}
                  className="cursor-pointer hover:bg-white/[0.03]"
                  onClick={() => setDetailGen(gen)}
                >
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(gen.createdAt)}
                  </TableCell>
                  {showUser && (
                    <TableCell className="overflow-hidden">
                      <span className="block truncate text-xs" title={gen.userEmail || ""}>
                        {gen.userName || gen.userEmail || "—"}
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <span className={`min-w-0 text-sm break-words ${isExpanded ? "" : "line-clamp-1"}`}>
                        {gen.prompt}
                      </span>
                      {isLong && (
                        <button
                          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                          title={isExpanded ? "Свернуть" : "Развернуть промпт"}
                          onClick={(e) => toggleExpand(e, gen.id)}
                        >
                          {isExpanded ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="overflow-hidden">
                    <span className="block truncate text-xs">{gen.model}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {gen.provider}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant} className="gap-1">
                      {status.icon}
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {gen.cost ? `$${Number(gen.cost).toFixed(3)}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      title="Повторить"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRegenerate(gen)
                      }}
                    >
                      <RotateCw className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Детали генерации */}
      <Dialog open={!!detailGen} onOpenChange={() => setDetailGen(null)}>
        <DialogContent className="max-w-4xl w-[90vw]">
          {detailGen && (
            <>
              <DialogHeader>
                <DialogTitle>Детали генерации</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Промпт */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Промпт</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(detailGen.prompt)
                        toast.success("Промпт скопирован")
                      }}
                    >
                      <Copy className="mr-1 size-3.5" />
                      Копировать
                    </Button>
                  </div>
                  <p className="rounded-md bg-muted p-3 text-sm">
                    {detailGen.prompt}
                  </p>
                </div>

                {/* Метаданные */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Провайдер</span>
                    <p>{detailGen.provider}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Модель</span>
                    <p>{detailGen.model}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Статус</span>
                    <p>
                      {statusMap[detailGen.status]?.label || detailGen.status}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Стоимость</span>
                    <p>
                      {detailGen.cost
                        ? `$${Number(detailGen.cost).toFixed(4)}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Изображений</span>
                    <p>{detailGen.imagesCount}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Дата</span>
                    <p>
                      {new Date(detailGen.createdAt).toLocaleString("ru-RU")}
                    </p>
                  </div>
                </div>

                {/* Параметры */}
                {detailGen.params !== null && detailGen.params !== undefined && (
                  <div>
                    <span className="text-sm font-medium">Параметры</span>
                    <pre className="mt-1 rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(detailGen.params, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Ошибка */}
                {detailGen.errorMessage && (
                  <div>
                    <span className="text-sm font-medium text-destructive">
                      Ошибка
                    </span>
                    <p className="mt-1 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {detailGen.errorMessage}
                    </p>
                  </div>
                )}

                {/* Изображения */}
                {detailGen.images.length > 0 && (
                  <div>
                    <span className="text-sm font-medium">Изображения</span>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {detailGen.images.map((img) => (
                        <img
                          key={img.id}
                          src={`/api/images/${img.id}`}
                          alt="Generated"
                          className="aspect-square rounded-md object-cover"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Повторить */}
                <div className="flex justify-center pt-2">
                  <Button
                    className="gap-2"
                    onClick={() => onRegenerate(detailGen)}
                  >
                    <RotateCw className="size-4" />
                    Повторить с теми же параметрами
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
