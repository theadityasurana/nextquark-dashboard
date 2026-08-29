/**
 * Institutional memory about *sites*, not about candidates.
 *
 * The answer bank already runs this flywheel for what a candidate says. There
 * is no equivalent for how a site behaves, so everything we've learned about
 * ATS quirks lives as constants and comments that only a human can update:
 * Lever wants `/apply` appended, Workday needs a longer DOM-settle, Ashby flags
 * a submit that lands too fast after the last keystroke. When a site changes,
 * that knowledge silently becomes wrong and nothing notices.
 *
 * A domain skill is one durable fact about one domain, learned from a run:
 *
 *   - **distilled** after each run by asking the model a deliberately narrow
 *     question — the stable map of the site, never a narration of this run and
 *     never anything about the person applying
 *   - **PII-gated** before storage, because these are shared across candidates
 *   - **versioned** per domain, so an update supersedes rather than overwrites
 *   - **scored** by whether runs that used it succeeded, and **auto-retired**
 *     once the score falls far enough that the site has clearly moved on
 *
 * The pure logic is here; Supabase IO is in `domain-skills-store.ts`.
 */

export type SkillStatus = "active" | "retired"

export interface DomainSkill {
  id?: string
  domain: string
  content: string
  version: number
  score: number
  status: SkillStatus
  timesUsed?: number
  createdAt?: string
}

/** Score at or below which a skill retires. Three net-negative runs. */
export const RETIRE_THRESHOLD = -3

/** How many skills are injected into a run's guidance. */
export const MAX_SKILLS_PER_RUN = 5

/** Hard cap on a stored skill, so one runaway distillation can't bloat prompts. */
export const MAX_SKILL_CHARS = 600

// ─── PII gate ───

/**
 * Patterns that disqualify content from being stored.
 *
 * These skills are shared across every candidate, so a distillation that leaked
 * "filled email as priya@example.com" must never be written. The gate is
 * deliberately trigger-happy: a rejected skill costs nothing, a leaked one is a
 * privacy incident.
 */
const PII_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/, label: "email address" },
  { re: /\b\+?\d[\d\-\s().]{7,}\d\b/, label: "phone number" },
  { re: /(?:sk-|ghp_|xox[baprs]-|AKIA|Bearer\s)[A-Za-z0-9_\-]{8,}/, label: "API key or token" },
  {
    re: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Dr|Drive)\b/,
    label: "street address",
  },
  { re: /\b(?:\d[ -]*?){13,19}\b/, label: "card-like number sequence" },
  { re: /\b\d{4}[- ]?\d{4}[- ]?\d{4}\b/, label: "identity number" },
]

/**
 * Résumé/profile phrasings that mean the model narrated the candidate rather
 * than the site. Cheaper and more reliable here than name detection, which
 * needs a model we don't run in this process.
 */
const PERSONAL_NARRATION_RE =
  /\b(the candidate(?:'s)?|the applicant(?:'s)?|their (?:resume|résumé|salary|phone|email|name|address)|years of experience|answered (?:yes|no) to)\b/i

export interface PiiVerdict {
  clean: boolean
  reason: string | null
}

/** Whether content is safe to store as a shared skill. */
export function piiClean(content: string): PiiVerdict {
  const text = content || ""
  for (const { re, label } of PII_PATTERNS) {
    if (re.test(text)) return { clean: false, reason: `contains a ${label}` }
  }
  if (PERSONAL_NARRATION_RE.test(text)) {
    return { clean: false, reason: "describes the candidate rather than the site" }
  }
  return { clean: true, reason: null }
}

// ─── Distillation ───

const DISTIL_SYSTEM = `You distill durable, reusable knowledge about a WEBSITE from one automation run.

Capture the stable map of the site: URL patterns, the shape of its form, widgets that need special handling, hidden waits, traps, and what the final action is called. Do NOT narrate what happened in this run. Do NOT mention any person, résumé content, answer text, email, phone number, or credential — the result is shared across every candidate and anything personal disqualifies it.

If there is nothing durable worth saving, set worth_saving to false. Most routine successful runs on a well-understood portal teach nothing new; saying so is the correct answer.`

export interface DistilInput {
  domain: string
  portal: string
  succeeded: boolean
  /** Compact per-phase history. */
  timeline: string[]
  /** Field labels and the widget kind each turned out to be. */
  fieldSummary: string[]
  /** What went wrong, when something did. */
  failures: string[]
  /** Skills already stored for this domain — so we don't re-learn them. */
  existing: string[]
}

