import { describe, expect, it } from "vitest"
import { runAllBounded, Semaphore } from "./semaphore"

const defer = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

describe("Semaphore", () => {
  it("rejects a nonsense limit rather than silently running unbounded", () => {
    expect(() => new Semaphore(0)).toThrow()
    expect(() => new Semaphore(-1)).toThrow()
    expect(() => new Semaphore(1.5)).toThrow()
  })

  it("admits up to the limit immediately and queues the rest", async () => {
    const sem = new Semaphore(2)
    const a = defer()
    const b = defer()
    const c = defer()

    let started = 0
    const run = (d: ReturnType<typeof defer>) => sem.run(async () => { started++; await d.promise })

    const pa = run(a)
    const pb = run(b)
    const pc = run(c)

    await Promise.resolve()
    expect(started).toBe(2)
    expect(sem.stats).toEqual({ limit: 2, active: 2, waiting: 1 })

    a.resolve()
    await pa
    expect(started).toBe(3)

    b.resolve()
    c.resolve()
    await Promise.all([pb, pc])
    expect(sem.stats.active).toBe(0)
  })

  it("releases the slot when the task throws", async () => {
    const sem = new Semaphore(1)
    await expect(sem.run(async () => { throw new Error("boom") })).rejects.toThrow("boom")
    // A leaked slot would permanently shrink the pool for the life of the process.
    expect(sem.stats.active).toBe(0)
    await expect(sem.run(async () => "fine")).resolves.toBe("fine")
  })

  it("hands a freed slot to the longest-waiting caller", async () => {
    const sem = new Semaphore(1)
    const order: number[] = []
    const held = defer()

    const first = sem.run(async () => { order.push(1); await held.promise })
    const second = sem.run(async () => { order.push(2) })
    const third = sem.run(async () => { order.push(3) })

    held.resolve()
    await Promise.all([first, second, third])
    // FIFO: a burst of arrivals must not starve whoever queued first.
    expect(order).toEqual([1, 2, 3])
  })

  it("does not let a stray release raise the effective limit", async () => {
    const sem = new Semaphore(1)
    sem.release()
    sem.release()
    expect(sem.stats.active).toBe(0)

    const held = defer()
    let concurrent = 0
    let peak = 0
    const task = () => sem.run(async () => {
      concurrent++
      peak = Math.max(peak, concurrent)
      await held.promise
      concurrent--
    })
    const runs = [task(), task()]
    await Promise.resolve()
    expect(peak).toBe(1)
    held.resolve()
    await Promise.all(runs)
  })
})

describe("runAllBounded", () => {
  it("never exceeds the limit", async () => {
    let concurrent = 0
    let peak = 0
    const tasks = Array.from({ length: 10 }, () => async () => {
      concurrent++
      peak = Math.max(peak, concurrent)
      await new Promise((r) => setTimeout(r, 1))
      concurrent--
      return true
    })

    await runAllBounded(tasks, 3)
    expect(peak).toBeLessThanOrEqual(3)
  })

  it("attempts every task even when one fails", async () => {
    // With Promise.all, one bad posting aborts the batch and every other
    // application someone was waiting on is silently never attempted.
    const attempted: number[] = []
    const tasks = [0, 1, 2, 3].map((i) => async () => {
      attempted.push(i)
      if (i === 1) throw new Error("posting closed")
      return i
    })

    const outcome = await runAllBounded(tasks, 2)
    expect(attempted.sort()).toEqual([0, 1, 2, 3])
    expect(outcome.succeeded).toBe(3)
    expect(outcome.failed).toBe(1)
  })

  it("keeps results in task order and reports each outcome", async () => {
    const outcome = await runAllBounded(
      [
        async () => "a",
        async () => { throw new Error("nope") },
        async () => "c",
      ],
      2
    )
    expect(outcome.results[0]).toEqual({ ok: true, value: "a" })
    expect(outcome.results[1].ok).toBe(false)
    expect(outcome.results[2]).toEqual({ ok: true, value: "c" })
  })

  it("wraps a non-Error rejection so callers always get an Error", async () => {
    const outcome = await runAllBounded([async () => { throw "just a string" }], 1)
    const first = outcome.results[0]
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.error).toBeInstanceOf(Error)
  })

  it("treats a zero or negative limit as one rather than deadlocking", async () => {
    const outcome = await runAllBounded([async () => 1, async () => 2], 0)
    expect(outcome.succeeded).toBe(2)
  })
})
