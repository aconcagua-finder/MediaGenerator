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
          <main className="relative flex flex-1 flex-col gap-4 overflow-hidden p-6 pt-0">
            {/* Ambient gradient glow */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              <div className="absolute -top-[200px] -left-[100px] h-[500px] w-[500px] rounded-full bg-[#1D9BF0]/10 blur-[150px]" />
              <div className="absolute -right-[100px] top-[30%] h-[400px] w-[400px] rounded-full bg-[#7B61FF]/[0.07] blur-[140px]" />
            </div>
            <div className="relative z-0">
              {children}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
