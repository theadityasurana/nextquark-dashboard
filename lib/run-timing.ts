/**
 * Where a run's time goes, to find why runs slow down as sessions are added.
 *
 * Page scripts are timed from both sides. Time inside the browser's VM is the work.
 * The rest of the round trip is waiting in Kernel's API or on the network. If the
 * wait grows with session count while VM time stays flat, the bottleneck is not in
 * the browser or in our scripts.
 */

export type TimingKind = "script" | "llm" | "stagehand" | "dbLog"

interface Bucket {
  count: number
  totalMs: number
  maxMs: number
  /** Time inside the browser VM. Scripts only. */
  vmMs: number
  samples: number[]
}

interface RunTiming {
  startedAt: number
  buckets: Partial<Record<TimingKind, Bucket>>
}

const runs = new Map<string, RunTiming>()
let scriptsInFlight = 0

const run = (id: string): RunTiming => {
  let timing = runs.get(id)
  if (!timing) {
    timing = { startedAt: Date.now(), buckets: {} }
    runs.set(id, timing)
  }
  return timing
}

export function recordTiming(applicationId: string | undefined, kind: TimingKind, ms: number, vmMs = 0): void {
  if (!applicationId) return
  const timing = run(applicationId)
  const b = (timing.buckets[kind] ??= { count: 0, totalMs: 0, maxMs: 0, vmMs: 0, samples: [] })
  b.count++
  b.totalMs += ms
  b.maxMs = Math.max(b.maxMs, ms)
  b.vmMs += vmMs
  b.samples.push(ms)
}

export function scriptStarted(): number {
  return ++scriptsInFlight
}

export function scriptFinished(): void {
  scriptsInFlight = Math.max(0, scriptsInFlight - 1)
}

export const currentScriptsInFlight = () => scriptsInFlight

const seconds = (ms: number) => `${Math.round(ms / 1000)}s`
const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1] ?? 0

/** One line describing the run, and forgets it. */
export function finishTiming(applicationId: string): string {
  const timing = run(applicationId)
  runs.delete(applicationId)
  const total = Date.now() - timing.startedAt
  const { script, llm, stagehand, dbLog } = timing.buckets
  const part = (name: string, b?: Bucket) => (b ? `${name} ${b.count}x ${seconds(b.totalMs)} (max ${seconds(b.maxMs)})` : `${name} 0x`)
  const split = script
    ? ` | VM ${seconds(script.vmMs)}, API/network wait ${seconds(script.totalMs - script.vmMs)}, median script ${(median(script.samples) / 1000).toFixed(1)}s`
    : ""
  return `[Timing] summary: total ${seconds(total)} | ${part("scripts", script)}${split} | ${part("llm", llm)} | ${part("stagehand", stagehand)} | ${part("dbLog", dbLog)}`
}

/** Wraps a page script so its time inside the VM comes back with its result. */
export function withVmTimer(code: string): string {
  return `const __nqStart = Date.now();
const __nqResult = await (async () => {
${code}
})();
return { __nqResult, __nqVmMs: Date.now() - __nqStart };`
}

/** Takes the wrapped result apart. Anything not in that shape passes through untouched. */
export function unwrapVmTimer(result: unknown): { result: unknown; vmMs: number | null } {
  if (result && typeof result === "object" && "__nqVmMs" in result) {
    const r = result as { __nqResult?: unknown; __nqVmMs: number }
    return { result: r.__nqResult, vmMs: r.__nqVmMs }
  }
  return { result, vmMs: null }
}
