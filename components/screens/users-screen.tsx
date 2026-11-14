"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/status-badge"
import { mockUsers, type User } from "@/lib/mock-data"
import {
  Search, Download, ChevronRight, Mail, Phone, MapPin,
  FileText, ExternalLink, Ban, Trash2, Briefcase, GraduationCap,
  FolderOpen, User as UserIcon, Heart, Shield, Calendar,
  LinkIcon, Globe, RefreshCw, CheckCircle, XCircle, Clock
} from "lucide-react"
import { PageHeader, Panel, StatCard, KpiGrid, Meter, TableHead, EmptyState, SearchField, Pagination, Segmented, Avatar } from "@/components/ui/dashboard"

interface SupabaseAuthUser {
  id: string
  email: string
  phone: string | null
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  phone_confirmed_at: string | null
  role: string
  app_metadata: Record<string, unknown>
  user_metadata: Record<string, unknown>
  confirmed: boolean
  banned: boolean
  provider: string
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return body
}

type UsersResponse = {
  rows: SupabaseAuthUser[]
  total: number
  stats: { total: number; newToday: number; new7d: number; prev7d: number; active7d: number; providers: Record<string, number> }
}

export function UsersScreen() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedAuthUser, setSelectedAuthUser] = useState<SupabaseAuthUser | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"auth" | "app">("auth")
  const [authPage, setAuthPage] = useState(1)
  const USERS_PER_PAGE = 25

  const [debouncedQuery, setDebouncedQuery] = useState("")
  useEffect(() => { const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300); return () => clearTimeout(t) }, [searchQuery])
  const usersKey = `/api/users?page=${authPage}&perPage=${USERS_PER_PAGE}${debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : ""}`
  const { data: usersResp, isLoading: authLoading, isValidating: authValidating, mutate: refreshAuth } = useSWR<UsersResponse>(
    usersKey,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false }
  )
  const authUsers: SupabaseAuthUser[] = usersResp?.rows ?? []

  const filteredMockUsers = mockUsers.filter((user) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      user.name.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      user.headline.toLowerCase().includes(q)
    )
  })

  // Already searched and paged on the server.
  const filteredAuthUsers = authUsers

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never"
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const exportCsv = async () => {
    if (activeTab === "auth") {
      // Export walks the server pages rather than holding every user in the browser.
      const rowsAll: SupabaseAuthUser[] = []
      for (let p = 1; p < 500; p++) {
        const r: UsersResponse = await fetcher(`/api/users?page=${p}&perPage=100${debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : ""}`)
        rowsAll.push(...r.rows)
        if (rowsAll.length >= r.total || r.rows.length === 0) break
      }
      const csv = [["ID", "Email", "Provider", "Confirmed", "Last Sign In", "Created At"], ...rowsAll.map(u => [u.id, u.email, u.provider, u.confirmed ? "Yes" : "No", formatDate(u.last_sign_in_at), formatDate(u.created_at)])]
        .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
      const a = document.createElement("a"); a.href = url; a.download = `users-auth-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
      return
    }
    const headers = ["ID", "Name", "Email", "Total Apps", "Successful", "Failed", "Last Active"]
    const rows = filteredMockUsers.map(u => [u.id, u.name, u.email, u.totalApps, u.successfulApps, u.failedApps, u.lastActive])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `users-${activeTab}-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const st = usersResp?.stats
  const all = { length: st?.total ?? 0 }
  const newToday = st?.newToday ?? 0
  const new7d = st?.new7d ?? 0
  const prev7d = st?.prev7d ?? 0
  const active7d = st?.active7d ?? 0
  const now = Date.now()
  const growth = prev7d > 0 ? Math.round(((new7d - prev7d) / prev7d) * 100) : null
  const providers = Object.entries(st?.providers ?? {}).sort((a, b) => b[1] - a[1])
  const PROVIDER_COLORS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-5", "bg-chart-4"]

  const totalMatched = usersResp?.total ?? 0
  const totalAuthPages = Math.max(1, Math.ceil(totalMatched / USERS_PER_PAGE))
  const safeAuthPage = Math.min(authPage, totalAuthPages)
  const pagedAuthUsers = authUsers

  const relative = (d: string | null) => {
    if (!d) return "Never"
    const m = Math.floor((now - new Date(d).getTime()) / 60000)
    if (m < 1) return "Just now"
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const days = Math.floor(h / 24)
    if (days < 30) return `${days}d ago`
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Users"
        description="Everyone who has signed up for Iris, from Supabase Authentication."
        actions={
          <>
            {activeTab === "auth" && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => refreshAuth()}>
                <RefreshCw className={`h-3.5 w-3.5 ${authLoading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </>
        }
      />

      <KpiGrid>
        <StatCard label="Total users" value={all.length} icon={UserIcon} delta={newToday > 0 ? `+${newToday} today` : undefined} deltaTone="positive" footnote="registered accounts" />
        <StatCard label="New this week" value={new7d} icon={Calendar}
          delta={growth === null ? undefined : `${growth >= 0 ? "+" : ""}${growth}% vs last week`}
          deltaTone={growth === null ? "neutral" : growth >= 0 ? "positive" : "negative"}
          footnote={`${prev7d.toLocaleString()} the week before`} />
        <StatCard label="Active this week" value={active7d} icon={Clock}
          footnote={`${all.length ? Math.round((active7d / all.length) * 100) : 0}% signed in within 7 days`}>
          <Meter value={active7d} max={Math.max(1, all.length)} />
        </StatCard>
        <div className="panel flex flex-col p-5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-muted-foreground">Sign-up method</span>
            <Shield className="h-4 w-4 text-muted-foreground/70" />
          </div>
          <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {providers.map(([name, n], i) => (
              <div key={name} className={PROVIDER_COLORS[i % PROVIDER_COLORS.length]} style={{ width: `${(n / Math.max(1, all.length)) * 100}%` }} />
            ))}
          </div>
          <div className="mt-4 space-y-1.5">
            {providers.slice(0, 3).map(([name, n], i) => (
              <div key={name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 capitalize text-muted-foreground"><span className={`h-2 w-2 rounded-sm ${PROVIDER_COLORS[i % PROVIDER_COLORS.length]}`} />{name}</span>
                <span className="num font-medium">{n.toLocaleString()} <span className="text-muted-foreground">· {Math.round((n / Math.max(1, all.length)) * 100)}%</span></span>
              </div>
            ))}
          </div>
        </div>
      </KpiGrid>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <Segmented
            value={activeTab}
            onChange={(v) => { setActiveTab(v); setAuthPage(1) }}
            options={[{ value: "auth", label: `Auth users · ${(st?.total ?? 0).toLocaleString()}` }, { value: "app", label: "App profiles" }]}
          />
          <SearchField value={searchQuery} onChange={(v) => { setSearchQuery(v); setAuthPage(1) }} placeholder={activeTab === "auth" ? "Search email or ID…" : "Search name, email, headline…"} />
        </div>

        {activeTab === "auth" && (
          <>
            <TableHead className="hidden md:flex" columns={[
              { label: "User", className: "flex-1 min-w-0" },
              { label: "Provider", className: "w-24" },
              { label: "Verified", className: "w-24" },
              { label: "Last sign in", className: "w-28 text-right" },
              { label: "Joined", className: "w-28 text-right" },
              { label: "", className: "w-4" },
            ]} />
            {authLoading && !usersResp ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className="h-7 w-7 rounded-full bg-muted shimmer" />
                    <div className="h-3 w-56 rounded bg-muted shimmer" />
                  </div>
                ))}
              </div>
            ) : authUsers.length === 0 ? (
              <EmptyState icon={UserIcon} title="No users found" description={searchQuery ? "Try a different search." : "Users appear here once they sign up."} />
            ) : (
              <div className={`divide-y divide-border transition-opacity ${authValidating && usersResp ? "opacity-60" : ""}`}>
                {pagedAuthUsers.map((user) => (
                  <button
                    key={user.id}
                    className="group flex w-full flex-col gap-1.5 px-5 py-3 text-left transition-colors hover:bg-muted/40 md:flex-row md:items-center md:gap-4"
                    onClick={() => setSelectedAuthUser(user)}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={user.email} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{user.email}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{user.id.slice(0, 8)}</p>
                      </div>
                    </div>
                    <span className="w-24"><span className="inline-flex items-center rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium capitalize">{user.provider}</span></span>
                    <span className="hidden w-24 items-center gap-1.5 text-xs md:flex">
                      {user.confirmed
                        ? <><CheckCircle className="h-3.5 w-3.5 text-success" />Verified</>
                        : <><XCircle className="h-3.5 w-3.5 text-warning" /><span className="text-muted-foreground">Pending</span></>}
                    </span>
                    <span className="hidden w-28 text-right text-xs tabular-nums text-muted-foreground md:block" title={formatDate(user.last_sign_in_at)}>{relative(user.last_sign_in_at)}</span>
                    <span className="hidden w-28 text-right text-xs tabular-nums text-muted-foreground md:block" title={formatDate(user.created_at)}>{relative(user.created_at)}</span>
                    <ChevronRight className="hidden h-4 w-4 text-muted-foreground/50 group-hover:text-foreground md:block" />
                  </button>
                ))}
              </div>
            )}
            {totalMatched > USERS_PER_PAGE && (
              <Pagination
                page={safeAuthPage}
                totalPages={totalAuthPages}
                onPage={setAuthPage}
                summary={`${((safeAuthPage - 1) * USERS_PER_PAGE) + 1}–${Math.min(safeAuthPage * USERS_PER_PAGE, totalMatched)} of ${totalMatched.toLocaleString()}`}
              />
            )}
          </>
        )}

        {activeTab === "app" && (
          <>
            <TableHead className="hidden md:flex" columns={[
              { label: "Name", className: "flex-1 min-w-0" },
              { label: "Applications", className: "w-28 text-right" },
              { label: "Success", className: "w-32" },
              { label: "Last active", className: "w-28 text-right" },
              { label: "", className: "w-4" },
            ]} />
            {filteredMockUsers.length === 0 ? (
              <EmptyState icon={UserIcon} title="No profiles found" />
            ) : (
              <div className="divide-y divide-border">
                {filteredMockUsers.map((user) => {
                  const rate = user.totalApps > 0 ? Math.round((user.successfulApps / user.totalApps) * 100) : 0
                  return (
                    <button
                      key={user.id}
                      className="group flex w-full flex-col gap-1.5 px-5 py-3 text-left transition-colors hover:bg-muted/40 md:flex-row md:items-center md:gap-4"
                      onClick={() => setSelectedUser(user)}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar name={user.name} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{user.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                      <span className="w-28 text-xs tabular-nums md:text-right md:text-[13px]">{user.totalApps}</span>
                      <span className="hidden w-32 items-center gap-2 md:flex">
                        <Meter value={rate} tone={rate >= 80 ? "success" : rate >= 50 ? "warning" : "destructive"} className="w-16" />
                        <span className="text-xs tabular-nums">{rate}%</span>
                      </span>
                      <span className="hidden w-28 text-right text-xs text-muted-foreground md:block">{user.lastActive}</span>
                      <ChevronRight className="hidden h-4 w-4 text-muted-foreground/50 group-hover:text-foreground md:block" />
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </Panel>

      {/* Supabase Auth User Detail Modal */}
      <Dialog open={!!selectedAuthUser} onOpenChange={() => setSelectedAuthUser(null)}>
        <DialogContent className="w-[95vw] sm:max-w-xl bg-card border-border">
          {selectedAuthUser && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary shrink-0">
                    {selectedAuthUser.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <DialogTitle className="text-lg">{selectedAuthUser.email}</DialogTitle>
                    <p className="text-xs text-muted-foreground font-mono">{selectedAuthUser.id}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex flex-col gap-5 mt-2">
                {/* Status Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-accent/50 p-3 text-center">
                    <div className="flex items-center justify-center mb-1">
                      {selectedAuthUser.confirmed ? (
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Clock className="h-5 w-5 text-amber-500" />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedAuthUser.confirmed ? "Email Confirmed" : "Pending"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-accent/50 p-3 text-center">
                    <p className="text-sm font-semibold capitalize">{selectedAuthUser.provider}</p>
                    <p className="text-[10px] text-muted-foreground">Provider</p>
                  </div>
                  <div className="rounded-lg bg-accent/50 p-3 text-center">
                    <p className="text-sm font-semibold capitalize">{selectedAuthUser.role || "user"}</p>
                    <p className="text-[10px] text-muted-foreground">Role</p>
                  </div>
                </div>

                {/* Details */}
                <div className="rounded-lg border border-border p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-3">Account Details</h4>
                  <div className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">
                    <span className="text-muted-foreground">User ID</span>
                    <span className="font-mono text-xs break-all">{selectedAuthUser.id}</span>
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium">{selectedAuthUser.email}</span>
                    {selectedAuthUser.phone && (
                      <>
                        <span className="text-muted-foreground">Phone</span>
                        <span className="font-medium">{selectedAuthUser.phone}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Created At</span>
                    <span className="font-medium">{formatDate(selectedAuthUser.created_at)}</span>
                    <span className="text-muted-foreground">Last Sign In</span>
                    <span className="font-medium">{formatDate(selectedAuthUser.last_sign_in_at)}</span>
                    <span className="text-muted-foreground">Email Confirmed</span>
                    <span className="font-medium">{selectedAuthUser.email_confirmed_at ? formatDate(selectedAuthUser.email_confirmed_at) : "Not confirmed"}</span>
                    <span className="text-muted-foreground">Banned</span>
                    <span className="font-medium">{selectedAuthUser.banned ? "Yes" : "No"}</span>
                  </div>
                </div>

                {/* User Metadata */}
                {selectedAuthUser.user_metadata && Object.keys(selectedAuthUser.user_metadata).length > 0 && (
                  <div className="rounded-lg border border-border p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-3">User Metadata</h4>
                    <pre className="text-xs bg-accent/30 p-3 rounded-md overflow-x-auto">
                      {JSON.stringify(selectedAuthUser.user_metadata, null, 2)}
                    </pre>
                  </div>
                )}

                {/* App Metadata */}
                {selectedAuthUser.app_metadata && Object.keys(selectedAuthUser.app_metadata).length > 0 && (
                  <div className="rounded-lg border border-border p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-3">App Metadata</h4>
                    <pre className="text-xs bg-accent/30 p-3 rounded-md overflow-x-auto">
                      {JSON.stringify(selectedAuthUser.app_metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* App User Detail Modal */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border p-0">
          {selectedUser && (
            <UserProfileModal user={selectedUser} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UserProfileModal({ user }: { user: User }) {
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-border">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary shrink-0">
            {user.name.split(" ").map(n => n[0]).join("")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-base sm:text-xl font-semibold">{user.name}</h2>
              <StatusBadge status={user.status} />
            </div>
            <p className="text-sm text-muted-foreground">{user.headline}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {user.email}</span>
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {user.phone}</span>
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {user.location}</span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {[
            { label: "Total Apps", value: user.totalApps, color: "text-foreground" },
            { label: "Successful", value: user.successfulApps, color: "text-success" },
            { label: "Failed", value: user.failedApps, color: "text-destructive" },
            { label: "In Progress", value: user.inProgressApps, color: "text-chart-2" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-accent/50 p-3 text-center">
              <p className={`text-2xl font-semibold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs Content */}
      <Tabs defaultValue="experience" className="flex-1">
        <div className="px-4 sm:px-6 pt-2 border-b border-border">
          <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto scrollbar-hide">
            <TabsList className="bg-transparent gap-4 h-auto p-0 w-max inline-flex">
              <TabsTrigger value="experience" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs gap-1.5 whitespace-nowrap">
                <Briefcase className="h-3 w-3" /> Experience
              </TabsTrigger>
              <TabsTrigger value="education" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs gap-1.5 whitespace-nowrap">
                <GraduationCap className="h-3 w-3" /> Education
              </TabsTrigger>
              <TabsTrigger value="projects" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs gap-1.5 whitespace-nowrap">
                <FolderOpen className="h-3 w-3" /> Projects
              </TabsTrigger>
              <TabsTrigger value="resume" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs gap-1.5 whitespace-nowrap">
                <FileText className="h-3 w-3" /> Resume & Cover Letter
              </TabsTrigger>
              <TabsTrigger value="personal" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs gap-1.5 whitespace-nowrap">
                <UserIcon className="h-3 w-3" /> Personal Info
              </TabsTrigger>
              <TabsTrigger value="biodata" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs gap-1.5 whitespace-nowrap">
                <FileText className="h-3 w-3" /> Overall Biodata
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-4 sm:py-5">
          {/* Work Experience Tab */}
          <TabsContent value="experience" className="mt-0">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold mb-3">Work Experience</h3>
              {user.workExperience.map((exp, i) => (
                <div key={i} className="flex gap-4 pb-5 relative">
                  {i < user.workExperience.length - 1 && (
                    <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
                  )}
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground shrink-0 z-10">
                    {exp.company[0]}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold">{exp.title}</p>
                        <p className="text-xs text-primary">{exp.company}</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-xs text-muted-foreground">{exp.startDate} - {exp.endDate}</p>
                        <p className="text-[10px] text-muted-foreground">{exp.yearsOfExperience} {exp.yearsOfExperience === 1 ? 'year' : 'years'}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{exp.description}</p>
                  </div>
                </div>
              ))}

              <Separator className="my-2" />
              <h3 className="text-sm font-semibold mb-2">Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {user.skills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-[10px] bg-accent text-accent-foreground">{skill}</Badge>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Education Tab */}
          <TabsContent value="education" className="mt-0">
            <h3 className="text-sm font-semibold mb-3">Education</h3>
            <div className="flex flex-col gap-4">
              {user.education.map((edu, i) => (
                <div key={i} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                        <GraduationCap className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{edu.university}</p>
                        <p className="text-xs text-muted-foreground">{edu.degree} in {edu.course}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {edu.startDate} - {edu.endDate}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary shrink-0">
                      GPA: {edu.grade}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="mt-0">
            <h3 className="text-sm font-semibold mb-3">Projects</h3>
            <div className="flex flex-col gap-4">
              {user.projects.map((project, i) => (
                <div key={i} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-semibold">{project.title}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {project.skills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-[10px] bg-accent text-accent-foreground">{skill}</Badge>
                    ))}
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {project.bullets.map((bullet, j) => (
                      <li key={j} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
                        <span className="text-primary mt-0.5 shrink-0">{'>'}</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Resume & Cover Letter Tab */}
          <TabsContent value="resume" className="mt-0">
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Resume Summary</h3>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7">
                    <Download className="h-3 w-3" /> Download Resume
                  </Button>
                </div>
                <div className="rounded-lg border border-border p-4 bg-accent/30">
                  <p className="text-sm leading-relaxed text-muted-foreground">{user.resumeSummary}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3">Resume Preview</h3>
                <div className="rounded-lg border border-border p-5 bg-foreground/5">
                  <div className="text-center mb-4 pb-3 border-b border-border">
                    <h4 className="text-base font-semibold">{user.name}</h4>
                    <p className="text-xs text-muted-foreground">{user.email} | {user.phone} | {user.location}</p>
                    <p className="text-xs text-muted-foreground">{user.linkedinUrl}</p>
                  </div>

                  <div className="mb-3">
                    <h5 className="text-xs font-semibold mb-1">Summary</h5>
                    <p className="text-xs text-muted-foreground leading-relaxed">{user.resumeSummary}</p>
                  </div>

                  <div className="mb-3">
                    <h5 className="text-xs font-semibold mb-1">Experience</h5>
                    {user.workExperience.map((exp, i) => (
                      <div key={i} className="mb-2">
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold">{exp.title} - {exp.company}</span>
                          <span className="text-[10px] text-muted-foreground">{exp.startDate} - {exp.endDate}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{exp.description}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mb-3">
                    <h5 className="text-xs font-semibold mb-1">Education</h5>
                    {user.education.map((edu, i) => (
                      <div key={i} className="mb-1">
                        <div className="flex justify-between">
                          <span className="text-xs font-semibold">{edu.degree} {edu.course} - {edu.university}</span>
                          <span className="text-[10px] text-muted-foreground">{edu.startDate} - {edu.endDate}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">GPA: {edu.grade}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mb-3">
                    <h5 className="text-xs font-semibold mb-1">Projects</h5>
                    {user.projects.map((project, i) => (
                      <div key={i} className="mb-2">
                        <span className="text-xs font-semibold">{project.title}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">({project.skills.join(", ")})</span>
                        <ul className="ml-3">
                          {project.bullets.map((b, j) => (
                            <li key={j} className="text-[11px] text-muted-foreground">- {b}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold mb-1">Skills</h5>
                    <p className="text-xs text-muted-foreground">{user.skills.join(" | ")}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3">Cover Letter</h3>
                <div className="rounded-lg border border-border p-4 bg-accent/30">
                  {user.coverLetter.split('\n').map((line, i) => (
                    <p key={i} className={`text-sm leading-relaxed text-muted-foreground ${line === '' ? 'h-3' : ''}`}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Personal Info Tab */}
          <TabsContent value="personal" className="mt-0">
            <h3 className="text-sm font-semibold mb-3">Personal Information</h3>
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-border p-4">
                <h4 className="text-xs font-semibold text-muted-foreground mb-3">Contact Details</h4>
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </div>
                  <span className="font-medium">{user.email}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> Phone
                  </div>
                  <span className="font-medium">{user.phone}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> Location
                  </div>
                  <span className="font-medium">{user.location}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="h-3.5 w-3.5" /> LinkedIn
                  </div>
                  <span className="font-medium text-primary">{user.linkedinUrl}</span>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h4 className="text-xs font-semibold text-muted-foreground mb-3">Demographic Information</h4>
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UserIcon className="h-3.5 w-3.5" /> Gender
                  </div>
                  <span className="font-medium">{user.gender}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Heart className="h-3.5 w-3.5" /> Ethnicity / Race
                  </div>
                  <span className="font-medium">{user.ethnicity}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Shield className="h-3.5 w-3.5" /> Disability Status
                  </div>
                  <span className="font-medium">{user.disabilityStatus}</span>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h4 className="text-xs font-semibold text-muted-foreground mb-3">Account Details</h4>
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <span className="text-muted-foreground">User ID</span>
                  <span className="font-mono text-xs">{user.id}</span>
                  <span className="text-muted-foreground">Experience</span>
                  <span className="font-medium">{user.experience}</span>
                  <span className="text-muted-foreground">Joined</span>
                  <span className="font-medium">{user.joinedAt}</span>
                  <span className="text-muted-foreground">Last Active</span>
                  <span className="font-medium">{user.lastActive}</span>
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge status={user.status} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button size="sm" variant="outline" className="text-xs gap-1.5">
                  <Mail className="h-3 w-3" /> Email User
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1.5">
                  <ExternalLink className="h-3 w-3" /> View LinkedIn
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1.5 text-destructive">
                  <Ban className="h-3 w-3" /> Suspend
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1.5 text-destructive">
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </div>
            </div>
          </TabsContent>
          {/* Overall Biodata Tab */}
          <TabsContent value="biodata" className="mt-0">
            <div className="flex flex-col gap-5">
              {/* Full Biodata Header */}
              <div className="rounded-lg border border-border p-5 bg-foreground/5">
                <div className="text-center mb-4 pb-3 border-b border-border">
                  <h3 className="text-lg font-semibold">{user.name}</h3>
                  <p className="text-sm text-muted-foreground">{user.headline}</p>
                  <p className="text-xs text-muted-foreground mt-1">{user.email} | {user.phone} | {user.location}</p>
                  <p className="text-xs text-primary mt-0.5">{user.linkedinUrl}</p>
                </div>

                {/* Summary */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold mb-1.5">Professional Summary</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{user.resumeSummary}</p>
                </div>

                <Separator className="my-3" />

                {/* Personal Information */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold mb-2">Personal Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-2 gap-y-1.5 text-sm">
                    <span className="text-muted-foreground">Gender</span><span className="font-medium sm:col-span-2">{user.gender}</span>
                    <span className="text-muted-foreground">Ethnicity</span><span className="font-medium col-span-2">{user.ethnicity}</span>
                    <span className="text-muted-foreground">Disability</span><span className="font-medium col-span-2">{user.disabilityStatus}</span>
                    <span className="text-muted-foreground">Experience</span><span className="font-medium col-span-2">{user.experience}</span>
                    <span className="text-muted-foreground">Joined</span><span className="font-medium col-span-2">{user.joinedAt}</span>
                  </div>
                </div>

                <Separator className="my-3" />

                {/* Work Experience */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold mb-2">Work Experience</h4>
                  {user.workExperience.map((exp, i) => (
                    <div key={i} className="mb-3">
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold">{exp.title} - {exp.company}</span>
                        <span className="text-[10px] text-muted-foreground">{exp.startDate} - {exp.endDate} ({exp.yearsOfExperience}y)</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{exp.description}</p>
                    </div>
                  ))}
                </div>

                <Separator className="my-3" />

                {/* Education */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold mb-2">Education</h4>
                  {user.education.map((edu, i) => (
                    <div key={i} className="mb-2">
                      <div className="flex justify-between">
                        <span className="text-xs font-semibold">{edu.degree} in {edu.course} - {edu.university}</span>
                        <span className="text-[10px] text-muted-foreground">{edu.startDate} - {edu.endDate}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">GPA: {edu.grade}</p>
                    </div>
                  ))}
                </div>

                <Separator className="my-3" />

                {/* Projects */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold mb-2">Projects</h4>
                  {user.projects.map((project, i) => (
                    <div key={i} className="mb-3">
                      <span className="text-xs font-semibold">{project.title}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">({project.skills.join(", ")})</span>
                      <ul className="ml-3 mt-0.5">
                        {project.bullets.map((b, j) => (
                          <li key={j} className="text-[11px] text-muted-foreground">- {b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <Separator className="my-3" />

                {/* Skills */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold mb-2">Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {user.skills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-[10px] bg-accent text-accent-foreground">{skill}</Badge>
                    ))}
                  </div>
                </div>

                <Separator className="my-3" />

                {/* Resume */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold">Resume</h4>
                    <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7">
                      <Download className="h-3 w-3" /> Download PDF
                    </Button>
                  </div>
                  <div className="rounded-lg border border-border p-4 bg-accent/30">
                    <p className="text-xs leading-relaxed text-muted-foreground">{user.resumeSummary}</p>
                  </div>
                </div>

                <Separator className="my-3" />

                {/* Cover Letter */}
                <div>
                  <h4 className="text-xs font-semibold mb-2">Cover Letter</h4>
                  <div className="rounded-lg border border-border p-4 bg-accent/30">
                    {user.coverLetter.split('\n').map((line, i) => (
                      <p key={i} className={`text-sm leading-relaxed text-muted-foreground ${line === '' ? 'h-3' : ''}`}>
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
