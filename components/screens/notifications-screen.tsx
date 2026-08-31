"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Bell, Zap, Users } from "lucide-react"
import { toast } from "sonner"

const SUPABASE_URL = "https://widujxpahzlpegzjjpqp.supabase.co"
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZHVqeHBhaHpscGVnempqcHFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc1MjY2MiwiZXhwIjoyMDg3MzI4NjYyfQ.6KGHcAofT7nFX03JII8yLiEagZfOXWY_0YbEepEf55M"

const TAGS = ["Job Hunt", "Tech", "AI", "General", "Career Advice", "Startups", "Memes", "DSA/CP", "Placements", "IIT BHU"]

async function sendPushNotification(title: string, body: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body, data: { type: "broadcast", screen: "wall" } }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export function NotificationsScreen() {
  const [tokenCount, setTokenCount] = useState<number | null>(null)

  // Send Notification state
  const [notifTitle, setNotifTitle] = useState("")
  const [notifBody, setNotifBody] = useState("")
  const [notifLoading, setNotifLoading] = useState(false)

  // Loot Drop state
  const [lootContent, setLootContent] = useState("")
  const [lootTag, setLootTag] = useState("General")
  const [lootDuration, setLootDuration] = useState(15)
  const [lootLoading, setLootLoading] = useState(false)

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/user_push_tokens?select=count`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    })
      .then((r) => r.json())
      .then((data) => setTokenCount(data?.[0]?.count ?? null))
      .catch(() => {})
  }, [])

  const handleSendNotification = async () => {
    if (!notifTitle || !notifBody) { toast.error("Title and body are required"); return }
    setNotifLoading(true)
    try {
      await sendPushNotification(notifTitle, notifBody)
      toast.success("Notification sent to all users!")
      setNotifTitle("")
      setNotifBody("")
    } catch (e: any) {
      toast.error(e.message || "Failed to send notification")
    }
    setNotifLoading(false)
  }

  const handleLaunchLootDrop = async () => {
    if (!lootContent) { toast.error("Content is required"); return }
    setLootLoading(true)
    try {
      const expiresAt = new Date(Date.now() + lootDuration * 60 * 1000).toISOString()
      const res = await fetch(`${SUPABASE_URL}/rest/v1/wall_posts`, {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          user_id: "system",
          user_name: "NextQuark",
          user_avatar: "https://api.dicebear.com/9.x/shapes/png?seed=nextquark",
          user_flair: "Official",
          content: lootContent,
          images: [],
          tag: lootTag,
          likes_count: 0,
          comments_count: 0,
          is_ghost: false,
          is_loot_drop: true,
          loot_drop_expires_at: expiresAt,
          loot_drop_duration_minutes: lootDuration,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      await sendPushNotification(
        "🎁 Loot Drop is LIVE!",
        "A limited-time post just dropped on the wall. Tap to grab it before it expires!"
      )
      toast.success("Loot Drop launched and notification sent!")
      setLootContent("")
    } catch (e: any) {
      toast.error(e.message || "Failed to launch loot drop")
    }
    setLootLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gradient">Notification Manager</h1>
          <p className="text-sm text-muted-foreground">Send push notifications and loot drops to all users</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 self-start sm:self-auto">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {tokenCount === null ? "Loading..." : <><span className="font-semibold text-foreground">{tokenCount}</span> registered devices</>}
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Send Notification */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" />
              Send Notification
            </CardTitle>
            <CardDescription>Broadcast a push notification to all registered devices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                placeholder="e.g. New jobs just dropped! 🔥"
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                value={notifBody}
                onChange={(e) => setNotifBody(e.target.value)}
                placeholder="e.g. 50+ new roles added today. Swipe now before they're gone!"
                rows={3}
              />
            </div>
            <Button onClick={handleSendNotification} disabled={notifLoading} className="w-full">
              <Bell className="mr-2 h-4 w-4" />
              {notifLoading ? "Sending..." : "Send to All Users"}
            </Button>
          </CardContent>
        </Card>

        {/* Create Loot Drop */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-primary" />
              Create Loot Drop
            </CardTitle>
            <CardDescription>Post a limited-time wall post and auto-notify all users</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={lootContent}
                onChange={(e) => setLootContent(e.target.value)}
                placeholder="e.g. 🎁 First 10 users to comment get a free premium week!"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tag</Label>
                <Select value={lootTag} onValueChange={setLootTag}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAGS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={lootDuration}
                  onChange={(e) => setLootDuration(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
              <Badge variant="outline" className="text-[10px]">Auto-notify</Badge>
              <span className="text-xs text-muted-foreground">Push notification fires automatically on launch</span>
            </div>
            <Button onClick={handleLaunchLootDrop} disabled={lootLoading} className="w-full">
              <Zap className="mr-2 h-4 w-4" />
              {lootLoading ? "Launching..." : "Launch Loot Drop"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
