import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { sendAdminPush } from "@/lib/admin-push"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Called every 3 hours — sends a push notification with job stats
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Count jobs added, updated, deleted in last 3 hours
  const [{ count: added }, { count: updated }, { count: deleted }] = await Promise.all([
    supabase.from("jobs").select("*", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("jobs").select("*", { count: "exact", head: true }).gte("updated_at", since).lt("created_at", since),
    supabase.from("jobs").select("*", { count: "exact", head: true }).gte("deleted_at", since).not("deleted_at", "is", null),
  ])

  const addedCount = added ?? 0
  const updatedCount = updated ?? 0
  const deletedCount = deleted ?? 0

  if (addedCount === 0 && updatedCount === 0 && deletedCount === 0) {
    return NextResponse.json({ sent: 0, message: "No job activity in last 3 hours" })
  }

  const parts: string[] = []
  if (addedCount > 0) parts.push(`+${addedCount} added`)
  if (updatedCount > 0) parts.push(`${updatedCount} updated`)
  if (deletedCount > 0) parts.push(`${deletedCount} deleted`)

  const data = await sendAdminPush({
    title: "Job Activity Summary",
    body: `Last 24h: ${parts.join(", ")}`,
    url: "/jobs",
    tag: "job-summary",
  })
  return NextResponse.json({ ok: true, ...data })
}
