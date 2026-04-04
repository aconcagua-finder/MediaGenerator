"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { PackageIcon, InfoIcon, CheckCheckIcon } from "lucide-react"
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/lib/actions/notifications"
import { activateModel, deactivateModel } from "@/lib/actions/models"

type Notification = {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: Date
}

type ModelRow = {
  id: string
  provider: string
  modelId: string
  displayName: string
  description: string | null
  isActive: boolean | null
}

interface NotificationsListProps {
  notifications: Notification[]
  allModels: ModelRow[]
}

export function NotificationsList({
  notifications,
  allModels,
}: NotificationsListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const unreadCount = notifications.filter((n) => !n.isRead).length
  const inactiveModels = allModels.filter((m) => !m.isActive)

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markNotificationAsRead(id)
      router.refresh()
    })
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsAsRead()
      toast.success("Все уведомления отмечены как прочитанные")
      router.refresh()
    })
  }

  function handleToggleModel(modelId: string, currentlyActive: boolean) {
    startTransition(async () => {
      if (currentlyActive) {
        await deactivateModel(modelId)
        toast.success("Модель деактивирована")
      } else {
        await activateModel(modelId)
        toast.success("Модель активирована")
      }
      router.refresh()
    })
  }

  function formatDate(date: Date) {
    return new Date(date).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="space-y-6">
      {/* Управление моделями */}
      {inactiveModels.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-medium mb-3">
              Неактивные модели ({inactiveModels.length})
            </h3>
            <div className="space-y-2">
              {inactiveModels.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <span className="text-sm font-medium">
                      {model.displayName}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {model.provider}
                    </span>
                  </div>
                  <Switch
                    checked={false}
                    onCheckedChange={() => handleToggleModel(model.id, false)}
                    disabled={isPending}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Заголовок уведомлений */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Уведомления
          {unreadCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {unreadCount} непрочитанных
            </Badge>
          )}
        </h3>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isPending}
          >
            <CheckCheckIcon className="mr-1 h-4 w-4" />
            Прочитать все
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Нет уведомлений
        </p>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={n.isRead ? "opacity-60" : ""}
            >
              <CardContent className="flex items-start gap-3 py-4">
                <div className="mt-0.5">
                  {n.type === "model_update" ? (
                    <PackageIcon className="h-5 w-5 text-blue-500" />
                  ) : (
                    <InfoIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm ${!n.isRead ? "font-semibold" : ""}`}
                    >
                      {n.title}
                    </span>
                    {!n.isRead && (
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {n.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(n.createdAt)}
                  </p>
                </div>
                {!n.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMarkRead(n.id)}
                    disabled={isPending}
                  >
                    Прочитано
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Управление всеми моделями */}
      {allModels.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-medium mb-3">
              Все модели ({allModels.length})
            </h3>
            <div className="space-y-2">
              {allModels.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <span className="text-sm font-medium">
                      {model.displayName}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {model.provider}
                    </span>
                    {model.description && (
                      <p className="text-xs text-muted-foreground">
                        {model.description}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={model.isActive ?? false}
                    onCheckedChange={() =>
                      handleToggleModel(model.id, model.isActive ?? false)
                    }
                    disabled={isPending}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
