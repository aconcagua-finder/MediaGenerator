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
    const [usersData, notificationsData, modelsData, unread] = await Promise.all([
      getUsers(),
      getNotifications(),
      getAllModelsForAdmin(),
      getUnreadNotificationCount(),
    ])
    users = usersData
    notifications = notificationsData
    unreadCount = unread
    // Показываем только курированные модели (с заданными параметрами и ценами).
    // Авто-обнаруженные краном модели (пустой paramsSchema, сырые англ. названия,
    // дубли и не-картиночные) — скрываем, чтобы не засорять панель.
    allModels = modelsData.filter(
      (m) => m.paramsSchema && Object.keys(m.paramsSchema as Record<string, unknown>).length > 0
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-xl font-bold text-white">Настройки</h1>
        <p className="mt-1 text-sm text-neutral-500">
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
