"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiKeyForm } from "./api-key-form"
import { UsersTable } from "./users-table"
import { NotificationsList } from "./notifications-list"
import { Badge } from "@/components/ui/badge"

type ApiKey = {
  id: string
  provider: string
  keyHint: string
  isActive: boolean
  createdAt: Date
}

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

interface SettingsTabsProps {
  isAdmin: boolean
  initialKeys: ApiKey[]
  initialUsers?: UserRow[]
  initialNotifications?: Notification[]
  allModels?: ModelRow[]
  unreadCount?: number
}

export function SettingsTabs({
  isAdmin,
  initialKeys,
  initialUsers,
  initialNotifications,
  allModels,
  unreadCount = 0,
}: SettingsTabsProps) {
  return (
    <Tabs defaultValue="api-keys">
      <TabsList>
        <TabsTrigger value="api-keys">API ключи</TabsTrigger>
        {isAdmin && (
          <>
            <TabsTrigger value="users">Пользователи</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              Уведомления
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
          </>
        )}
      </TabsList>

      <TabsContent value="api-keys" className="mt-4">
        <ApiKeyForm initialKeys={initialKeys} />
      </TabsContent>

      {isAdmin && (
        <>
          <TabsContent value="users" className="mt-4">
            <UsersTable users={initialUsers ?? []} />
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <NotificationsList
              notifications={initialNotifications ?? []}
              allModels={allModels ?? []}
            />
          </TabsContent>
        </>
      )}
    </Tabs>
  )
}
