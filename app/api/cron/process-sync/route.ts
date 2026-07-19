import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Called every 30 min by pg_cron — picks the next due pending company and fully syncs it
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getAdminClient()
  const origin = new URL(request.url).origin

  // Claim the next pending entry that is due (scheduled_at <= now), skip any currently running
  const { data: entry, error: fetchError } = await supabase
    .from("job_sync_queue")
    .select("id, company_id")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .single()

  if (fetchError || !entry) {
    return NextResponse.json({ message: "No pending syncs due" })
  }

  // Mark as running
  await supabase
    .from("job_sync_queue")
    .update({ status: "running" })
    .eq("id", entry.id)

  await supabase
    .from("companies")
    .update({ sync_status: "running" })
    .eq("id", entry.company_id)

  // Get company ATS details
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, ats_type, ats_company_id")
    .eq("id", entry.company_id)
    .single()

  if (!company?.ats_type || !company?.ats_company_id) {
    await supabase.from("job_sync_queue").update({ status: "failed", synced_at: new Date().toISOString(), result: { error: "Missing ATS config" } }).eq("id", entry.id)
    await supabase.from("companies").update({ sync_status: "failed" }).eq("id", entry.company_id)
    return NextResponse.json({ error: "Missing ATS config for company" }, { status: 400 })
  }

  try {
    // Step 1: Fetch live jobs from ATS (preview mode to get current URLs)
    const previewRes = await fetch(`${origin}/api/ats-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: company.id,
        atsType: company.ats_type,
        atsCompanyId: company.ats_company_id,
        preview: true,
      }),
    })
    const previewData = await previewRes.json()

    if (previewData.error) throw new Error(previewData.error)

    const liveJobUrls: string[] = (previewData.jobs || []).map((j: any) => j.jobUrl).filter(Boolean)

    // Step 2: Full sync — add new + update existing
    const syncRes = await fetch(`${origin}/api/ats-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: company.id,
        atsType: company.ats_type,
        atsCompanyId: company.ats_company_id,
      }),
    })
    const syncData = await syncRes.json()

    if (syncData.error) throw new Error(syncData.error)

    // Step 3: Delete stale jobs (in DB but no longer on ATS)
    let deletedCount = 0
    if (liveJobUrls.length > 0) {
      const liveUrlSet = new Set(liveJobUrls)
      const { data: dbJobs } = await supabase
        .from("jobs")
        .select("id, job_url")
        .eq("company_id", company.id)
        .not("job_url", "is", null)
        .neq("job_url", "")

      const staleIds = (dbJobs || [])
        .filter((j) => j.job_url && !liveUrlSet.has(j.job_url))
        .map((j) => j.id)

      if (staleIds.length > 0) {
        await supabase.from("jobs").delete().in("id", staleIds)
        deletedCount = staleIds.length
      }
    }

    const result = {
      added: syncData.addedCount || 0,
      updated: syncData.updatedCount || 0,
      deleted: deletedCount,
      totalLive: liveJobUrls.length,
    }

    // Mark done and update company sync status
    await supabase
      .from("job_sync_queue")
      .update({ status: "done", synced_at: new Date().toISOString(), result })
      .eq("id", entry.id)

    await supabase
      .from("companies")
      .update({ sync_status: "success", last_synced_at: new Date().toISOString() })
      .eq("id", entry.company_id)

    return NextResponse.json({ company: company.name, ...result })
  } catch (err: any) {
    console.error(`Sync failed for ${company.name}:`, err)

    await supabase
      .from("job_sync_queue")
      .update({ status: "failed", synced_at: new Date().toISOString(), result: { error: err.message } })
      .eq("id", entry.id)

    await supabase
      .from("companies")
      .update({ sync_status: "failed", last_synced_at: new Date().toISOString() })
      .eq("id", entry.company_id)

    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
