/**
 * The process-wide cap on how many applications run at once.
 *
 * `job-lease.ts` guarantees two workers never take the *same* application.
 * Nothing guaranteed anything about how many *different* ones start together —
 * so twelve queued rows fired twelve requests at the dispatch route, twelve
 * browser sessions were requested, and the ones past the plan's concurrency
 * limit were rejected by Kernel mid-run. From the queue that reads as random
 * failures on perfectly good postings.
 *
 * This is the missing gate. One semaphore per process, sized from the Kernel
 * plan the first time anything asks, so the dispatch rate matches what the
 * account actually supports rather than a number someone guessed.
 *
 * Deliberately in-process. Serverless will run several instances and each gets
 * its own gate; the lease is what makes that safe, and the concurrency claim in
 * `kernel-limits.ts` leaves headroom for exactly this reason.
 */

import Kernel from "@onkernel/sdk"
import { fetchConcurrencyLimit } from "./kernel-limits"
import { Semaphore } from "./semaphore"

let gate: Semaphore | null = null
let gatePromise: Promise<Semaphore> | null = null

/**
 * The dispatch gate, created on first use.
 *
 * The in-flight promise is cached as well as the result: without it, a burst of
 * simultaneous requests would each start their own limit lookup and each build
 * their own semaphore, which is precisely the unbounded concurrency this
 * exists to prevent.
 */
async function getGate(apiKey: string): Promise<Semaphore> {
  if (gate) return gate
  if (gatePromise) return gatePromise

  gatePromise = (async () => {
    let limit = 2
    try {
      const decision = await fetchConcurrencyLimit(
        new Kernel({ apiKey }),
        process.env.KERNEL_PROFILE_POOL_SIZE ? Number(process.env.KERNEL_PROFILE_POOL_SIZE) : null
      )
      limit = decision.limit
      console.log(`[dispatch-gate] ${decision.reason}`)
    } catch (err) {
      console.warn("[dispatch-gate] could not read the concurrency limit, defaulting to 2:", err)
    }
    gate = new Semaphore(limit)
    return gate
  })()

  return gatePromise
}

/** Drop the cached gate — used when the API key changes. */
export function clearDispatchGate(): void {
  gate = null
  gatePromise = null
}

/** What the gate looked like when a run started. Logged so waits are visible. */
export interface GateEntry {
  limit: number
  waited: boolean
  waitedMs: number
}

/**
 * Run one application under the gate.
 *
 * When every slot is taken this waits rather than failing, because the caller
 * is a queued job with nowhere else to be — and waiting thirty seconds for a
 * free browser is strictly better than being rejected by the API and marked
 * failed.
 */
export async function withDispatchSlot<T>(
  apiKey: string,
  fn: (entry: GateEntry) => Promise<T>
): Promise<T> {
  const sem = await getGate(apiKey)
  const startedWaiting = Date.now()
  const hadFreeSlot = sem.stats.active < sem.limit

  return sem.run(async () => {
    const waitedMs = Date.now() - startedWaiting
    return fn({ limit: sem.limit, waited: !hadFreeSlot, waitedMs })
  })
}

/** Current gate state, for the health panel. Null before anything has dispatched. */
export function dispatchGateStats(): { limit: number; active: number; waiting: number } | null {
  return gate ? gate.stats : null
}
