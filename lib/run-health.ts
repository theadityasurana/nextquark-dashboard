/**
 * Turns run logs into what the system is getting wrong, across all applications.
 *
 * One failed form is an anecdote. The same field failing on twenty forms is the next
 * thing to fix, so this ranks problems by how many applications they touched.
 */

export interface RunLogLine {
  application_id: string | null
  message: string
}

export interface RunHealth {
  runs: number
  results: Record<string, number>
  /** Fields that could not be filled, by applications affected. */
  fieldFailures: Array<{ field: string; reason: string; applications: number }>
  /** What forms rejected after Submit, by applications affected. */
  rejections: Array<{ reason: string; applications: number }>
  /** Required questions that fell through to a default answer. */
  lastResort: Array<{ field: string; applications: number }>
  refills: { runsMeasured: number; runsWithRefills: number; extraWrites: number }
}

const TOP_N = 10

/** Marked fields read options with an empty value first. That is routine, not a failure. */
const ROUTINE_REASON = /^(no-matching-option|no-value-to-select)$/

function rank(map: Map<string, Set<string>>): Array<[string, number]> {
  return [...map.entries()].map(([k, ids]): [string, number] => [k, ids.size]).sort((a, b) => b[1] - a[1]).slice(0, TOP_N)
}

export function summarizeRunLogs(lines: RunLogLine[]): RunHealth {
  const results = new Map<string, number>()
  const fields = new Map<string, Set<string>>()
  const rejected = new Map<string, Set<string>>()
  const fallback = new Map<string, Set<string>>()
  const seen = new Set<string>()
  const refills = { runsMeasured: 0, runsWithRefills: 0, extraWrites: 0 }
  const add = (map: Map<string, Set<string>>, key: string, id: string) => {
    map.set(key, (map.get(key) ?? new Set()).add(id))
  }

  for (const line of lines) {
    const id = line.application_id
    if (!id) continue
    const m = String(line.message).replace(/^\[Kernel\] /, "").replace(/\s+/g, " ")

    const result = m.match(/^\[Result\] ([A-Z_]+)/)
    if (result) {
      seen.add(id)
      results.set(result[1], (results.get(result[1]) ?? 0) + 1)
      continue
    }
    const failed = m.match(/^NOT FILLED "([^"]{1,60})"[^:]*: ?([a-z-]+)/)
    if (failed) {
      if (!ROUTINE_REASON.test(failed[2])) add(fields, `${failed[1]}\u0000${failed[2]}`, id)
      continue
    }
    const reject = m.match(/^Post-submit validation errors: (.{1,90}?)(?: — running targeted retry)?$/)
    if (reject) {
      add(rejected, reject[1], id)
      continue
    }
    const resort = m.match(/^\[Answer\] last-resort answer for "([^"]{1,60})"/)
    if (resort) {
      add(fallback, resort[1], id)
      continue
    }
    const refill = m.match(/^\[Refill\] summary: (\d+) fields written, (\d+) more than once, (\d+) writes in total/)
    if (refill) {
      refills.runsMeasured++
      if (Number(refill[2]) > 0) refills.runsWithRefills++
      refills.extraWrites += Number(refill[3]) - Number(refill[1])
    }
  }

  return {
    runs: seen.size,
    results: Object.fromEntries(results),
    fieldFailures: rank(fields).map(([key, applications]) => {
      const [field, reason] = key.split("\u0000")
      return { field, reason, applications }
    }),
    rejections: rank(rejected).map(([reason, applications]) => ({ reason, applications })),
    lastResort: rank(fallback).map(([field, applications]) => ({ field, applications })),
    refills,
  }
}
