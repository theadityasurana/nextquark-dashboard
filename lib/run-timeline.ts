/**
 * Structured run timeline for an automation run.
 *
 * Before this, the only record of what a run did was a flat stream of log lines
 * in `application_logs` plus throttled screenshots — so answering "which step did
 * this die on?" meant reading prose. This module records the run as a small set
 * of named steps, each with a status, a duration, a detail line, and any
 * screenshots captured while it was the active step.
 *
 * The state machine is pure ({@link applyEvent}) and unit-tested; {@link RunTracker}
 * is the thin IO wrapper that debounces snapshots into
 * `live_application_queue.run_timeline`. Persistence is best-effort by design —
 * a telemetry write must never be able to fail an application run, so every
 * database error is swallowed.
 */

/** Canonical steps, in the order the kernel driver executes them. */
export const RUN_STEPS = [
  { id: "session", label: "Browser session" },
  { id: "navigate", label: "Load application page" },
  { id: "resume_download", label: "Fetch résumé" },
  { id: "prefill", label: "Deterministic pre-fill" },
  { id: "resume_upload", label: "Attach résumé" },
  { id: "ai_fill", label: "AI field completion" },
  { id: "verification", label: "CAPTCHA / OTP" },
  { id: "audit", label: "Final audit" },
  { id: "submit", label: "Submit" },
  { id: "confirm", label: "Confirmation" },
] as const

export type RunStepId = (typeof RUN_STEPS)[number]["id"]

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped"

export interface RunStep {
  id: RunStepId
  label: string
  status: StepStatus
  startedAt: string | null
  endedAt: string | null
  durationMs: number | null
  /** One-line, operator-facing summary of what the step actually did. */
  detail: string | null
  error: string | null
  screenshots: string[]
}

export interface RunTimeline {
  steps: RunStep[]
  startedAt: string
  endedAt: string | null
  /** The step that failed, if any — what the failure card anchors on. */
  failedStep: RunStepId | null
  /** Form-reported validation errors seen after a submit attempt. */
  validationErrors: string[]
  confirmationId: string | null
  confirmationConfidence: "high" | "medium" | "low" | null
}

export type TimelineEvent =
  | { type: "begin"; step: RunStepId; at?: string }
  | { type: "succeed"; step: RunStepId; detail?: string; at?: string }
  | { type: "fail"; step: RunStepId; error: string; at?: string }
  | { type: "skip"; step: RunStepId; detail?: string; at?: string }
  | { type: "detail"; step: RunStepId; detail: string }
  | { type: "screenshot"; url: string }
  | { type: "validationErrors"; errors: string[] }
  | { type: "confirmation"; id: string | null; confidence: "high" | "medium" | "low" }
  | { type: "end"; at?: string }

/**
 * Human label for a step id — used where only the denormalized `failed_step`
 * column is on hand (queue cards) and the full timeline isn't loaded. Falls back
 * to the raw id so an id written by a newer driver still renders something.
 */
export function stepLabel(id: string | null | undefined): string | null {
  if (!id) return null
  return RUN_STEPS.find((s) => s.id === id)?.label ?? id
}

/** A fresh timeline with every step pending. */
export function initTimeline(startedAt: string = new Date().toISOString()): RunTimeline {
  return {
    steps: RUN_STEPS.map((s) => ({
      id: s.id,
      label: s.label,
      status: "pending" as StepStatus,
      startedAt: null,
      endedAt: null,
      durationMs: null,
      detail: null,
      error: null,
      screenshots: [],
    })),
    startedAt,
    endedAt: null,
    failedStep: null,
    validationErrors: [],
    confirmationId: null,
    confirmationConfidence: null,
  }
}

/** The step currently running, or null when none is. */
export function activeStep(t: RunTimeline): RunStep | null {
  return t.steps.find((s) => s.status === "running") ?? null
}

function withStep(
  t: RunTimeline,
  id: RunStepId,
  fn: (s: RunStep) => RunStep
): RunTimeline {
  return { ...t, steps: t.steps.map((s) => (s.id === id ? fn(s) : s)) }
}

function elapsed(startedAt: string | null, endedAt: string): number | null {
  if (!startedAt) return null
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  return Number.isFinite(ms) && ms >= 0 ? ms : null
}

/**
 * Apply one event to a timeline, returning a new timeline. Pure — no clock, no
 * IO: callers pass `at` when they need a deterministic timestamp (tests do).
 *
 * A `begin` on a step that already ran re-opens it, which is deliberate: the
 * driver legitimately revisits `ai_fill`/`submit` after fixing validation errors,
 * and the timeline should show the latest attempt rather than the stale verdict.
 */