export function buildDistilPrompt(i: DistilInput): { system: string; prompt: string } {
  return {
    system: DISTIL_SYSTEM,
    prompt: `Domain: ${i.domain}
ATS: ${i.portal}
Run outcome: ${i.succeeded ? "submitted successfully" : "did not submit"}

Run phases: ${i.timeline.join(" · ") || "not recorded"}

Form fields encountered:
${i.fieldSummary.slice(0, 40).map((f) => `- ${f}`).join("\n") || "- none recorded"}

${i.failures.length ? `Problems hit:\n${i.failures.slice(0, 10).map((f) => `- ${f}`).join("\n")}` : "No problems recorded."}

Already known about this domain (do not repeat any of these):
${i.existing.length ? i.existing.map((s) => `- ${s}`).join("\n") : "- nothing yet"}

Reply with strict JSON only:
{"worth_saving": true|false, "content": "one or two sentences of durable site knowledge, under ${MAX_SKILL_CHARS} characters"}`,
  }
}

export interface DistilledSkill {
  worthSaving: boolean
  content: string
  /** Set when the distillation was rejected rather than simply declined. */
  rejectedReason: string | null
}

/**
 * Parse and gate a distillation reply in one step.
 *
 * The gate lives here rather than at the call site so there is exactly one path
 * from "model said something" to "safe to store", and it cannot be bypassed by
 * a future caller that forgets to check.
 */
export function parseDistilReply(raw: string | null | undefined): DistilledSkill {
  const nothing: DistilledSkill = { worthSaving: false, content: "", rejectedReason: null }
  if (!raw) return nothing

  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return nothing

  let parsed: any
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return nothing
  }

  if (!parsed?.worth_saving) return nothing

  const content = String(parsed.content ?? "").replace(/\s+/g, " ").trim()
  if (content.length < 20) {
    return { worthSaving: false, content: "", rejectedReason: "distillation was too short to be useful" }
  }
  if (content.length > MAX_SKILL_CHARS) {
    return { worthSaving: false, content: "", rejectedReason: `distillation exceeded ${MAX_SKILL_CHARS} characters` }
  }

  const gate = piiClean(content)
  if (!gate.clean) {
    return { worthSaving: false, content: "", rejectedReason: `PII gate rejected it: ${gate.reason}` }
  }

  return { worthSaving: true, content, rejectedReason: null }
}

// ─── Scoring ───

/**
 * Adjust a skill's score from a run outcome.
 *
 * Asymmetric on purpose. A success is weak evidence the skill helped — the run
 * might have succeeded anyway — so it earns +1. A failure on a run that used
 * the skill is stronger evidence it is now wrong (sites change; a stale
 * selector actively misleads), so it costs -1 but compounds toward the retire
 * threshold faster because successes are capped.
 */
export function scoreAfterRun(current: number, succeeded: boolean): number {
  if (succeeded) return Math.min(current + 1, 10)
  return current - 1
}

/** Whether a score means the skill should retire. */
export function shouldRetire(score: number): boolean {
  return score <= RETIRE_THRESHOLD
}

/**
 * Pick which skills go into a run's guidance: active only, best score first,
 * newest version breaking ties, capped.
 */
export function selectSkills(all: DomainSkill[], limit = MAX_SKILLS_PER_RUN): DomainSkill[] {
  return all
    .filter((s) => s.status === "active")
    .sort((a, b) => b.score - a.score || b.version - a.version)
    .slice(0, limit)
}

/**
 * Render selected skills as a guidance block for the agent instruction.
 *
 * Framed as "learned from previous runs" and explicitly overridable, because a
 * stale skill must not outrank what the model can see on the page right now.
 */
export function buildSkillGuidance(skills: DomainSkill[]): string {
  if (!skills.length) return ""
  const lines = skills.map((s) => `- ${s.content}`).join("\n")
  return `\nLearned from previous runs on this site (treat as hints, not rules — if the page contradicts one, believe the page):\n${lines}\n`
}

/** The domain a skill is keyed on: the registrable host of the apply URL. */
export function skillDomain(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    const labels = host.split(".")
    // Keep three labels for ATS subdomains, where the tenant is the identity:
    // acme.wd5.myworkdayjobs.com and beta.wd5.myworkdayjobs.com behave differently.
    if (/myworkdayjobs|greenhouse|lever|ashbyhq|icims|smartrecruiters|workable/.test(host)) {
      return host
    }
    return labels.length <= 2 ? host : labels.slice(-2).join(".")
  } catch {
    return null
  }
}
