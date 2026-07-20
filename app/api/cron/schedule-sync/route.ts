import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Called once daily by pg_cron — populates the sync queue, spreading companies evenly across 24h
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getAdminClient()

  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name, ats_type, ats_company_id")
    .not("ats_type", "is", null)
    .not("ats_company_id", "is", null)

  if (error || !companies || companies.length === 0) {
    return NextResponse.json({ scheduled: 0, message: "No ATS companies found" })
  }

  const now = new Date()
  const intervalMs = (24 * 60 * 60 * 1000) / companies.length

  const queueEntries = companies.map((company, index) => ({
    company_id: company.id,
    scheduled_at: new Date(now.getTime() + intervalMs * index).toISOString(),
    status: "pending",
  }))

  // Remove all pending entries to avoid duplicates before re-scheduling
  await supabase
    .from("job_sync_queue")
    .delete()
    .eq("status", "pending")

  const { error: insertError } = await supabase
    .from("job_sync_queue")
    .insert(queueEntries)

  if (insertError) {
    console.error("Error inserting sync queue:", insertError)
    return NextResponse.json({ error: "Failed to schedule syncs" }, { status: 500 })
  }

  return NextResponse.json({
    scheduled: queueEntries.length,
    intervalMinutes: Math.round(intervalMs / 60000),
    message: `Scheduled ${queueEntries.length} companies across 24 hours`,
  })
}
