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
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
              <div className="absolute -top-[300px] -left-[200px] h-[600px] w-[600px] rounded-full bg-[#1D9BF0]/[0.04] blur-[150px]" />
              <div className="absolute -right-[200px] top-[40%] h-[500px] w-[500px] rounded-full bg-[#7B61FF]/[0.03] blur-[150px]" />
              <div className="absolute -bottom-[200px] left-[30%] h-[400px] w-[400px] rounded-full bg-[#1D9BF0]/[0.02] blur-[120px]" />
            </div>
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
