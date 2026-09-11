"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Bell, Users, CheckCircle, Loader2, Calendar, Smartphone, ChevronDown, ChevronUp, Search, X } from "lucide-react"
import { toast } from "sonner"

const SUPABASE_URL = "https://widujxpahzlpegzjjpqp.supabase.co"
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZHVqeHBhaHpscGVnempqcHFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc1MjY2MiwiZXhwIjoyMDg3MzI4NjYyfQ.6KGHcAofT7nFX03JII8yLiEagZfOXWY_0YbEepEf55M"
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZHVqeHBhaHpscGVnempqcHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NTI2NjIsImV4cCI6MjA4NzMyODY2Mn0.OyjX0Qg4UlDPfTmCwhdK3JuE30698f6A-a01LunhDtM"

const SUPABASE_HEADERS = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
}

const TEMPLATES: { category: string; items: { title: string; body: string; screen?: string }[] }[] = [
  {
    category: "Job Alerts",
    items: [
      { title: "New Jobs Just Dropped", body: "50+ new roles added today. Swipe now before they're gone!", screen: "/(tabs)" },
      { title: "Jobs Matched for You", body: "We found 12 new roles that match your profile. Check them out now!", screen: "/(tabs)" },
      { title: "Urgent Hiring Alert", body: "3 companies are hiring urgently in your field. Apply before slots fill up!", screen: "/(tabs)" },
      { title: "Top Companies Are Hiring", body: "Google, Microsoft & more just posted new openings. Don't miss out!", screen: "/(tabs)" },
      { title: "Jobs Near You", body: "New local opportunities just posted in your area. Tap to explore.", screen: "/(tabs)" },
      { title: "Remote Jobs Available", body: "Work from anywhere — 20+ remote roles added this week. Swipe to explore.", screen: "/(tabs)" },
      { title: "Internship Alert", body: "Fresh internship openings from top startups. Apply now before they close!", screen: "/(tabs)" },
    ],
  },
  {
    category: "Engagement",
    items: [
      { title: "We Miss You", body: "You haven't swiped in a while. New jobs are waiting — come back and explore!", screen: "/(tabs)" },
      { title: "Don't Let Opportunities Slip", body: "You have saved jobs expiring soon. Review them before they're gone.", screen: "/saved-jobs" },
      { title: "Your Profile is 80% Complete", body: "Complete your profile to get better job matches and stand out to recruiters.", screen: "/(tabs)" },
      { title: "Your Weekly Job Report", body: "You swiped 24 jobs this week. Here's how you're doing — tap to see your stats.", screen: "/(tabs)" },
      { title: "You're on a Streak", body: "3 days in a row! Keep swiping to maintain your job hunt momentum.", screen: "/(tabs)" },
      { title: "Tip of the Day", body: "Profiles with a photo get 3x more recruiter views. Add yours today!", screen: "/(tabs)" },
      { title: "New Activity on Your Application", body: "A recruiter viewed your application. Stay ready — an interview could be next!", screen: "/(tabs)" },
    ],
  },
  {
    category: "Premium & Promotions",
    items: [
      { title: "Special Offer Just for You", body: "Upgrade to Premium today and get 30% off. Limited time only!", screen: "/premium" },
      { title: "Go Premium — Unlock Everything", body: "Auto-apply, priority matching, and more. Try Premium free for 7 days.", screen: "/premium" },
      { title: "Flash Sale: 50% Off Premium", body: "Today only — upgrade to Premium at half price. Offer ends at midnight!", screen: "/premium" },
      { title: "Premium Members Get Hired Faster", body: "Premium users get 4x more interviews. Upgrade now and get ahead.", screen: "/premium" },
      { title: "Student Discount Available", body: "Are you a student? Get Premium at 60% off with your college email.", screen: "/premium" },
      { title: "Your Free Trial is Waiting", body: "You haven't tried Premium yet. Start your free 7-day trial — no card needed.", screen: "/premium" },
    ],
  },
  {
    category: "Announcements",
    items: [
      { title: "Big Update Just Dropped", body: "We've launched new features to make your job hunt faster. Tap to explore what's new.", screen: "/(tabs)" },
      { title: "Scheduled Maintenance Tonight", body: "The app will be briefly unavailable from 2–3 AM IST for upgrades. Plan accordingly.", screen: "/(tabs)" },
      { title: "NextQuark Turns 1", body: "We're celebrating our first anniversary with special offers. Thank you for being with us!", screen: "/(tabs)" },
      { title: "New Feature: Auto-Apply is Live", body: "Let NextQuark apply to jobs for you automatically. Set it up in 2 minutes!", screen: "/(tabs)" },
      { title: "We've Partnered with 50+ Companies", body: "Exclusive job listings from our new partners are now live. Check them out!", screen: "/(tabs)" },
      { title: "App Update Available", body: "Version 2.0 is here with a faster UI and smarter job matching. Update now!", screen: "/(tabs)" },
    ],
  },
  {
    category: "Reminders",
    items: [
      { title: "Complete Your Pending Applications", body: "You started 3 applications but didn't finish. Complete them now before they expire.", screen: "/(tabs)" },
      { title: "Update Your Resume", body: "Your resume hasn't been updated in 30 days. Keep it fresh to attract recruiters.", screen: "/(tabs)" },
      { title: "Interview Prep Reminder", body: "You have a potential interview coming up. Check our prep resources to get ready.", screen: "/(tabs)" },
      { title: "Weekly Goal Check-In", body: "How's your job hunt going? You set a goal of 10 applications this week. Keep pushing!", screen: "/(tabs)" },
      { title: "Respond to Recruiter Messages", body: "You have unread messages from recruiters. Don't leave them waiting!", screen: "/(tabs)" },
      { title: "Review Your Saved Jobs", body: "You have 8 saved jobs you haven't applied to yet. Now's a good time to review them.", screen: "/saved-jobs" },
    ],
  },
]

