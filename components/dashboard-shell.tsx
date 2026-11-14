"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useQueueCount } from "@/hooks/use-queue-count"
import { useTheme } from "@/components/theme-provider"
import {
  LayoutDashboard, Zap, Users, Building2, Briefcase, Bot,
  ScrollText, Settings, LogOut, Menu, Search, ChevronRight, PanelLeftClose, PanelLeftOpen,
  Mail, DollarSign, Globe, Sun, Moon, BellRing, Brain, TrendingUp, SlidersHorizontal, MessageCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
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
      { label: "Messaging",        href: "/emails",    icon: Mail },
    ],
  },
  {
    title: "System",
    items: [
      // What the system kept from past runs (answer bank, portal lessons).
      { label: "Learning", href: "/learning", icon: Brain },
    ],
  },
]

const allNavItems = [...navGroups.flatMap((g) => g.items), { label: "Settings", href: "/settings", icon: Settings }]

function isActivePath(pathname: string, href: string) {
  // App Control's editor pages live under /app-control but belong to Settings.
  if (href === "/settings" && pathname.startsWith("/app-control")) return true
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
        className="flex items-center justify-center w-full h-8 rounded-lg text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
      >
        <Globe className="h-4 w-4" />
      </button>
    )
  }

  return (
    <button
      onClick={handleToggle}
      disabled={switching}
      className="flex items-center gap-2.5 w-full rounded-lg px-2.5 h-8 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
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
        className="flex items-center justify-center w-full h-8 rounded-lg text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2.5 w-full rounded-lg px-2.5 h-8 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
    >
      {isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
      <span className="flex-1 text-left">{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  )
}

function NavLink({ item, collapsed, active, badge, onNavigate }: { item: NavItem; collapsed: boolean; active: boolean; badge?: number; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 h-8 text-[13px] transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[var(--shadow-card)] ring-1 ring-sidebar-border"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {active && !collapsed && <span className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />}
      <item.icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="ml-auto inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10.5px] font-semibold tabular-nums text-primary">
          {badge > 999 ? "999+" : badge}
        </span>
      )}
    </Link>
  )
}

function SearchButton({ collapsed, onOpen }: { collapsed: boolean; onOpen: () => void }) {
  if (collapsed) {
    return (
      <button onClick={onOpen} title="Search (⌘K)" className="flex items-center justify-center w-full h-8 rounded-lg text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground transition-colors">
        <Search className="h-4 w-4" />
      </button>
    )
  }
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 w-full h-8 rounded-lg border border-sidebar-border bg-background/60 px-2.5 text-[13px] text-muted-foreground hover:text-foreground hover:border-input transition-colors"
    >
      <Search className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="hidden md:inline-flex h-5 items-center gap-0.5 rounded border border-sidebar-border bg-sidebar px-1.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
    </button>
  )
}

