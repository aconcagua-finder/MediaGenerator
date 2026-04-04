import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-server"
import { getUnreadNotificationCount } from "@/lib/actions/notifications"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session?.user) {
    redirect("/login")
  }

  const isAdmin = session.user.role === "admin"
  const unreadCount = isAdmin ? await getUnreadNotificationCount() : 0

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          user={{
            name: session.user.name,
            email: session.user.email,
            role: session.user.role as string,
          }}
          unreadNotificationCount={unreadCount}
        />
        <SidebarInset>
          <main className="flex flex-1 flex-col gap-4 p-6 pt-0">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
