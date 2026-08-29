/**
 * Distributed concurrency gate backed by Supabase.
 *
 * The in-process semaphore in dispatch-gate.ts only works when one process
 * handles all requests. On Vercel, each function invocation can be a separate
 * process — each with its own counter at zero — so 10 simultaneous dispatches
 * would each think they're the only one running and all start browsers at once.
 *
 * This replaces that with a Postgres row using SELECT ... FOR UPDATE, which is
 * a real distributed lock. Only one process can hold the lock at a time, so the
 * counter is always accurate regardless of how many Vercel instances are running.
 *
 * Table required (run scripts/061_distributed_concurrency_gate.sql):
 *   CREATE TABLE kernel_concurrency_gate (
 *     id TEXT PRIMARY KEY DEFAULT 'singleton',
 *     active_count INTEGER NOT NULL DEFAULT 0,
 *     max_count INTEGER NOT NULL DEFAULT 2,
 *     updated_at TIMESTAMPTZ DEFAULT now()
 *   );
 *   INSERT INTO kernel_concurrency_gate (id, active_count, max_count)
 *   VALUES ('singleton', 0, 2)
 *   ON CONFLICT DO NOTHING;
 */

import { createAdminClient } from './supabase/admin'

export interface SlotResult {
  acquired: boolean
  active: number
  limit: number
  waited: boolean
  waitedMs: number
}

const POLL_INTERVAL_MS = 2000
const MAX_WAIT_MS = 120_000 // 2 minutes max wait before giving up

/**
 * Try to acquire a concurrency slot. Polls until a slot is free or timeout.
 * Uses SELECT FOR UPDATE to prevent race conditions across serverless instances.
 */
export async function acquireSlot(): Promise<SlotResult | null> {
  const supabase = createAdminClient()
  const startedAt = Date.now()
  let waited = false

  while (true) {
    // Use a Postgres function to atomically check-and-increment
    const { data, error } = await supabase.rpc('try_acquire_concurrency_slot')

    if (error) {
      console.error('[distributed-gate] slot acquire error:', error.message)
      return null // fail open — don't block the queue on a DB error
    }

    if (data?.acquired) {
      return {
        acquired: true,
        active: data.active_count,
        limit: data.max_count,
        waited,
        waitedMs: Date.now() - startedAt,
      }
    }

    // No slot available — wait and retry
    waited = true
    if (Date.now() - startedAt >= MAX_WAIT_MS) {
      console.warn('[distributed-gate] timed out waiting for a slot after 2 minutes')
      return null // fail open after timeout
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }
}

/**
 * Release a previously acquired slot.
 * Always call this in a finally block.
 */
export async function releaseSlot(): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.rpc('release_concurrency_slot')
  if (error) {
    console.error('[distributed-gate] slot release error:', error.message)
  }
}

/**
 * Run a function holding a distributed concurrency slot.
 * Slot is always released, even if the function throws.
 */
export async function withDistributedSlot<T>(
  fn: (slot: SlotResult) => Promise<T>
): Promise<T> {
  const slot = await acquireSlot()

  // If we couldn't acquire (DB error or timeout), run anyway — fail open
  // is better than silently dropping work from the queue.
  if (!slot) {
    return fn({ acquired: false, active: 0, limit: 0, waited: false, waitedMs: 0 })
  }

  try {
    return await fn(slot)
  } finally {
    await releaseSlot()
  }
}
