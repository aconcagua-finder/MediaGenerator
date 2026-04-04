"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "@/lib/auth-client"
import { LogOutIcon } from "lucide-react"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function NavUser({
  user,
}: {
  user: { name: string; email: string }
}) {
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    await signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="relative">
          <SidebarMenuButton
            size="lg"
            onClick={() => setShowMenu(!showMenu)}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium">
              {getInitials(user.name)}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </SidebarMenuButton>

          {/* Простое меню */}
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute bottom-full left-0 z-50 mb-1 w-full min-w-48 rounded-lg border border-white/10 bg-popover p-1 shadow-lg">
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {user.email}
                </div>
                <div className="my-1 h-px bg-border" />
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-white/5"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  <LogOutIcon className="size-4" />
                  {loggingOut ? "Выход..." : "Выйти"}
                </button>
              </div>
            </>
          )}
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
