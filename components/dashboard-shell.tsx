"use client"

import { useState, useEffect } from "react"
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
  ChevronLeft,
  LogOut,
  Menu,
  Mail,
  KeyRound,
  DollarSign,
  Globe,
} from "lucide-react"
import { Button } from "@/components/ui/button"

function NQLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="currentColor"
        d="M101.141 53H136.632C151.023 53 162.689 64.6662 162.689 79.0573V112.904H148.112V79.0573C148.112 78.7105 148.098 78.3662 148.072 78.0251L112.581 112.898C112.701 112.902 112.821 112.904 112.941 112.904H148.112V126.672H112.941C98.5504 126.672 86.5638 114.891 86.5638 100.5V66.7434H101.141V100.5C101.141 101.15 101.191 101.792 101.289 102.422L137.56 66.7816C137.255 66.7563 136.945 66.7434 136.632 66.7434H101.141V53Z"
      />
      <path
        fill="currentColor"
        d="M65.2926 124.136L14 66.7372H34.6355L64.7495 100.436V66.7372H80.1365V118.47C80.1365 126.278 70.4953 129.958 65.2926 124.136Z"
      />
    </svg>
  )
}
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

const navItems = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Live Queue", href: "/queue", icon: Zap },
  { label: "Users", href: "/users", icon: Users },
  { label: "Companies", href: "/companies", icon: Building2 },
  { label: "Jobs", href: "/jobs", icon: Briefcase },
  { label: "AI Agents", href: "/agents", icon: Bot },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Email Manager", href: "/emails", icon: Mail },
  { label: "OTP Manager", href: "/otp-manager", icon: KeyRound },
  { label: "Pricing", href: "/pricing", icon: DollarSign },
  { label: "Logs", href: "/logs", icon: ScrollText },
]

function ProviderToggle({ collapsed }: { collapsed: boolean }) {
  const [provider, setProvider] = useState<string>("browser_use")
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(data => { if (data.automationProvider) setProvider(data.automationProvider) })
      .catch(() => {})
  }, [])

  const toggle = async () => {
    const newProvider = provider === "browser_use" ? "browserbase" : "browser_use"
    setSwitching(true)
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationProvider: newProvider }),
      })
      setProvider(newProvider)
    } catch {} finally {
      setSwitching(false)
    }
  }

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        disabled={switching}
        className="flex items-center justify-center w-full px-2 py-2 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        title={`Provider: ${provider === "browser_use" ? "Browser Use" : "Browserbase"} (click to switch)`}
      >
        <Globe className="h-4 w-4" />
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      disabled={switching}
      className="flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
    >
      <Globe className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left truncate">
        {provider === "browser_use" ? "Browser Use" : "Browserbase"}
      </span>
      <span className={cn(
        "text-[9px] px-1.5 py-0.5 rounded-full font-medium",
        provider === "browser_use" ? "bg-blue-500/15 text-blue-500" : "bg-emerald-500/15 text-emerald-500"
      )}>
        {switching ? "..." : "ON"}
      </span>
    </button>
  )
}

function SidebarContent({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  const pathname = usePathname()
  const pendingCount = useQueueCount()

  return (
    <div className="relative flex h-full flex-col bg-sidebar text-sidebar-foreground overflow-hidden">
      {/* Subtle ambient glow at top of sidebar */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
      />

      <div className={cn("relative flex items-center border-b border-sidebar-border/60 px-4 py-5", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-[oklch(0.13_0.006_265)] shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.08),0_4px_12px_-2px_oklch(0.7_0.18_270_/_0.3)] ring-1 ring-border/40">
              <NQLogo className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-gradient">NextQuark</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Admin</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-[oklch(0.13_0.006_265)] shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.08),0_4px_12px_-2px_oklch(0.7_0.18_270_/_0.3)] ring-1 ring-border/40">
            <NQLogo className="h-5 w-5 text-primary" />
          </div>
        )}
        {onToggle && !collapsed && (
          <Button variant="ghost" size="icon" onClick={onToggle} className="h-7 w-7 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="relative flex-1 px-3 py-4">
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-gradient-to-r from-sidebar-accent to-sidebar-accent/40 text-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)]"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-2"
                )}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-primary shadow-[0_0_8px_oklch(0.7_0.18_270_/_0.6)]"
                  />
                )}
                <item.icon className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive ? "text-primary" : "group-hover:text-foreground"
                )} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && item.label === "Live Queue" && pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-auto bg-primary/15 text-primary text-[10px] px-1.5 py-0 border border-primary/20">
                    {pendingCount}
                  </Badge>
                )}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      <div className="relative border-t border-sidebar-border/60 p-3">
        <ProviderToggle collapsed={collapsed} />
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all duration-150 mt-1",
            collapsed && "justify-center px-2",
            pathname === "/settings" && "bg-gradient-to-r from-sidebar-accent to-sidebar-accent/40 text-foreground"
          )}
        >
          <Settings className={cn("h-4 w-4 shrink-0", pathname === "/settings" && "text-primary")} />
          {!collapsed && <span>Settings</span>}
        </Link>
        <div className={cn(
          "flex items-center gap-3 px-3 py-2 mt-2 rounded-md border border-sidebar-border/40 bg-sidebar-accent/30",
          collapsed && "justify-center px-2 border-0 bg-transparent"
        )}>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-chart-2/20 text-xs font-semibold text-foreground ring-1 ring-border/60">
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
    <div className="relative flex h-[100dvh] overflow-hidden bg-background" suppressHydrationWarning>
      {/* Ambient gradient background — Linear style */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/3 h-[500px] w-[500px] rounded-full bg-primary/[0.07] blur-[120px]" />
        <div className="absolute top-1/2 -right-40 h-[400px] w-[400px] rounded-full bg-chart-2/[0.06] blur-[120px]" />
        <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-chart-5/[0.04] blur-[120px]" />
      </div>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border/60 transition-all duration-200 shrink-0",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top Bar — glassmorphic, sticky-aware, safe-area top inset */}
        <header className="relative flex h-14 items-center justify-between border-b border-border/60 px-3 sm:px-4 shrink-0 glass safe-top">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden h-9 w-9 -ml-1.5">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
                <VisuallyHidden>
                  <SheetTitle>Navigation Menu</SheetTitle>
                </VisuallyHidden>
                <SidebarContent collapsed={false} />
              </SheetContent>
            </Sheet>

            {/* Mobile title (visible only on small screens, replaces stats strip) */}
            <div className="flex items-center gap-2 md:hidden min-w-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[oklch(0.13_0.006_265)] ring-1 ring-border/40">
                <NQLogo className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold tracking-tight truncate">NextQuark</span>
            </div>

            {/* Collapsed expand button */}
            {collapsed && (
              <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} className="hidden md:flex h-8 w-8">
                <Menu className="h-4 w-4" />
              </Button>
            )}

            {/* Status strip — desktop only */}
            <div className="hidden md:flex items-center gap-2.5 min-w-0">
              <div className="flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2 py-0.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                </span>
                <span className="text-[10px] font-medium text-success">System Online</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 safe-right">
            {/* Mobile compact status pill */}
            <div className="md:hidden flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
              </span>
              <span className="text-[10px] font-medium text-success">Online</span>
            </div>


          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto overscroll-contain">
          <ScrollArea className="h-full">
            <div className="p-3 sm:p-4 md:p-6 safe-x animate-fade-in pb-safe">
              {children}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  )
}
