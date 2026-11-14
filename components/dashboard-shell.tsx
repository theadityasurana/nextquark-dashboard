"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useQueueCount } from "@/hooks/use-queue-count"
import { useTheme } from "@/components/theme-provider"
import {
  LayoutDashboard, Zap, Users, Building2, Briefcase, Bot,
  ScrollText, Settings, ChevronLeft, LogOut, Menu,
  Mail, DollarSign, Globe, Sun, Moon, BellRing, Brain, TrendingUp, SlidersHorizontal, MessageCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DesktopNotifier } from "@/components/desktop-notifier"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

function NQLogo({ className }: { className?: string }) {
  return <img src="/applogo.png" alt="Iris" className={className} />
}

type NavItem = { label: string; href: string; icon: React.ElementType }

// Grouped so the sidebar reads as sections, not one long list.
const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "Operations",
    items: [
      { label: "Overview",   href: "/",          icon: LayoutDashboard },
      { label: "Live Queue", href: "/queue",     icon: Zap },
      { label: "AI Agents",  href: "/agents",    icon: Bot },
      { label: "Jobs",       href: "/jobs",      icon: Briefcase },
      { label: "Companies",  href: "/companies", icon: Building2 },
      { label: "Users",      href: "/users",     icon: Users },
    ],
  },
  {
    title: "Growth",
    items: [
      { label: "Revenue",          href: "/pricing",   icon: DollarSign },
      { label: "Marketing",        href: "/marketing", icon: TrendingUp },
      { label: "Sales & Outreach", href: "/outreach",  icon: MessageCircle },
      { label: "Email",            href: "/emails",        icon: Mail },
      { label: "Notifications",    href: "/notifications", icon: BellRing },
    ],
  },
  {
    title: "System",
    items: [
      { label: "App Control", href: "/app-control", icon: SlidersHorizontal },
      // Logs is what happened, Learning is what the system kept from it.
      { label: "Learning",    href: "/learning",    icon: Brain },
      { label: "Logs",        href: "/logs",        icon: ScrollText },
    ],
  },
]

const allNavItems = [...navGroups.flatMap((g) => g.items), { label: "Settings", href: "/settings", icon: Settings }]

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href + "/"))
}

function ProviderToggle({ collapsed }: { collapsed: boolean }) {
  const [provider, setProvider] = useState<string>("browser_use")
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(data => { if (data.automationProvider) setProvider(data.automationProvider) })
      .catch(() => {})
  }, [])

  const handleToggle = async () => {
    const order = ["browser_use", "browserbase", "kernel"]
    const next = order[(order.indexOf(provider) + 1) % order.length]
    setSwitching(true)
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationProvider: next }),
      })
      setProvider(next)
    } catch {} finally {
      setSwitching(false)
    }
  }

  const label = provider === "browser_use" ? "Browser Use" : provider === "browserbase" ? "Browserbase" : "Kernel"
  const pill = "text-[10px] text-muted-foreground tabular-nums"

  if (collapsed) {
    return (
      <button
        onClick={handleToggle}
        disabled={switching}
        title={`Provider: ${label} (click to switch)`}
        className="flex items-center justify-center w-full h-8 rounded-md text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
      >
        <Globe className="h-4 w-4" />
      </button>
    )
  }

  return (
    <button
      onClick={handleToggle}
      disabled={switching}
      className="flex items-center gap-2.5 w-full rounded-md px-2.5 h-8 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
    >
      <Globe className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left truncate">{label}</span>
      <span className={pill}>{switching ? "Switching…" : "Provider"}</span>
    </button>
  )
}

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { theme, toggle } = useTheme()
  const isDark = theme === "dark"

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="flex items-center justify-center w-full h-8 rounded-md text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2.5 w-full rounded-md px-2.5 h-8 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
    >
      {isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
      <span className="flex-1 text-left">{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  )
}

function NavLink({ item, collapsed, active, badge }: { item: NavItem; collapsed: boolean; active: boolean; badge?: number }) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 h-8 text-[13px] transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{badge}</span>
      )}
    </Link>
  )
}

function SidebarContent({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  const pathname = usePathname()
  const pendingCount = useQueueCount()

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground overflow-hidden">
      <div className={cn("flex h-14 items-center border-b border-sidebar-border px-3", collapsed ? "justify-center" : "justify-between")}>
        <div className="flex items-center gap-2 min-w-0">
          <NQLogo className="h-6 w-6 rounded-md shrink-0" />
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight truncate">
              Iris <span className="font-normal text-muted-foreground">Admin</span>
            </span>
          )}
        </div>
        {onToggle && !collapsed && (
          <Button variant="ghost" size="icon" onClick={onToggle} className="h-7 w-7 text-muted-foreground hover:text-foreground" aria-label="Collapse sidebar">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="flex flex-col gap-4">
          {navGroups.map((group) => (
            <div key={group.title} className="flex flex-col gap-px">
              {!collapsed && (
                <p className="px-2.5 pb-1 text-[11px] font-medium text-muted-foreground/80">{group.title}</p>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  active={isActivePath(pathname, item.href)}
                  badge={item.href === "/queue" ? pendingCount : undefined}
                />
              ))}
            </div>
          ))}
        </nav>
      </ScrollArea>

      <div className="border-t border-sidebar-border p-2 flex flex-col gap-px">
        <ProviderToggle collapsed={collapsed} />
        <ThemeToggle collapsed={collapsed} />
        <NavLink item={{ label: "Settings", href: "/settings", icon: Settings }} collapsed={collapsed} active={pathname === "/settings"} />
        <div className={cn("flex items-center gap-2.5 px-2.5 pt-2 mt-1 border-t border-sidebar-border", collapsed && "justify-center px-0")}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-foreground">
            AS
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">Aditya Surana</p>
              <p className="text-[11px] text-muted-foreground truncate">founders.nextquark@gmail.com</p>
            </div>
          )}
          {!collapsed && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0" aria-label="Log out">
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
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const current = allNavItems.find((i) => isActivePath(pathname, i.href))

  useEffect(() => setMounted(true), [])

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background" suppressHydrationWarning>
      <aside className={cn("hidden md:flex flex-col border-r border-border transition-[width] duration-200 shrink-0", collapsed ? "w-14" : "w-56")}>
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-3 sm:px-6 shrink-0 safe-top">
          <div className="flex items-center gap-2 min-w-0">
            {mounted && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 -ml-1" aria-label="Open navigation">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 max-w-[85vw] p-0">
                  <VisuallyHidden><SheetTitle>Navigation Menu</SheetTitle></VisuallyHidden>
                  <SidebarContent collapsed={false} />
                </SheetContent>
              </Sheet>
            )}
            {collapsed && (
              <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} className="hidden md:flex h-8 w-8 -ml-2" aria-label="Expand sidebar">
                <Menu className="h-4 w-4" />
              </Button>
            )}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
              <span className="text-muted-foreground hidden sm:inline">Iris</span>
              <span className="text-muted-foreground/60 hidden sm:inline">/</span>
              <span className="font-medium truncate">{current?.label ?? "Dashboard"}</span>
            </nav>
          </div>
          <div className="flex items-center gap-1 safe-right">
            {mounted && <DesktopNotifier />}
          </div>
        </header>

        {/* Plain scroller, not Radix ScrollArea: its viewport wraps content in
            display:table, which grows to the widest child and pushes the whole
            page off-screen (marketing map, wide tables on mobile). */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div className="mx-auto w-full max-w-[1400px] min-w-0 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 animate-fade-in pb-safe">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
