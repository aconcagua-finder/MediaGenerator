"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { ShieldIcon, ShieldOffIcon, PencilIcon, CheckIcon, XIcon, RotateCcw } from "lucide-react"
import {
  updateUserRole,
  updateUserDailyLimit,
  updateUserCostLimit,
  updateUserMaxGenerations,
  resetUserSpent,
  banUser,
  unbanUser,
} from "@/lib/actions/admin-users"

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  dailyLimit: number
  costLimit: string
  totalSpent: string
  maxGenerations: number | null
  totalGenerations: number
  banned: boolean | null
  banReason: string | null
  createdAt: Date
}

export function UsersTable({ users }: { users: UserRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [banDialogUser, setBanDialogUser] = useState<UserRow | null>(null)
  const [banReason, setBanReason] = useState("")
  const [editing, setEditing] = useState<{ userId: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState("")

  function handleRoleChange(userId: string, role: string) {
    startTransition(async () => {
      const result = await updateUserRole(userId, role as "admin" | "user")
      if (result.success) {
        toast.success("Роль обновлена")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function startEdit(userId: string, field: string, value: string) {
    setEditing({ userId, field })
    setEditValue(value)
  }

  function cancelEdit() {
    setEditing(null)
    setEditValue("")
  }

  function saveEdit() {
    if (!editing) return
    const val = parseFloat(editValue)
    if (isNaN(val) || val < 0) {
      toast.error("Некорректное значение")
      return
    }
    startTransition(async () => {
      let result
      switch (editing.field) {
        case "dailyLimit":
          result = await updateUserDailyLimit(editing.userId, Math.round(val))
          break
        case "costLimit":
          result = await updateUserCostLimit(editing.userId, val)
          break
        case "maxGenerations":
          result = await updateUserMaxGenerations(editing.userId, editValue === "" ? null : Math.round(val))
          break
        default:
          return
      }
      if (result?.success) {
        toast.success("Лимит обновлён")
        cancelEdit()
        router.refresh()
      } else {
        toast.error(result?.error || "Ошибка")
      }
    })
  }

  function handleResetSpent(userId: string) {
    startTransition(async () => {
      await resetUserSpent(userId)
      toast.success("Расходы сброшены")
      router.refresh()
    })
  }

  function handleBan() {
    if (!banDialogUser) return
    startTransition(async () => {
      const result = await banUser(banDialogUser.id, banReason || undefined)
      if (result.success) {
        toast.success("Пользователь заблокирован")
        setBanDialogUser(null)
        setBanReason("")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleUnban(userId: string) {
    startTransition(async () => {
      const result = await unbanUser(userId)
      if (result.success) {
        toast.success("Пользователь разблокирован")
        router.refresh()
      }
    })
  }

  function EditableCell({ userId, field, value, prefix = "", suffix = "" }: {
    userId: string; field: string; value: string; prefix?: string; suffix?: string
  }) {
    const isEditing = editing?.userId === userId && editing?.field === field
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-24 h-7 text-xs"
            step={field === "costLimit" ? "0.01" : "1"}
            min={0}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit()
              if (e.key === "Escape") cancelEdit()
            }}
          />
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEdit} disabled={isPending}>
            <CheckIcon className="size-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEdit}>
            <XIcon className="size-3" />
          </Button>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs">{prefix}{value}{suffix}</span>
        <button
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
          onClick={() => startEdit(userId, field, value)}
        >
          <PencilIcon className="size-2.5" />
        </button>
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Пользователи не найдены
      </p>
    )
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead>Пользователь</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Лимит/день</TableHead>
              <TableHead>Бюджет</TableHead>
              <TableHead>Потрачено</TableHead>
              <TableHead>Макс. генераций</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const spent = parseFloat(u.totalSpent) || 0
              const limit = parseFloat(u.costLimit) || 0
              const spentPercent = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0

              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div>
                      <div className="text-sm font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.role}
                      onValueChange={(val) => val && handleRoleChange(u.id, val)}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-24 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">admin</SelectItem>
                        <SelectItem value="user">user</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <EditableCell
                      userId={u.id}
                      field="dailyLimit"
                      value={String(u.dailyLimit)}
                    />
                  </TableCell>
                  <TableCell>
                    <EditableCell
                      userId={u.id}
                      field="costLimit"
                      value={parseFloat(u.costLimit).toFixed(2)}
                      prefix="$"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs">${spent.toFixed(2)} / ${limit.toFixed(2)}</span>
                        <div className="h-1 w-16 rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-x-blue transition-all"
                            style={{ width: `${spentPercent}%` }}
                          />
                        </div>
                      </div>
                      {spent > 0 && (
                        <button
                          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
                          title="Сбросить расходы"
                          onClick={() => handleResetSpent(u.id)}
                        >
                          <RotateCcw className="size-2.5" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <EditableCell
                      userId={u.id}
                      field="maxGenerations"
                      value={u.maxGenerations !== null ? String(u.maxGenerations) : "∞"}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      сделано: {u.totalGenerations}
                    </span>
                  </TableCell>
                  <TableCell>
                    {u.banned ? (
                      <Badge variant="destructive">Заблокирован</Badge>
                    ) : (
                      <Badge variant="secondary">Активен</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.banned ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleUnban(u.id)}
                        disabled={isPending}
                      >
                        <ShieldIcon className="mr-1 size-3" />
                        Разблокировать
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs"
                        onClick={() => setBanDialogUser(u)}
                        disabled={isPending}
                      >
                        <ShieldOffIcon className="mr-1 size-3" />
                        Бан
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={banDialogUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBanDialogUser(null)
            setBanReason("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Заблокировать пользователя</DialogTitle>
            <DialogDescription>
              {banDialogUser?.name} ({banDialogUser?.email}) не сможет генерировать изображения.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Причина блокировки (необязательно)"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialogUser(null)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleBan} disabled={isPending}>
              Заблокировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
