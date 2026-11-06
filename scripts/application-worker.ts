/**
 * The application worker: the only thing that starts applications automatically.
 *
 *   npm run worker
 *
 * It has to be a long-running process because a browser run can take many
 * minutes, which outlives a serverless function. It holds no concurrency count:
 * claim_applications reads Auto Start, Premium Only and Concurrency from the
 * dashboard's settings on every tick, and counts live leases itself. That makes
 * it safe to run more than one worker, and lets a dashboard toggle apply within
 * one poll.
 */

import { hostname } from "node:os"
import { LEASE_SECONDS, runClaimedApplication } from "../lib/application-runner"
import { reconcileSubmissionsFromEmail } from "../lib/submission-email"
import { createAdminClient } from "../lib/supabase/admin"

const WORKER_ID = process.env.WORKER_ID || `${hostname()}-${process.pid}`
const POLL_MS = 3_000
const HEARTBEAT_MS = 15_000
const RECLAIM_MS = 60_000
const DRAIN_TIMEOUT_MS = 40 * 60_000
const SESSION_STAGGER_MS = 2_000

const supabase = createAdminClient()
const active = new Set<string>()
let stopping = false

function log(message: string) {
  console.log(`${new Date().toISOString()} [worker] ${message}`)
}

async function runOne(id: string) {
  active.add(id)
  const startedAt = Date.now()
  log(`START ${id} (${active.size} active)`)
  try {
    const summary = await runClaimedApplication(id, WORKER_ID)
    const seconds = Math.round((Date.now() - startedAt) / 1000)
    const detail = "error" in summary && summary.error ? `: ${summary.error.slice(0, 200)}` : ""
    log(`END ${id} ${summary.outcome} in ${seconds}s${detail}`)
  } catch (err) {
    log(`CRASH ${id}: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    active.delete(id)
  }
}

async function tick() {
  if (stopping) return
  const { data, error } = await supabase.rpc("claim_applications", {
    p_worker: WORKER_ID,
    p_lease_seconds: LEASE_SECONDS,
  })
  if (error) {
    log(`claim failed: ${error.message}`)
    return
  }
  // Not awaited: a run takes minutes and must not block the next claim.
  // Staggered, so a full batch does not hit Kernel's session API all at once.
  ;((data ?? []) as Array<{ id: string }>).forEach((row, i) => {
    setTimeout(() => void runOne(row.id), i * SESSION_STAGGER_MS)
  })
}

async function heartbeat() {
  const { error } = await supabase
    .from("worker_heartbeats")
    .upsert({ worker_id: WORKER_ID, last_seen: new Date().toISOString(), active: active.size })
  if (error) log(`heartbeat failed: ${error.message}`)
}

async function reclaim() {
  const { data, error } = await supabase.rpc("reclaim_expired_leases")
  if (error) log(`reclaim failed: ${error.message}`)
  else if (data) log(`reclaimed ${data} application(s) from a stopped worker`)
  for (const proof of await reconcileSubmissionsFromEmail(supabase)) log(`CONFIRMED BY EMAIL ${proof}`)
}

function every(ms: number, fn: () => Promise<void>) {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try { await fn() } catch (err) { log(`loop error: ${err instanceof Error ? err.message : String(err)}`) }
    running = false
  }
  void run()
  return setInterval(run, ms)
}

async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  log(`${signal}: no new claims, draining ${active.size} active run(s)`)
  const deadline = Date.now() + DRAIN_TIMEOUT_MS
  while (active.size > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 1000))
  await supabase.from("worker_heartbeats").delete().eq("worker_id", WORKER_ID)
  process.exit(0)
}

process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))

log(`online as ${WORKER_ID}`)
// A timer that fires late means this process is the bottleneck, not Kernel.
let worstLagMs = 0
let lastBeat = Date.now()
setInterval(() => {
  const now = Date.now()
  worstLagMs = Math.max(worstLagMs, now - lastBeat - 1000)
  lastBeat = now
}, 1000)
setInterval(() => {
  if (active.size) log(`health: ${active.size} active, worst event-loop lag ${worstLagMs}ms, memory ${Math.round(process.memoryUsage().rss / 1048576)}MB`)
  worstLagMs = 0
}, 30_000)

every(POLL_MS, tick)
every(HEARTBEAT_MS, heartbeat)
every(RECLAIM_MS, reclaim)
