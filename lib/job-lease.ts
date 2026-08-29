/**
 * Atomic job leasing and a per-user profile pool — the throughput ceiling.
 *
 * Two separate bottlenecks, and both have to go for parallelism to be safe.
 *
 * **The profile lock.** `getOrCreateKernelProfile` takes one lock per *user*.
 * A second concurrent run for the same candidate doesn't wait — it proceeds
 * with `save_changes: false`, silently losing every cookie and session that run
 * establishes. So the effective throughput is one writing session per user, and
 * exceeding it degrades quality invisibly. {@link acquireProfileSlot} replaces
 * the single lock with a small pool: N numbered profiles per user, each
 * independently lockable, all of them writable.
 *
 * **The dispatch race.** Nothing today stops two workers picking up the same
 * queue row: the read and the status update are separate statements. Two
 * sessions then apply to the same posting, which the employer sees as a
 * duplicate. {@link leaseApplication} closes that with a conditional update —
 * the write itself is the lock, and only the worker whose update returns a row
 * owns the job.
 *
 * A lease also *expires*. A worker that dies mid-run would otherwise strand its
 * row in `processing` forever; {@link reclaimExpiredLeases} returns those to the
 * queue once the lease is provably stale.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Profiles per user. Four is a deliberate compromise: enough to keep a queue
 * moving, few enough that one candidate applying from four IPs at once doesn't
 * itself look like automation to an ATS.
 */
export const PROFILE_POOL_SIZE = Number(process.env.KERNEL_PROFILE_POOL_SIZE || 4)

/**
 * How long a worker may hold a job before it is considered dead.
 *
 * Must exceed the longest legitimate run. Workday applications routinely take
 * eight minutes, so twenty is the floor for safety — reclaiming a live run
 * would hand the same posting to a second worker, which is the exact failure
 * this is meant to prevent.
 */
export const LEASE_TTL_MS = Number(process.env.APPLICATION_LEASE_TTL_MS || 20 * 60_000)

export interface ProfileSlot {
  /** Kernel profile name to pass as `profile.name`. */
  profileName: string
  /** Pool index, 0-based. */
  slot: number
  /** Always true for an acquired slot — that is the point of the pool. */
  safeToWrite: boolean
  /** Lock key to release in the finally block. */
  lockKey: string
}

function slotKey(userId: string, slot: number): string {
  return `kernel_profile_${userId}_${slot}`
}

/**
 * Claim a free profile slot for this user.
 *
 * Walks the pool and takes the first slot whose lock row inserts cleanly — the
 * unique constraint on `lock_key` is the mutex. Returns null when the whole
 * pool is busy, which the caller should treat as backpressure (requeue and try
 * later) rather than as a reason to run unprofiled: a run without a persistent
 * profile loses the logged-in state that makes many portals work at all.
 */
export async function acquireProfileSlot(
  supabase: SupabaseClient,
  userId: string,
  userName: string,
  poolSize: number = PROFILE_POOL_SIZE
): Promise<ProfileSlot | null> {
  const base = `user-${userId}-${(userName || "user").replace(/\s+/g, "-").toLowerCase()}`
  const staleBefore = new Date(Date.now() - LEASE_TTL_MS).toISOString()

  for (let slot = 0; slot < poolSize; slot++) {
    const lockKey = slotKey(userId, slot)
    try {
      // Clear a lock left behind by a crashed worker before trying to take it.
      await supabase.from("kernel_profile_locks").delete().eq("lock_key", lockKey).lt("locked_at", staleBefore)

      const { error } = await supabase
        .from("kernel_profile_locks")
        .insert({ lock_key: lockKey, locked_at: new Date().toISOString() })
      if (!error) {
        return { profileName: `${base}-${slot}`, slot, safeToWrite: true, lockKey }
      }
      // Unique violation — this slot is held. Try the next one.
    } catch {
      // Lock table unavailable: fall through and try the next slot.
    }
  }
  return null
}

/** Release a claimed slot. Safe to call with a null slot. */
export async function releaseProfileSlot(
  supabase: SupabaseClient,
  slot: ProfileSlot | null
): Promise<void> {
  if (!slot) return
  try {
    await supabase.from("kernel_profile_locks").delete().eq("lock_key", slot.lockKey)
  } catch {
    // A leaked lock is reclaimed by the staleness sweep above.
  }
}

export interface Lease {
  applicationId: string
  workerId: string
  expiresAt: string
}

/**
 * Take exclusive ownership of a queued application.
 *
 * The conditional update is what makes this atomic: two workers issue the same
 * statement, Postgres serializes them, and the second one matches zero rows
 * because `status` is no longer `pending`. Whoever gets a row back owns the job.
 * No advisory lock and no read-then-write window.
 */
export async function leaseApplication(
  supabase: SupabaseClient,
  applicationId: string,
  workerId: string,
  ttlMs: number = LEASE_TTL_MS
): Promise<Lease | null> {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString()
  try {
    const { data, error } = await supabase
      .from("live_application_queue")
      .update({
        status: "processing",
        lease_worker_id: workerId,
        lease_expires_at: expiresAt,
        started_at: new Date().toISOString(),
      })
      .eq("id", applicationId)
      // The guard. Only a row still pending/retrying can be claimed.
      .in("status", ["pending", "retrying"])
      .select("id")
      .maybeSingle()

    if (error || !data) return null
    return { applicationId, workerId, expiresAt }
  } catch {
    return null
  }
}

/**
 * Extend a lease held by a long-running job.
 *
 * Scoped to the holder: a worker whose lease already expired and was reclaimed
 * cannot renew its way back into ownership after another worker took over.
 */
export async function renewLease(
  supabase: SupabaseClient,
  applicationId: string,
  workerId: string,
  ttlMs: number = LEASE_TTL_MS
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("live_application_queue")
      .update({ lease_expires_at: new Date(Date.now() + ttlMs).toISOString() })
      .eq("id", applicationId)
      .eq("lease_worker_id", workerId)
      .select("id")
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

/** Drop the lease when a run finishes, whatever its outcome. */
export async function releaseLease(
  supabase: SupabaseClient,
  applicationId: string,
  workerId: string
): Promise<void> {
  try {
    await supabase
      .from("live_application_queue")
      .update({ lease_worker_id: null, lease_expires_at: null })
      .eq("id", applicationId)
      .eq("lease_worker_id", workerId)
  } catch {
    // Reclaimed by the sweep if this fails.
  }
}

/**
 * Return jobs whose worker died to the queue.
 *
 * Only touches rows that are still `processing` with a lease in the past —
 * a finished run has already moved to a terminal status and is untouched.
 */
export async function reclaimExpiredLeases(supabase: SupabaseClient): Promise<number> {
  try {
    const { data } = await supabase
      .from("live_application_queue")
      .update({ status: "pending", lease_worker_id: null, lease_expires_at: null })
      .eq("status", "processing")
      .lt("lease_expires_at", new Date().toISOString())
      .select("id")
    return data?.length ?? 0
  } catch {
    return 0
  }
}
