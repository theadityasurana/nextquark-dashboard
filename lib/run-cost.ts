/**
 * What a run cost to drive, in dollars.
 *
 * Kernel bills browser time by the second, so the whole cost of an application is
 * its wall clock multiplied by a rate. Published rates (docs/info/pricing):
 *
 *   headless          $0.0000166667 / sec
 *   headful           $0.0001333336 / sec     <- what this system runs
 *   headful + GPU     $0.0008000016 / sec
 *
 * Headful is 8x headless and GPU is 48x, which is worth keeping visible: the
 * portal config decides which one a run gets, so a single flag on one ATS moves
 * the bill for every application to that ATS.
 *
 * Note this is BROWSER time only. LLM tokens are billed by Groq/Gemini/OpenRouter
 * and are not visible here, so a figure shown to an operator should be labelled
 * as browser cost rather than total cost.
 */

export const KERNEL_RATES = {
  headless: 0.0000166667,
  headful: 0.0001333336,
  gpu: 0.0008000016,
} as const

export type BrowserKind = keyof typeof KERNEL_RATES

/**
 * The longest a run could plausibly have held a browser.
 *
 * Portal timeouts top out at 600s, plus room for session setup and teardown.
 * Used only to reject timestamp spans that clearly measure something else.
 */
export const MAX_PLAUSIBLE_RUN_SECONDS = 900

/** Every browser this system creates is headful — stealth realism beats the 8x saving. */
export const DEFAULT_BROWSER_KIND: BrowserKind = "headful"

export interface CostInput {
  /** Preferred: measured by the runner and stored on the queue row. */
  processing_time_ms?: number | null
  /** Fallback for older rows written before processing_time_ms existed. */
  started_at?: string | null
  completed_at?: string | null
}

/**
 * Seconds of browser time for one run, or null when it cannot be known.
 *
 * Null is deliberate and different from zero: a run still in flight, or an old
 * row with no timing, has no cost yet — showing "$0.00" would read as free.
 */
export function runSeconds(row: CostInput): number | null {
  const ms = Number(row?.processing_time_ms)
  if (Number.isFinite(ms) && ms > 0) return ms / 1000

  if (row?.started_at && row?.completed_at) {
    const a = Date.parse(row.started_at)
    const b = Date.parse(row.completed_at)
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      const span = (b - a) / 1000
      // ─── A timestamp span is wall clock, not browser time ───
      //
      // started_at to completed_at also covers everything the browser was NOT
      // running for: queue wait, an OTP the candidate had to supply, a human
      // clearing a CAPTCHA. A real row in this table spans 42,597 seconds — 11.8
      // hours — which billed as $5.68 of "browser time" for one application.
      //
      // No Kernel session can outlive its own timeout (portal configs top out at
      // 600s), so a span beyond that ceiling is not a long run, it is a different
      // measurement. Reporting it as unknown is honest; capping it would invent a
      // number that looks precise and is not.
      return span <= MAX_PLAUSIBLE_RUN_SECONDS ? span : null
    }
  }
  return null
}

/** Dollar cost of one run, or null when its duration is unknown. */
export function runCost(row: CostInput, kind: BrowserKind = DEFAULT_BROWSER_KIND): number | null {
  const secs = runSeconds(row)
  return secs === null ? null : secs * KERNEL_RATES[kind]
}

/**
 * Format for a dense table cell.
 *
 * Sub-cent runs are the common case at $0.008/min, so two decimals would show
 * "$0.00" for most of them and imply the work was free. Four decimals below a
 * cent keeps the number honest without widening the column.
 */
export function formatCost(dollars: number | null | undefined): string {
  if (dollars === null || dollars === undefined || !Number.isFinite(dollars)) return "—"
  if (dollars === 0) return "$0"
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`
  if (dollars < 1) return `$${dollars.toFixed(3)}`
  return `$${dollars.toFixed(2)}`
}

export interface CostSummary {
  /** Runs that actually have a measurable duration. */
  billedRuns: number
  totalSeconds: number
  totalCost: number
  /** Mean over billed runs only — unfinished runs would drag it towards zero. */
  costPerApplication: number
  averageSeconds: number
}

/**
 * Aggregate a set of queue rows.
 *
 * Rows without a duration are excluded from BOTH the total and the divisor. A
 * queued or failed-before-launch application consumed no browser time, and
 * counting it would understate the true cost of the ones that ran.
 */
export function summarizeCost(
  rows: CostInput[],
  kind: BrowserKind = DEFAULT_BROWSER_KIND
): CostSummary {
  let billedRuns = 0
  let totalSeconds = 0

  for (const r of rows ?? []) {
    const s = runSeconds(r)
    if (s === null) continue
    billedRuns++
    totalSeconds += s
  }

  const totalCost = totalSeconds * KERNEL_RATES[kind]
  return {
    billedRuns,
    totalSeconds,
    totalCost,
    costPerApplication: billedRuns > 0 ? totalCost / billedRuns : 0,
    averageSeconds: billedRuns > 0 ? totalSeconds / billedRuns : 0,
  }
}
