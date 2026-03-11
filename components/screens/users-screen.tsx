"use client"

import { useState } from "react"
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

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function UsersScreen() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedAuthUser, setSelectedAuthUser] = useState<SupabaseAuthUser | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"auth" | "app">("auth")

  const { data: authUsers = [], isLoading: authLoading, mutate: refreshAuth } = useSWR<SupabaseAuthUser[]>(
    "/api/users",
    fetcher,
    { fallbackData: [], revalidateOnFocus: false }
  )

  const filteredMockUsers = mockUsers.filter((user) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      user.name.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      user.headline.toLowerCase().includes(q)
    )
  })

  const filteredAuthUsers = (Array.isArray(authUsers) ? authUsers : []).filter((user) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return user.email.toLowerCase().includes(q) || user.id.toLowerCase().includes(q)
  })

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage registered users from Supabase Authentication and app data</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
            {activeTab === "auth" ? `${filteredAuthUsers.length} auth users` : `${filteredMockUsers.length} app users`}
          </Badge>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            className={`px-4 py-2 text-xs font-medium transition-colors ${activeTab === "auth" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"}`}
            onClick={() => setActiveTab("auth")}
          >
            Supabase Auth Users
          </button>
          <button
            className={`px-4 py-2 text-xs font-medium transition-colors ${activeTab === "app" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"}`}
            onClick={() => setActiveTab("app")}
          >
            App Users (Mock)
          </button>
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." className="pl-9 bg-card border-border" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        {activeTab === "auth" && (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => refreshAuth()}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Download className="h-3 w-3" /> Export CSV
        </Button>
      </div>

      {/* Supabase Auth Users */}
      {activeTab === "auth" && (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_40px] gap-4 px-4 py-3 border-b border-border text-xs text-muted-foreground uppercase tracking-wider font-medium">
              <span>Email</span>
              <span>Provider</span>
              <span>Confirmed</span>
              <span>Last Sign In</span>
              <span>Created</span>
              <span></span>
            </div>
            <div className="divide-y divide-border">
              {authLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading users from Supabase...</p>
                  </div>
                </div>
              ) : filteredAuthUsers.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <UserIcon className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No users found in Supabase Authentication</p>
                    <p className="text-xs text-muted-foreground">Users will appear here once they sign up through your app</p>
                  </div>
                </div>
              ) : (
                filteredAuthUsers.map((user) => (
                  <div
                    key={user.id}
                    className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_40px] gap-2 md:gap-4 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer items-center"
                    onClick={() => setSelectedAuthUser(user)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground shrink-0">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{user.email}</p>
                        <p className="text-[11px] text-muted-foreground font-mono md:hidden">{user.id.slice(0, 8)}...</p>
                      </div>
                    </div>
                    <div className="hidden md:block">
                      <Badge variant="secondary" className="text-[10px] bg-accent text-accent-foreground">
                        {user.provider}
                      </Badge>
                    </div>
                    <div className="hidden md:flex items-center gap-1">
                      {user.confirmed ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-amber-500" />
                      )}
                      <span className="text-xs">{user.confirmed ? "Yes" : "No"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground hidden md:block">
                      {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : "Never"}
                    </span>
                    <span className="text-xs text-muted-foreground hidden md:block">
                      {formatDate(user.created_at)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground hidden md:block" />
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* App Users (Mock) */}
      {activeTab === "app" && (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="hidden md:grid grid-cols-[2fr_2fr_1fr_1fr_1fr_40px] gap-4 px-4 py-3 border-b border-border text-xs text-muted-foreground uppercase tracking-wider font-medium">
              <span>Name</span>
              <span>Email</span>
              <span>Applications</span>
              <span>Success Rate</span>
              <span>Last Active</span>
              <span></span>
            </div>
            <div className="divide-y divide-border">
              {filteredMockUsers.map((user) => (
                <div
                  key={user.id}
                  className="grid grid-cols-1 md:grid-cols-[2fr_2fr_1fr_1fr_1fr_40px] gap-2 md:gap-4 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer items-center"
                  onClick={() => setSelectedUser(user)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground shrink-0">
                      {user.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-[11px] text-muted-foreground md:hidden">{user.email}</p>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground hidden md:block truncate">{user.email}</span>
                  <span className="text-sm font-medium hidden md:block">{user.totalApps}</span>
                  <div className="hidden md:block">
                    <span className="text-sm font-medium">{user.totalApps > 0 ? Math.round((user.successfulApps / user.totalApps) * 100) : 0}%</span>
                    <span className="text-[11px] text-muted-foreground ml-1">({user.successfulApps}/{user.totalApps})</span>
                  </div>
                  <span className="text-xs text-muted-foreground hidden md:block">{user.lastActive}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground hidden md:block" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Supabase Auth User Detail Modal */}
      <Dialog open={!!selectedAuthUser} onOpenChange={() => setSelectedAuthUser(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto bg-card border-border">
          {selectedAuthUser && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary shrink-0">
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
                <div className="grid grid-cols-3 gap-3">
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
                    <p className="text-sm font-bold capitalize">{selectedAuthUser.provider}</p>
                    <p className="text-[10px] text-muted-foreground">Provider</p>
                  </div>
                  <div className="rounded-lg bg-accent/50 p-3 text-center">
                    <p className="text-sm font-bold capitalize">{selectedAuthUser.role || "user"}</p>
                    <p className="text-[10px] text-muted-foreground">Role</p>
                  </div>
                </div>

                {/* Details */}
                <div className="rounded-lg border border-border p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Account Details</h4>
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
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">User Metadata</h4>
                    <pre className="text-xs bg-accent/30 p-3 rounded-md overflow-x-auto">
                      {JSON.stringify(selectedAuthUser.user_metadata, null, 2)}
                    </pre>
                  </div>
                )}

                {/* App Metadata */}
                {selectedAuthUser.app_metadata && Object.keys(selectedAuthUser.app_metadata).length > 0 && (
                  <div className="rounded-lg border border-border p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">App Metadata</h4>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border p-0">
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
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary shrink-0">
            {user.name.split(" ").map(n => n[0]).join("")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-semibold">{user.name}</h2>
              <StatusBadge status={user.status} />
            </div>
            <p className="text-sm text-muted-foreground">{user.headline}</p>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {user.email}</span>
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {user.phone}</span>
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {user.location}</span>
              <span className="flex items-center gap-1"><LinkIcon className="h-3 w-3" /> {user.linkedinUrl}</span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { label: "Total Apps", value: user.totalApps, color: "text-foreground" },
            { label: "Successful", value: user.successfulApps, color: "text-success" },
            { label: "Failed", value: user.failedApps, color: "text-destructive" },
            { label: "In Progress", value: user.inProgressApps, color: "text-chart-2" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-accent/50 p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs Content */}
      <Tabs defaultValue="experience" className="flex-1">
        <div className="px-6 pt-2 border-b border-border">
          <TabsList className="bg-transparent gap-4 h-auto p-0">
            <TabsTrigger value="experience" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs gap-1.5">
              <Briefcase className="h-3 w-3" /> Experience
            </TabsTrigger>
            <TabsTrigger value="education" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs gap-1.5">
              <GraduationCap className="h-3 w-3" /> Education
            </TabsTrigger>
            <TabsTrigger value="projects" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs gap-1.5">
              <FolderOpen className="h-3 w-3" /> Projects
            </TabsTrigger>
            <TabsTrigger value="resume" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs gap-1.5">
              <FileText className="h-3 w-3" /> Resume & Cover Letter
            </TabsTrigger>
            <TabsTrigger value="personal" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs gap-1.5">
              <UserIcon className="h-3 w-3" /> Personal Info
            </TabsTrigger>
            <TabsTrigger value="biodata" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs gap-1.5">
              <FileText className="h-3 w-3" /> Overall Biodata
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="px-6 py-5">
          {/* Work Experience Tab */}
          <TabsContent value="experience" className="mt-0">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold mb-3">Work Experience</h3>
              {user.workExperience.map((exp, i) => (
                <div key={i} className="flex gap-4 pb-5 relative">
                  {i < user.workExperience.length - 1 && (
                    <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
                  )}
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground shrink-0 z-10">
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
                    <h4 className="text-base font-bold">{user.name}</h4>
                    <p className="text-xs text-muted-foreground">{user.email} | {user.phone} | {user.location}</p>
                    <p className="text-xs text-muted-foreground">{user.linkedinUrl}</p>
                  </div>

                  <div className="mb-3">
                    <h5 className="text-xs font-bold uppercase tracking-wider mb-1">Summary</h5>
                    <p className="text-xs text-muted-foreground leading-relaxed">{user.resumeSummary}</p>
                  </div>

                  <div className="mb-3">
                    <h5 className="text-xs font-bold uppercase tracking-wider mb-1">Experience</h5>
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
                    <h5 className="text-xs font-bold uppercase tracking-wider mb-1">Education</h5>
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
                    <h5 className="text-xs font-bold uppercase tracking-wider mb-1">Projects</h5>
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
                    <h5 className="text-xs font-bold uppercase tracking-wider mb-1">Skills</h5>
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
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact Details</h4>
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
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Demographic Information</h4>
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
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Account Details</h4>
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

              <div className="flex items-center gap-2 pt-2">
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
                  <h3 className="text-lg font-bold">{user.name}</h3>
                  <p className="text-sm text-muted-foreground">{user.headline}</p>
                  <p className="text-xs text-muted-foreground mt-1">{user.email} | {user.phone} | {user.location}</p>
                  <p className="text-xs text-primary mt-0.5">{user.linkedinUrl}</p>
                </div>

                {/* Summary */}
                <div className="mb-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-1.5">Professional Summary</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{user.resumeSummary}</p>
                </div>

                <Separator className="my-3" />

                {/* Personal Information */}
                <div className="mb-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Personal Information</h4>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-muted-foreground">Gender</span><span className="font-medium col-span-2">{user.gender}</span>
                    <span className="text-muted-foreground">Ethnicity</span><span className="font-medium col-span-2">{user.ethnicity}</span>
                    <span className="text-muted-foreground">Disability</span><span className="font-medium col-span-2">{user.disabilityStatus}</span>
                    <span className="text-muted-foreground">Experience</span><span className="font-medium col-span-2">{user.experience}</span>
                    <span className="text-muted-foreground">Joined</span><span className="font-medium col-span-2">{user.joinedAt}</span>
                  </div>
                </div>

                <Separator className="my-3" />

                {/* Work Experience */}
                <div className="mb-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Work Experience</h4>
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
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Education</h4>
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
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Projects</h4>
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
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Skills</h4>
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
                    <h4 className="text-xs font-bold uppercase tracking-wider">Resume</h4>
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
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Cover Letter</h4>
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
