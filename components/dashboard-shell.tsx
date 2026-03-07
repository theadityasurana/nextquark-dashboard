"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useQueueCount } from "@/hooks/use-queue-count"
import {
  LayoutDashboard,
  Zap,
  Users,
  Building2,
  Briefcase,
  Bot,
  BarChart3,
  ScrollText,
  Settings,
  Bell,
  ChevronLeft,
  LogOut,
  Menu,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

const navItems = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Live Queue", href: "/queue", icon: Zap },
  { label: "Users", href: "/users", icon: Users },
  { label: "Companies", href: "/companies", icon: Building2 },
  { label: "Jobs", href: "/jobs", icon: Briefcase },
  { label: "AI Agents", href: "/agents", icon: Bot },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Logs", href: "/logs", icon: ScrollText },
]

function SidebarContent({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  const pathname = usePathname()
  const pendingCount = useQueueCount()

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex items-center border-b border-sidebar-border px-4 py-5", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
              NQ
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">NextQuark</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Admin</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            NQ
          </div>
        )}
        {onToggle && !collapsed && (
          <Button variant="ghost" size="icon" onClick={onToggle} className="h-7 w-7 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-2"
                )}
              >
                <item.icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && item.label === "Live Queue" && (
                  <Badge variant="secondary" className="ml-auto bg-primary/15 text-primary text-[10px] px-1.5 py-0">
                    {pendingCount}
                  </Badge>
                )}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      <div className="border-t border-sidebar-border p-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
            collapsed && "justify-center px-2",
            pathname === "/settings" && "bg-sidebar-accent text-primary"
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
        <div className={cn("flex items-center gap-3 px-3 py-2 mt-1", collapsed && "justify-center px-2")}>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
            AS
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">Aditya Surana</p>
              <p className="text-[10px] text-muted-foreground truncate">founders.nextquark@gmail.com</p>
            </div>
          )}
          {!collapsed && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border transition-all duration-200 shrink-0",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden h-8 w-8">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-56 p-0">
                <SidebarContent collapsed={false} />
              </SheetContent>
            </Sheet>

            {/* Collapsed expand button */}
            {collapsed && (
              <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} className="hidden md:flex h-8 w-8">
                <Menu className="h-4 w-4" />
              </Button>
            )}

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">System Online</span>
              </div>
              <span className="text-xs text-border hidden sm:inline">|</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">Queue: <span className="text-foreground font-medium">47</span> pending</span>
              <span className="text-xs text-border hidden sm:inline">|</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">Agents: <span className="text-success font-medium">7</span> active</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative h-8 w-8">
              <Bell className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                12
              </span>
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <ScrollArea className="h-full">
            <div className="p-4 md:p-6">
              {children}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  )
}
