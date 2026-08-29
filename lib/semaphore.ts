/**
 * A counting semaphore, for capping how much runs at once.
 *
 * The lease in `job-lease.ts` guarantees two workers never take the *same*
 * application. It says nothing about how many *different* applications may be
 * in flight together — so a batch of twenty queued rows would try to open
 * twenty browsers, and Kernel would reject most of them.
 *
 * This is the other half: a gate that admits `limit` holders and queues the
 * rest. Combined with the real plan limit from `kernel-limits.ts`, dispatch
 * moves at exactly the rate the account supports.
 *
 * Deliberately dependency-free and in-process. It is not a distributed lock —
 * `leaseApplication` is what makes concurrent workers safe. This bounds the
 * work a single process starts.
 */

export interface SemaphoreStats {
  limit: number
  active: number
  waiting: number
}

export class Semaphore {
  private active = 0
  private readonly waiters: Array<() => void> = []

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`Semaphore limit must be a positive integer, got ${limit}`)
    }
  }

  get stats(): SemaphoreStats {
    return { limit: this.limit, active: this.active, waiting: this.waiters.length }
  }

  /**
   * Wait for a slot. Resolves immediately when one is free.
   *
   * Prefer {@link run}, which cannot leak a slot. Use this directly only when
   * acquire and release genuinely have to happen in different scopes.
   */
  acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve)
    })
  }

  /**
   * Give a slot back.
   *
   * Hands it straight to the next waiter rather than decrementing and letting
   * them re-race for it — otherwise a burst of arrivals can starve whoever has
   * been queued longest.
   */
  release(): void {
    const next = this.waiters.shift()
    if (next) {
      next()
      return
    }
    // Floor at zero: a double release is a caller bug, but silently going
    // negative would quietly raise the effective limit forever after.
    this.active = Math.max(0, this.active - 1)
  }

  /**
   * Run `fn` holding a slot, releasing it however `fn` ends.
   *
   * This is the form to use. A `try/finally` around acquire/release is easy to
   * write and easy to get wrong, and one leaked slot permanently shrinks the
   * pool for the life of the process.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

export interface BatchOutcome<T> {
  results: Array<{ ok: true; value: T } | { ok: false; error: Error }>
  succeeded: number
  failed: number
}

/**
 * Run every task under a concurrency cap, and report the whole outcome.
 *
 * Uses settle-all semantics deliberately: with `Promise.all`, one failed
 * application aborts the batch and the rest are never attempted — which for a
 * queue of real job applications means a single bad posting silently costs
 * someone every other application they were waiting on.
 *
 * Order of `results` matches order of `tasks`.
 */
export async function runAllBounded<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<BatchOutcome<T>> {
  const sem = new Semaphore(Math.max(1, limit))
  const settled = await Promise.allSettled(tasks.map((task) => sem.run(task)))

  const results = settled.map((r) =>
    r.status === "fulfilled"
      ? ({ ok: true, value: r.value } as const)
      : ({ ok: false, error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)) } as const)
  )

  return {
    results,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  }
}
