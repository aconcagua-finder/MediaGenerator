import { getSession } from "@/lib/auth-server"
import { getApiKeys } from "@/lib/actions/api-keys"
import { getUsers } from "@/lib/actions/admin-users"
import { getNotifications, getUnreadNotificationCount } from "@/lib/actions/notifications"
import { getAllModelsForAdmin } from "@/lib/actions/models"
import { SettingsTabs } from "@/components/settings/settings-tabs"

export default async function SettingsPage() {
  const session = await getSession()
  const keys = await getApiKeys()
  const isAdmin = session?.user?.role === "admin"

  let users, notifications, allModels, unreadCount
  if (isAdmin) {
    ;[users, notifications, allModels, unreadCount] = await Promise.all([
      getUsers(),
      getNotifications(),
      getAllModelsForAdmin(),
      getUnreadNotificationCount(),
    ])
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Настройки</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Управление API ключами{isAdmin ? " и системой" : ""}
        </p>
      </div>

      <SettingsTabs
        isAdmin={isAdmin}
        initialKeys={keys}
        initialUsers={users}
        initialNotifications={notifications}
        allModels={allModels}
        unreadCount={unreadCount}
      />
    </div>
  )
}