export function applyEvent(t: RunTimeline, e: TimelineEvent): RunTimeline {
  const now = "at" in e && e.at ? e.at : new Date().toISOString()

  switch (e.type) {
    case "begin":
      return withStep(t, e.step, (s) => ({
        ...s,
        status: "running",
        startedAt: now,
        endedAt: null,
        durationMs: null,
        error: null,
      }))

    case "succeed":
      return withStep(t, e.step, (s) => ({
        ...s,
        status: "success",
        endedAt: now,
        durationMs: elapsed(s.startedAt, now),
        detail: e.detail ?? s.detail,
        error: null,
      }))

    case "fail": {
      const next = withStep(t, e.step, (s) => ({
        ...s,
        status: "failed",
        endedAt: now,
        durationMs: elapsed(s.startedAt, now),
        error: e.error,
      }))
      // First failure wins — it's the one that explains the run.
      return { ...next, failedStep: t.failedStep ?? e.step }
    }

    case "skip":
      return withStep(t, e.step, (s) => ({
        ...s,
        status: "skipped",
        endedAt: now,
        durationMs: null,
        detail: e.detail ?? s.detail,
      }))

    case "detail":
      return withStep(t, e.step, (s) => ({ ...s, detail: e.detail }))

    case "screenshot": {
      // Screenshots land on whichever step is open when they're captured; with
      // none open they'd be orphaned, so drop them rather than mis-attribute.
      const target = activeStep(t)
      if (!target) return t
      return withStep(t, target.id, (s) =>
        s.screenshots.includes(e.url)
          ? s
          : { ...s, screenshots: [...s.screenshots, e.url] }
      )
    }

    case "validationErrors":
      return { ...t, validationErrors: e.errors }

    case "confirmation":
      return { ...t, confirmationId: e.id, confirmationConfidence: e.confidence }

    case "end":
      return {
        ...t,
        endedAt: now,
        // Any step still open when the run ends never reported a verdict.
        steps: t.steps.map((s) =>
          s.status === "running"
            ? {
                ...s,
                status: "failed" as StepStatus,
                endedAt: now,
                durationMs: elapsed(s.startedAt, now),
                error: s.error ?? "Run ended while this step was still in progress",
              }
            : s
        ),
      }
  }
}

export interface TimelineSummary {
  total: number
  completed: number
  failed: number
  skipped: number
  totalMs: number | null
  failedStep: RunStepId | null
  /** Steps that actually ran, for a compact "3 of 10 done" style readout. */
  attempted: number
}

/** Roll a timeline up into the counts the queue card and header render. */
export function summarize(t: RunTimeline): TimelineSummary {
  const completed = t.steps.filter((s) => s.status === "success").length
  const failed = t.steps.filter((s) => s.status === "failed").length
  const skipped = t.steps.filter((s) => s.status === "skipped").length
  const attempted = t.steps.filter((s) => s.status !== "pending").length
  return {
    total: t.steps.length,
    completed,
    failed,
    skipped,
    attempted,
    failedStep: t.failedStep,
    totalMs: t.endedAt ? elapsed(t.startedAt, t.endedAt) : null,
  }
}

// ─── IO wrapper ───

type PersistFn = (timeline: RunTimeline) => Promise<void>

/**
 * Stateful tracker the driver calls as it runs. Wraps the pure reducer and
 * debounces writes so a chatty run doesn't turn into one UPDATE per event.
 *
 * Every persist is best-effort: telemetry must never fail a run.
 */
export class RunTracker {
  private timeline: RunTimeline
  private persist: PersistFn
  private timer: ReturnType<typeof setTimeout> | null = null
  private dirty = false
  private readonly debounceMs: number

  constructor(persist: PersistFn, debounceMs = 1500) {
    this.timeline = initTimeline()
    this.persist = persist
    this.debounceMs = debounceMs
  }

  private emit(e: TimelineEvent) {
    this.timeline = applyEvent(this.timeline, e)
    this.dirty = true
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.debounceMs)
  }

  begin(step: RunStepId) {
    this.emit({ type: "begin", step })
  }
  succeed(step: RunStepId, detail?: string) {
    this.emit({ type: "succeed", step, detail })
  }
  fail(step: RunStepId, error: string) {
    this.emit({ type: "fail", step, error })
  }
  skip(step: RunStepId, detail?: string) {
    this.emit({ type: "skip", step, detail })
  }
  detail(step: RunStepId, detail: string) {
    this.emit({ type: "detail", step, detail })
  }
  screenshot(url: string) {
    this.emit({ type: "screenshot", url })
  }
  validationErrors(errors: string[]) {
    this.emit({ type: "validationErrors", errors })
  }
  confirmation(id: string | null, confidence: "high" | "medium" | "low") {
    this.emit({ type: "confirmation", id, confidence })
  }

  /** Close the run and force a final write. */
  async end(): Promise<RunTimeline> {
    this.timeline = applyEvent(this.timeline, { type: "end" })
    this.dirty = true
    await this.flush()
    return this.timeline
  }

  snapshot(): RunTimeline {
    return this.timeline
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.dirty) return
    this.dirty = false
    try {
      await this.persist(this.timeline)
    } catch {
      // Telemetry is never allowed to break a run.
    }
  }
}