const NOTIFICATION_TYPES = [
  {
    id: "announcement",
    label: "Announcement",
    title: "Important Announcement",
    body: "We have an important update for you. Tap to read more.",
  },
  {
    id: "job_alert",
    label: "Job Alert",
    title: "New Jobs Just Dropped",
    body: "50+ new roles added today. Swipe now before they're gone!",
  },
  {
    id: "promotion",
    label: "Promotion",
    title: "Special Offer Just for You",
    body: "Upgrade to Premium today and get 30% off. Limited time only!",
  },
  {
    id: "reminder",
    label: "Reminder",
    title: "Don't Forget",
    body: "You have pending applications waiting. Complete them now.",
  },
]

const DEEP_LINK_OPTIONS = [
  { label: "Home", value: "/(tabs)" },
  { label: "Premium", value: "/premium" },
  { label: "Discover", value: "/discover" },
  { label: "Saved Jobs", value: "/saved-jobs" },
  { label: "Custom", value: "__custom__" },
]

interface RecentNotification {
  id: string
  title: string
  body: string
  type: string
  target_user_id: string | null
  sent_at: string | null
  created_at: string
  data: { tokenCount?: number } | null
}

function CharCount({ value, max }: { value: string; max: number }) {
  const remaining = max - value.length
  const isWarning = remaining < 20
  return (
    <span className={`text-[11px] tabular-nums ${isWarning ? "text-destructive font-medium" : "text-muted-foreground"}`}>
      {value.length}/{max}
    </span>
  )
}

function IOSPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-3 shadow-lg">
      <div className="flex items-start gap-2.5">
        <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <Bell className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wide">NextQuark</span>
            <span className="text-[10px] text-white/50">now</span>
          </div>
          <p className="text-xs font-semibold text-white leading-tight truncate">
            {title || "Notification title"}
          </p>
          <p className="text-[11px] text-white/70 leading-snug mt-0.5 line-clamp-2">
            {body || "Your message will appear here..."}
          </p>
        </div>
      </div>
    </div>
  )
}

function AndroidPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg bg-[#1e1e1e] border border-white/10 p-3 shadow-lg">
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
          <Bell className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-white/60 uppercase tracking-wide">NextQuark</span>
            <span className="text-[10px] text-white/40">Just now</span>
          </div>
          <p className="text-xs font-bold text-white leading-tight mt-0.5 truncate">
            {title || "Notification title"}
          </p>
          <p className="text-[11px] text-white/60 leading-snug mt-0.5 line-clamp-2">
            {body || "Your message will appear here..."}
          </p>
        </div>
      </div>
    </div>
  )
}

export function NotificationsScreen() {
  const [tokenCount, setTokenCount] = useState<number | null>(null)
  const [recentNotifs, setRecentNotifs] = useState<RecentNotification[]>([])
  const [recentLoading, setRecentLoading] = useState(true)

  // Form state
  const [notifType, setNotifType] = useState("announcement")
  const [title, setTitle] = useState(NOTIFICATION_TYPES[0].title)
  const [body, setBody] = useState(NOTIFICATION_TYPES[0].body)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [audience, setAudience] = useState<"all" | "specific">("all")
  const [targetUserId, setTargetUserId] = useState("")
  const [targetUserInfo, setTargetUserInfo] = useState<{ id: string; full_name: string; email: string } | null>(null)
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [userSearchResults, setUserSearchResults] = useState<{ id: string; full_name: string; email: string }[]>([])
  const [targetUserLoading, setTargetUserLoading] = useState(false)
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const [deepLinkOption, setDeepLinkOption] = useState("/(tabs)")
  const [customScreen, setCustomScreen] = useState("")
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now")
  const [scheduleDate, setScheduleDate] = useState("")
  const [scheduleTime, setScheduleTime] = useState("")

  // Send state
  const [sending, setSending] = useState(false)
  const [successBanner, setSuccessBanner] = useState<{ devices: number } | null>(null)
  const [debugLog, setDebugLog] = useState<{ ts: string; type: "info" | "error" | "warn"; msg: string }[]>([])
  const [debugOpen, setDebugOpen] = useState(false)

  function log(type: "info" | "error" | "warn", msg: string) {
    setDebugLog((prev) => [...prev, { ts: new Date().toISOString().slice(11, 23), type, msg }])
    setDebugOpen(true)
  }

  const userLookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/user_push_tokens?select=count`, { headers: SUPABASE_HEADERS })
      .then((r) => r.json())
      .then((d) => setTokenCount(Number(d?.[0]?.count ?? 0)))
      .catch(() => {})

    fetchRecentNotifs()
  }, [])

  async function fetchRecentNotifs() {
    setRecentLoading(true)
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/notifications?select=*&order=created_at.desc&limit=10`,
        { headers: SUPABASE_HEADERS }
      )
      const data = await res.json()
      setRecentNotifs(Array.isArray(data) ? data : [])
    } catch {
      setRecentNotifs([])
    }
    setRecentLoading(false)
  }

  function handleTemplateSelect(tpl: { title: string; body: string; screen?: string }) {
    setTitle(tpl.title.slice(0, 100))
    setBody(tpl.body.slice(0, 300))
    if (tpl.screen) {
      const match = DEEP_LINK_OPTIONS.find((o) => o.value === tpl.screen)
      setDeepLinkOption(match ? tpl.screen : "__custom__")
      if (!match) setCustomScreen(tpl.screen)
    }
    setTemplatesOpen(false)
  }

  function handleTypeSelect(typeId: string) {
    setNotifType(typeId)
    const preset = NOTIFICATION_TYPES.find((t) => t.id === typeId)
    if (preset) {
      setTitle(preset.title)
      setBody(preset.body)
    }
  }

  function handleUserSearchChange(val: string) {
    setUserSearchQuery(val)
    setUserDropdownOpen(true)
    if (userLookupTimer.current) clearTimeout(userLookupTimer.current)
    if (!val.trim() || val.length < 2) { setUserSearchResults([]); return }
    userLookupTimer.current = setTimeout(async () => {
      setTargetUserLoading(true)
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?select=id,full_name,email&full_name=ilike.*${encodeURIComponent(val.trim())}*&limit=8`,
          { headers: SUPABASE_HEADERS }
        )
        const data = await res.json()
        setUserSearchResults(Array.isArray(data) ? data : [])
      } catch {
        setUserSearchResults([])
      }
      setTargetUserLoading(false)
    }, 350)
  }

  function handleUserSelect(user: { id: string; full_name: string; email: string }) {
    setTargetUserId(user.id)
    setTargetUserInfo(user)
    setUserSearchQuery(user.full_name || user.email)
    setUserSearchResults([])
    setUserDropdownOpen(false)
  }

  function handleClearUser() {
    setTargetUserId("")
    setTargetUserInfo(null)
    setUserSearchQuery("")
    setUserSearchResults([])
  }

  const resolvedScreen = deepLinkOption === "__custom__" ? customScreen : deepLinkOption

  async function handleSend() {
    if (!title.trim() || !body.trim()) { toast.error("Title and body are required"); return }
    setSending(true)
    setSuccessBanner(null)
    setDebugLog([])
    setDebugOpen(true)

    const payload = {
      title: title.trim(),
      body: body.trim(),
      targetUserId: audience === "specific" && targetUserId.trim() ? targetUserId.trim() : null,
      data: resolvedScreen ? { screen: resolvedScreen } : undefined,
    }
    log("info", `Sending to: ${SUPABASE_URL}/functions/v1/send-notification`)
    log("info", `Payload: ${JSON.stringify(payload)}`)
    log("info", `Audience: ${audience === "specific" ? `specific user — ${targetUserId}` : "broadcast (all users)"}`)

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      log("info", `HTTP status: ${res.status} ${res.statusText}`)

      const raw = await res.text()
      log("info", `Raw response: ${raw}`)

      if (!res.ok) throw new Error(raw)

      const result = JSON.parse(raw)

      log("info", `Token count: ${result?.tokenCount ?? 0}`)

      if (result?.results) {
        result.results.forEach((chunk: any, ci: number) => {
          const tickets = chunk?.data ?? []
          tickets.forEach((ticket: any, ti: number) => {
            if (ticket.status === "ok") {
              log("info", `Token [chunk ${ci}, #${ti}] — OK, receipt id: ${ticket.id}`)
            } else {
              log("error", `Token [chunk ${ci}, #${ti}] — ${ticket.status}: ${ticket.message ?? ""} (${ticket.details?.error ?? ""})`)
            }
          })
          if (tickets.length === 0) log("warn", `Chunk ${ci}: no ticket data returned — ${JSON.stringify(chunk)}`)
        })
      }

      if (result?.message) log("warn", `Edge fn message: ${result.message}`)

      const devices = result?.tokenCount ?? tokenCount ?? 0
      setSuccessBanner({ devices })
      toast.success(audience === "specific" ? "Notification sent to user!" : `Broadcast sent to ${devices} devices`)
      fetchRecentNotifs()
    } catch (e: any) {
      log("error", `Failed: ${e.message}`)
      toast.error(e.message || "Failed to send notification")
    }
    setSending(false)
  }

  const canSend = title.trim().length > 0 && body.trim().length > 0 && !sending

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gradient">Notification Manager</h1>
          <p className="text-sm text-muted-foreground">Compose and broadcast push notifications to your users</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 self-start sm:self-auto">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {tokenCount === null ? "Loading..." : <><span className="font-semibold text-foreground">{tokenCount}</span> registered devices</>}
          </span>
        </div>
      </div>

      {/* Success Banner */}
      {successBanner && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-sm font-medium text-emerald-400">
            ✓ Sent to {successBanner.devices} devices
          </span>
          <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setSuccessBanner(null)}>Dismiss</button>
        </div>
      )}

      {/* Main two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* LEFT — Compose */}
        <div className="flex flex-col gap-5">
          {/* Templates */}
          <Card>
            <CardHeader className="pb-3">
              <button
                className="flex items-center justify-between w-full text-left"
                onClick={() => setTemplatesOpen((v) => !v)}
              >
                <CardTitle className="text-sm font-semibold">Templates</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">35 templates across 5 categories</span>
                  {templatesOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
            </CardHeader>
            {templatesOpen && (
              <CardContent className="space-y-5 pt-0">
                {TEMPLATES.map((cat) => (
                  <div key={cat.category}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat.category}</p>
                    <div className="flex flex-col gap-1.5">
                      {cat.items.map((tpl) => (
                        <button
                          key={tpl.title}
                          onClick={() => handleTemplateSelect(tpl)}
                          className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:border-primary/50 hover:bg-primary/5 transition-colors group"
                        >
                          <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{tpl.title}</span>
                          <span className="text-[11px] text-muted-foreground line-clamp-1">{tpl.body}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>

          {/* Notification Type */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Notification Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {NOTIFICATION_TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTypeSelect(t.id)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors text-left ${
                      notifType === t.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Compose */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Compose</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Title</Label>
                  <CharCount value={title} max={100} />
                </div>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                  placeholder="e.g. New jobs just dropped! 🔥"
                  className="bg-card"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Message</Label>
                  <CharCount value={body} max={300} />
                </div>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, 300))}
                  placeholder="Your message here..."
                  rows={3}
                  className="bg-card resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Target Audience */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Target Audience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2">
                <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${audience === "all" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}>
                  <input type="radio" className="accent-primary" checked={audience === "all"} onChange={() => setAudience("all")} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">All Users</p>
                    <p className="text-xs text-muted-foreground">
                      Broadcast to all {tokenCount !== null ? <span className="font-semibold text-foreground">{tokenCount}</span> : "—"} registered devices
                    </p>
                  </div>
                </label>
                <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${audience === "specific" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}>
                  <input type="radio" className="accent-primary" checked={audience === "specific"} onChange={() => setAudience("specific")} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Specific User</p>
                    <p className="text-xs text-muted-foreground">Search and target a single user by name</p>
                  </div>
                </label>
              </div>

              {audience === "specific" && (
                <div className="space-y-2 pt-1">
                  {targetUserInfo ? (
                    <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <div className="flex-1 text-xs">
                        <span className="font-medium text-foreground">{targetUserInfo.full_name || "Unknown"}</span>
                        <span className="text-muted-foreground ml-1.5">{targetUserInfo.email}</span>
                      </div>
                      <button onClick={handleClearUser} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={userSearchQuery}
                        onChange={(e) => handleUserSearchChange(e.target.value)}
                        onFocus={() => userSearchQuery.length >= 2 && setUserDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setUserDropdownOpen(false), 150)}
                        placeholder="Search by name..."
                        className="bg-card pl-8 pr-8 text-sm"
                      />
                      {targetUserLoading && (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                      {userDropdownOpen && userSearchResults.length > 0 && (
                        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                          {userSearchResults.map((u) => (
                            <button
                              key={u.id}
                              onMouseDown={() => handleUserSelect(u)}
                              className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-accent transition-colors"
                            >
                              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                                {(u.full_name || u.email).charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{u.full_name || "—"}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {userDropdownOpen && !targetUserLoading && userSearchQuery.length >= 2 && userSearchResults.length === 0 && (
                        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border border-border bg-card shadow-lg px-3 py-3">
                          <p className="text-xs text-muted-foreground">No users found for "{userSearchQuery}"</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deep Link + Schedule */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Deep Link</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={deepLinkOption} onValueChange={setDeepLinkOption}>
                  <SelectTrigger className="bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEEP_LINK_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {deepLinkOption === "__custom__" && (
                  <Input
                    value={customScreen}
                    onChange={(e) => setCustomScreen(e.target.value)}
                    placeholder="e.g. /profile"
                    className="bg-card font-mono text-xs"
                  />
                )}
                {deepLinkOption !== "__custom__" && (
                  <p className="text-[11px] text-muted-foreground font-mono">{deepLinkOption}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Schedule</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${scheduleMode === "now" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"}`}
                    onClick={() => setScheduleMode("now")}
                  >
                    Send Now
                  </button>
                  <button
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${scheduleMode === "later" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent"}`}
                    onClick={() => setScheduleMode("later")}
                  >
                    Schedule
                  </button>
                </div>
                {scheduleMode === "later" && (
                  <div className="space-y-2">
                    <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="bg-card text-xs" />
                    <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="bg-card text-xs" />
                    <p className="text-[11px] text-amber-500 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Scheduling is informational only — send manually at the right time
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Send Button */}
          <Button onClick={handleSend} disabled={!canSend} size="lg" className="w-full gap-2">
            {sending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
            ) : (
              <><Bell className="h-4 w-4" /> {scheduleMode === "later" ? "Schedule Notification" : audience === "specific" ? "Send to User" : "Broadcast to All Users"}</>
            )}
          </Button>

          {/* Debug Log */}
          {debugLog.length > 0 && (
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <button
                  className="flex items-center justify-between w-full text-left"
                  onClick={() => setDebugOpen((v) => !v)}
                >
                  <CardTitle className="text-sm font-semibold font-mono">Debug Log</CardTitle>
                  <div className="flex items-center gap-2">
                    {debugLog.some((l) => l.type === "error") && (
                      <Badge variant="destructive" className="text-[10px]">errors</Badge>
                    )}
                    {debugLog.some((l) => l.type === "warn") && !debugLog.some((l) => l.type === "error") && (
                      <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">warnings</Badge>
                    )}
                    {debugOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
              </CardHeader>
              {debugOpen && (
                <CardContent className="pt-0">
                  <div className="rounded-lg bg-black/40 border border-border/40 p-3 font-mono text-[11px] space-y-1 max-h-64 overflow-y-auto">
                    {debugLog.map((entry, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-muted-foreground shrink-0">{entry.ts}</span>
                        <span className={entry.type === "error" ? "text-red-400" : entry.type === "warn" ? "text-amber-400" : "text-emerald-400"}>
                          [{entry.type.toUpperCase()}]
                        </span>
                        <span className="text-foreground/80 break-all">{entry.msg}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    className="mt-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setDebugLog([])}
                  >
                    Clear log
                  </button>
                </CardContent>
              )}
            </Card>
          )}
        </div>

        {/* RIGHT — Live Preview */}
        <div className="flex flex-col gap-4">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Smartphone className="h-4 w-4 text-primary" />
                Live Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* iOS */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">iOS</p>
                <div className="rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 p-4">
                  <IOSPreview title={title} body={body} />
                </div>
              </div>

              {/* Android */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Android</p>
                <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 p-4">
                  <AndroidPreview title={title} body={body} />
                </div>
              </div>

              {/* Meta */}
              <div className="rounded-lg bg-accent/40 p-3 space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Audience</span>
                  <span className="font-medium">{audience === "all" ? `All (${tokenCount ?? "…"} devices)` : "Specific User"}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Deep Link</span>
                  <span className="font-mono font-medium">{resolvedScreen || "none"}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Send</span>
                  <span className="font-medium">{scheduleMode === "now" ? "Immediately" : scheduleDate && scheduleTime ? `${scheduleDate} ${scheduleTime}` : "Scheduled"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Notifications Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recent Notifications</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={fetchRecentNotifs}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-4 py-2.5 border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
            <span>Title</span>
            <span>Audience</span>
            <span>Sent At</span>
            <span>Devices</span>
          </div>
          <div className="divide-y divide-border">
            {recentLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : recentNotifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Bell className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No notifications sent yet</p>
              </div>
            ) : (
              recentNotifs.map((n) => (
                <div key={n.id} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-1 md:gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors">
                  <div>
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground truncate md:hidden">{n.body}</p>
                  </div>
                  <div>
                    {n.target_user_id ? (
                      <Badge variant="outline" className="text-[10px]">Specific</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Broadcast</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {n.sent_at
                      ? new Date(n.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : <span className="text-amber-500">Pending</span>}
                  </span>
                  <span className="text-xs font-medium">
                    {n.data?.tokenCount != null ? `${n.data.tokenCount} devices` : "—"}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
