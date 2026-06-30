"use client"

import Link from "next/link"

import { usePathname } from "next/navigation"
import {
  ImagesIcon,
  HistoryIcon,
  SettingsIcon,
  SparklesIcon,
  VideoIcon,
  AudioLinesIcon,
  MessageSquareIcon,
  NewspaperIcon,
  RadarIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from "lucide-react"
import { NavUser } from "@/components/nav-user"
import { Badge } from "@/components/ui/badge"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"

// Навигация сгруппирована: создание контента → инструменты → служебное.
// Между группами — тонкие разделители.
const navGroups = [
  [
    { title: "Изображения", href: "/generate", icon: SparklesIcon },
    { title: "Видео", href: "/video", icon: VideoIcon },
    { title: "Озвучка", href: "/voice", icon: AudioLinesIcon },
    { title: "Библиотека", href: "/library", icon: ImagesIcon },
  ],
  [
    { title: "Чат", href: "/chat", icon: MessageSquareIcon },
    { title: "Публикации", href: "/publications", icon: NewspaperIcon },
    { title: "Мониторинг", href: "/monitoring", icon: RadarIcon },
  ],
  [
    { title: "История", href: "/history", icon: HistoryIcon },
    { title: "Настройки", href: "/settings", icon: SettingsIcon },
  ],
]

export function AppSidebar({
  user,
  unreadNotificationCount = 0,
  unreadMonitoringCount = 0,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; role: string }
  unreadNotificationCount?: number
  unreadMonitoringCount?: number
}) {
  const pathname = usePathname()
  const { toggleSidebar } = useSidebar()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        {/* Логотип + кнопка свернуть справа.
            При свёрнутом сайдбаре (data-collapsible="icon") кнопка скрывается,
            а ниже появляется отдельный пункт "Развернуть". */}
        <div className="flex items-center gap-1">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<Link href="/" />}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.webp"
                  alt="MediaGenerator"
                  width={32}
                  height={32}
                  className="size-8 shrink-0 rounded-lg"
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-bold">MediaGenerator</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Генерация контента
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Свернуть меню"
            title="Свернуть меню"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white group-data-[collapsible=icon]:hidden"
          >
            <PanelLeftCloseIcon className="size-4" />
          </button>
        </div>
        {/* Кнопка развернуть — видима ТОЛЬКО когда сайдбар свёрнут */}
        <SidebarMenu className="hidden group-data-[collapsible=icon]:block">
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleSidebar}
              tooltip="Развернуть меню"
              className="text-neutral-400 hover:text-white"
            >
              <PanelLeftOpenIcon />
              <span>Развернуть</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {navGroups.map((group, groupIndex) => (
              <div key={groupIndex}>
                {groupIndex > 0 && <SidebarSeparator className="my-1.5" />}
                <SidebarMenu>
                  {group.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={pathname.startsWith(item.href)}
                        tooltip={item.title}
                      >
                        <item.icon />
                        <span className="font-medium">{item.title}</span>
                        {item.href === "/settings" &&
                          user.role === "admin" &&
                          unreadNotificationCount > 0 && (
                            <Badge
                              variant="destructive"
                              className="ml-auto h-5 min-w-5 rounded-full px-1.5 text-xs"
                            >
                              {unreadNotificationCount}
                            </Badge>
                          )}
                        {item.href === "/monitoring" &&
                          unreadMonitoringCount > 0 && (
                            <Badge
                              variant="default"
                              className="ml-auto h-5 min-w-5 rounded-full bg-sky-500/85 px-1.5 text-xs text-white hover:bg-sky-500"
                            >
                              {unreadMonitoringCount}
                            </Badge>
                          )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </div>
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
