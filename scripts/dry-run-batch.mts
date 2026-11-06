/**
 * Fill real application forms without submitting, then report how each one went.
 *
 *   npm run dry-run -- [count=5] [host-substring]
 *
 * Picks pending rows across as many different hosts as possible, and runs them at
 * the dashboard's concurrency. Rows go back to `pending` afterwards.
 */

import { hostname } from "node:os"
import { LEASE_SECONDS, runClaimedApplication } from "../lib/application-runner"
import { createAdminClient } from "../lib/supabase/admin"
import { DRY_RUN } from "../lib/test-candidates"

if (!DRY_RUN) {
  console.error("Refusing to run: KERNEL_DRY_RUN=1 is required, otherwise this would submit applications.")
  process.exit(1)
}

const count = Number(process.argv[2] || 5)
const hostFilter = process.argv[3] || ""
const supabase = createAdminClient()
const WORKER_ID = `dry-run-${hostname()}-${process.pid}`

const hostOf = (url: string) => { try { return new URL(url).host } catch { return "invalid" } }

async function pickRows() {
  const { data, error } = await supabase
    .from("live_application_queue")
    .select("id, job_url, company_name, job_title")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)

  const rows = (data ?? []).filter((r) => hostOf(r.job_url).includes(hostFilter))
  const seen = new Set<string>()
  const distinct = rows.filter((r) => !seen.has(hostOf(r.job_url)) && seen.add(hostOf(r.job_url)))
  const rest = rows.filter((r) => !distinct.includes(r))
  return [...distinct, ...rest].slice(0, count)
}

async function runOne(row: { id: string; job_url: string; company_name: string; job_title: string }) {
  const startedAt = Date.now()
  const label = `${row.company_name} [${hostOf(row.job_url)}]`
  const { data: claimed, error } = await supabase.rpc("claim_application", {
    p_id: row.id, p_worker: WORKER_ID, p_lease_seconds: LEASE_SECONDS,
  })
  if (error || !claimed) return { label, id: row.id, verdict: `not claimed: ${error?.message ?? "no free slot"}`, seconds: 0 }

  const summary: any = await runClaimedApplication(row.id, WORKER_ID)
  return {
    label,
    id: row.id,
    verdict: summary.wouldBe ?? summary.outcome,
    detail: summary.error ? String(summary.error).slice(0, 220) : "",
    seconds: Math.round((Date.now() - startedAt) / 1000),
  }
}

const rows = await pickRows()
console.log(`Dry-running ${rows.length}: ${rows.map((r) => hostOf(r.job_url)).join(", ")}`)
const results = await Promise.all(rows.map(runOne))
for (const r of results) console.log(`${r.verdict.padEnd(18)} ${String(r.seconds).padStart(4)}s  ${r.label}  ${r.id}\n    ${r.detail ?? ""}`)
process.exit(0)
