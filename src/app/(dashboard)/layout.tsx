import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-server"
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

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          user={{
            name: session.user.name,
            email: session.user.email,
          }}
        />
        <SidebarInset>
          <main className="flex flex-1 flex-col gap-4 p-4 pt-0">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
