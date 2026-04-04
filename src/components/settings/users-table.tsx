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
import { ShieldIcon, ShieldOffIcon, PencilIcon, CheckIcon, XIcon } from "lucide-react"
import {
  updateUserRole,
  updateUserDailyLimit,
  banUser,
  unbanUser,
} from "@/lib/actions/admin-users"

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  dailyLimit: number
  banned: boolean | null
  banReason: string | null
  createdAt: Date
}

export function UsersTable({ users }: { users: UserRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [banDialogUser, setBanDialogUser] = useState<UserRow | null>(null)
  const [banReason, setBanReason] = useState("")
  const [editingLimit, setEditingLimit] = useState<string | null>(null)
  const [limitValue, setLimitValue] = useState("")

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

  function startEditLimit(user: UserRow) {
    setEditingLimit(user.id)
    setLimitValue(String(user.dailyLimit))
  }

  function cancelEditLimit() {
    setEditingLimit(null)
    setLimitValue("")
  }

  function saveLimit(userId: string) {
    const limit = parseInt(limitValue, 10)
    if (isNaN(limit) || limit < 0) {
      toast.error("Некорректное значение лимита")
      return
    }
    startTransition(async () => {
      const result = await updateUserDailyLimit(userId, limit)
      if (result.success) {
        toast.success("Лимит обновлён")
        setEditingLimit(null)
        router.refresh()
      } else {
        toast.error(result.error)
      }
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
      } else {
        toast.error("Ошибка разблокировки")
      }
    })
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Имя</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Роль</TableHead>
            <TableHead>Лимит/день</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.name}</TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell>
                <Select
                  value={u.role}
                  onValueChange={(val) => val && handleRoleChange(u.id, val)}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="user">user</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                {editingLimit === u.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={limitValue}
                      onChange={(e) => setLimitValue(e.target.value)}
                      className="w-20 h-8"
                      min={0}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveLimit(u.id)
                        if (e.key === "Escape") cancelEditLimit()
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => saveLimit(u.id)}
                      disabled={isPending}
                    >
                      <CheckIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={cancelEditLimit}
                    >
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span>{u.dailyLimit}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => startEditLimit(u)}
                    >
                      <PencilIcon className="h-3 w-3" />
                    </Button>
                  </div>
                )}
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
                    onClick={() => handleUnban(u.id)}
                    disabled={isPending}
                  >
                    <ShieldIcon className="mr-1 h-4 w-4" />
                    Разблокировать
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setBanDialogUser(u)}
                    disabled={isPending}
                  >
                    <ShieldOffIcon className="mr-1 h-4 w-4" />
                    Заблокировать
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