function SidebarContent({ collapsed, onToggle, onSearch, onNavigate }: { collapsed: boolean; onToggle?: () => void; onSearch: () => void; onNavigate?: () => void }) {
  const pathname = usePathname()
  const pendingCount = useQueueCount()

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground overflow-hidden">
      <div className={cn("flex h-14 items-center px-3 shrink-0", collapsed ? "justify-center" : "justify-between")}>
        <div className="flex items-center gap-2.5 min-w-0">
          <NQLogo className="h-7 w-7 rounded-lg shrink-0 ring-1 ring-sidebar-border" />
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="text-[13px] font-semibold tracking-tight text-foreground truncate">Iris</p>
              <p className="text-[11px] text-muted-foreground truncate">Admin console</p>
            </div>
          )}
        </div>
        {onToggle && !collapsed && (
          <Button variant="ghost" size="icon" onClick={onToggle} className="h-7 w-7 text-muted-foreground hover:text-foreground" aria-label="Collapse sidebar">
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="px-3 pb-2 shrink-0">
        <SearchButton collapsed={collapsed} onOpen={onSearch} />
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 scrollbar-hide">
        <nav className="flex flex-col gap-5">
          {navGroups.map((group) => (
            <div key={group.title} className="flex flex-col gap-0.5">
              {!collapsed ? (
                <p className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">{group.title}</p>
              ) : (
                <div className="mx-auto mb-1 h-px w-5 bg-sidebar-border" />
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  active={isActivePath(pathname, item.href)}
                  badge={item.href === "/queue" ? pendingCount : undefined}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-sidebar-border p-3 flex flex-col gap-0.5 shrink-0">
        <ProviderToggle collapsed={collapsed} />
        <ThemeToggle collapsed={collapsed} />
        <NavLink item={{ label: "Settings", href: "/settings", icon: Settings }} collapsed={collapsed} active={isActivePath(pathname, "/settings")} onNavigate={onNavigate} />
        <div className={cn("mt-2 flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-2", collapsed && "justify-center border-0 bg-transparent p-0")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-5 text-[11px] font-semibold text-white">
            AS
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-xs font-medium text-foreground truncate">Aditya Surana</p>
              <p className="text-[11px] text-muted-foreground truncate">Owner</p>
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

type HealthState = "healthy" | "degraded" | "down" | null

function useSystemStatus(): HealthState {
  const [status, setStatus] = useState<HealthState>(null)
  useEffect(() => {
    let alive = true
    const load = () => fetch("/api/system-health").then(r => r.json()).then(d => { if (alive) setStatus(d.overallStatus ?? null) }).catch(() => {})
    load()
    const id = setInterval(() => { if (!document.hidden) load() }, 120_000)
    const onHealth = (e: Event) => setStatus((e as CustomEvent).detail ?? null)
    window.addEventListener("iris:health", onHealth)
    return () => { alive = false; clearInterval(id); window.removeEventListener("iris:health", onHealth) }
  }, [])
  return status
}

function StatusPill() {
  const status = useSystemStatus()
  const cfg = status === "down"
    ? { dot: "bg-destructive", text: "Major outage" }
    : status === "degraded"
      ? { dot: "bg-warning", text: "Degraded performance" }
      : status === "healthy"
        ? { dot: "bg-success", text: "All systems operational" }
        : { dot: "bg-muted-foreground", text: "Checking status…" }
  return (
    <Link href="/" className="hidden lg:inline-flex items-center gap-2 h-8 rounded-full border border-border bg-card px-3 text-xs text-muted-foreground hover:text-foreground shadow-[var(--shadow-card)] transition-colors">
      <span className="relative flex h-2 w-2">
        {status === "healthy" && <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping", cfg.dot)} />}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", cfg.dot)} />
      </span>
      {cfg.text}
    </Link>
  )
}

function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter()
  const { toggle } = useTheme()
  const go = (href: string) => { onOpenChange(false); router.push(href) }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a page or run a command…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {navGroups.map((g) => (
          <CommandGroup key={g.title} heading={g.title}>
            {g.items.map((i) => (
              <CommandItem key={i.href} value={`${g.title} ${i.label}`} onSelect={() => go(i.href)}>
                <i.icon className="h-4 w-4" /> {i.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandGroup heading="Actions">
          <CommandItem value="settings general" onSelect={() => go("/settings")}><Settings className="h-4 w-4" /> Settings</CommandItem>
          <CommandItem value="app control remote config" onSelect={() => go("/settings?tab=app-control")}><SlidersHorizontal className="h-4 w-4" /> App control</CommandItem>
          <CommandItem value="logs" onSelect={() => go("/settings?tab=logs")}><ScrollText className="h-4 w-4" /> Logs</CommandItem>
          <CommandItem value="push notifications" onSelect={() => go("/emails?tab=notifications")}><BellRing className="h-4 w-4" /> Push notifications</CommandItem>
          <CommandItem value="toggle theme dark light" onSelect={() => { toggle(); onOpenChange(false) }}><Sun className="h-4 w-4" /> Toggle theme</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const current = allNavItems.find((i) => isActivePath(pathname, i.href))
  const group = navGroups.find((g) => g.items.some((i) => isActivePath(pathname, i.href)))

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((o) => !o) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-sidebar" suppressHydrationWarning>
      <aside className={cn("hidden md:flex flex-col transition-[width] duration-200 shrink-0", collapsed ? "w-[60px]" : "w-60")}>
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} onSearch={() => setSearchOpen(true)} />
      </aside>

      {/* Content sits on an inset, rounded canvas (Linear / Vercel pattern) so
          the sidebar reads as chrome and the page as the working surface. */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0 bg-background md:my-2 md:mr-2 md:rounded-xl md:border md:border-border md:shadow-[var(--shadow-card)]">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border px-3 sm:px-6 shrink-0 safe-top">
          <div className="flex items-center gap-2 min-w-0">
            {mounted && (
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 -ml-1" aria-label="Open navigation">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
                  <VisuallyHidden><SheetTitle>Navigation Menu</SheetTitle></VisuallyHidden>
                  <SidebarContent collapsed={false} onSearch={() => { setMobileOpen(false); setSearchOpen(true) }} onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>
            )}
            {collapsed && (
              <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} className="hidden md:flex h-8 w-8 -ml-2 text-muted-foreground" aria-label="Expand sidebar">
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            )}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] min-w-0">
              <span className="text-muted-foreground hidden sm:inline">{group?.title ?? (current?.href === "/settings" ? "System" : "Iris")}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 hidden sm:inline" />
              <span className="font-medium text-foreground truncate">{current?.label ?? "Dashboard"}</span>
            </nav>
          </div>
          <div className="flex items-center gap-2 safe-right">
            <StatusPill />
            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => setSearchOpen(true)} aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
            {mounted && <DesktopNotifier />}
          </div>
        </header>

        {/* Plain scroller, not Radix ScrollArea: its viewport wraps content in
            display:table, which grows to the widest child and pushes the whole
            page off-screen (marketing map, wide tables on mobile). */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div className="mx-auto w-full max-w-[1440px] min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 animate-fade-in pb-safe">
            {children}
          </div>
        </main>
      </div>
      {mounted && <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />}
    </div>
  )
}
