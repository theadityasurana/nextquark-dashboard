import { createAdminClient } from "./supabase/admin"
import axios from "axios"
import Kernel, { ConflictError, RateLimitError, APIError } from "@onkernel/sdk"
import { detectPortal } from "./portal-detector"
import type { AutomationResponse, StreamCallback } from "./browser-use"
import { fetchOtpViaApi } from "./otp-fetcher"
import { RunTracker, type RunTimeline } from "./run-timeline"
import { extractConfirmationId, looksLikeId } from "./confirmation-id"
import { isDateQuestion, isConsentQuestion, defaultStartDate, dateCandidates, valuesAgree } from "./field-answers"
import { optionSelectorFor } from "./ats-fields"
import { selectHandler, buildHandlerProgram, type ElementDescriptor, type HandlerResult } from "./field-handlers"
import { buildOptionPrompt, buildOptionRetryPrompt, matchReplyToOption } from "./answer-prompts"
import { resolvePhoneCountry } from "./phone-country"
import { coverage, isSensitiveQuestion, recallAnswer, type AnswerCoverage } from "./application-answers"
import { loadAnswerBank, recordAnswerUsage, recordMissingAnswer } from "./answer-bank-store"
import { classifyControl, decideNextStep, fingerprintPage, StepTracker } from "./wizard"
import { CAPTCHA_DETECT_CODE, buildInjectCode, isSolvable, solveCaptcha, type CaptchaDetection } from "./captcha"
import { buildJudgePrompt, parseJudgeReply, reconcile, type SubmissionEvidence } from "./submission-judge"
import { diagnose, type Diagnosis, type RunSignals } from "./diagnose"
import { evaluatePage as evaluateUnsafePage } from "./unsafe-page"
import { HONEYPOT_PROBE, isHoneypot, type HoneypotDescriptor } from "./honeypot"
import { AX_SCAN_CODE, mergeAxFields, needsVisionFallback, type RawAxNode } from "./ax-scan"
import { buildDistilPrompt, parseDistilReply, skillDomain } from "./domain-skills"
import { loadSkillGuidance, recordSkill, recordSkillFeedback } from "./domain-skills-store"
import { detectEmailApply, sendApplicationEmail } from "./email-apply"
import { acquireProfileSlot, releaseProfileSlot, type ProfileSlot } from "./job-lease"
import { clearDispatchGate } from "./dispatch-gate"
import { clearConcurrencyCache, fetchConcurrencyLimit } from "./kernel-limits"
import { acquirePooledBrowser, isPoolable, releasePooledBrowser, type PooledBrowser } from "./browser-pool"
import { buildCodeModePrompt, CODE_MODE_ENABLED, parseCodeReply, screenCode, verifyNoSideEffects } from "./code-mode"
import { VM_DOM_HELPERS } from "./vm-dom"
import { buildLlmChain, classifyLlmStatus, parseRetryDelaySeconds, refreshFreeModels, GEMINI_TEXT_MODELS, type LlmAttempt } from "./llm-models"
import { routeField, validateAnswerForField, shapeOf } from "./answer-policy"
import { AnswerLedger, type Blocker } from "./answer-ledger"
import { applySchema, fetchAtsSchema, type AtsSchema } from "./ats-schema"

/**
 * Operator override for the profile-pool size. Normally unset — the size is
 * derived from the Kernel plan's concurrency limit at run time.
 */
const PROFILE_POOL_SIZE_OVERRIDE = process.env.KERNEL_PROFILE_POOL_SIZE
  ? Number(process.env.KERNEL_PROFILE_POOL_SIZE)
  : null

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createAdminClient()

// ─── Micro-logging switches ───
// MICRO_LOGS: pipe Stagehand's internal reasoning (what it observes / decides) into application_logs.
// CAPTURE_SCREENSHOTS: enable the telemetry `screenshot` category — a base64 PNG of what the agent
// sees each tick, uploaded to the `screenshots` storage bucket and logged as a URL. Heavier; opt-in.
const MICRO_LOGS = true
const CAPTURE_SCREENSHOTS = true
const SCREENSHOT_MIN_INTERVAL_MS = 4000  // throttle so we don't spam storage/logs

// Simple portals where form structure is predictable — use pure Playwright, zero LLM calls
const PURE_PLAYWRIGHT_PORTALS = new Set(["Greenhouse", "Lever", "Ashby"])

interface PortalConfig {
  maxSteps: number
  timeout: number
  model: string
  residential: boolean
  gpu: boolean
  cua: boolean           // Claude: cua:true for Workday/iCIMS (non-standard components handle better with computer-use grounding)
  domSettleTimeout: number  // Claude: 8000 for Workday (async section loads), 5000 elsewhere
}

const PORTAL_CONFIGS: Record<string, PortalConfig> = {
  // Q1/Q3: Workday and iCIMS are reCAPTCHA-heavy — ISP proxy outperforms residential for reCAPTCHA.
  // Q10: gpu:true for Workday/LinkedIn (canvas+WebGL fingerprinting targets).
  // Claude: Greenhouse/Lever/Ashby bumped to 30 — 15 was too low for 10+ custom questions + scroll-verify pass
  // Claude: cua:true for Workday/iCIMS (non-standard components), cua:false for clean-DOM portals
  // Claude: domSettleTimeout 8000 for Workday (async section loads after Next), 5000 elsewhere
  Greenhouse:      { maxSteps: 30, timeout: 300,  model: "google/gemini-2.5-flash", residential: false, gpu: false, cua: false, domSettleTimeout: 5000 },
  Lever:           { maxSteps: 30, timeout: 300,  model: "google/gemini-2.5-flash", residential: false, gpu: false, cua: false, domSettleTimeout: 5000 },
  Ashby:           { maxSteps: 30, timeout: 300,  model: "google/gemini-2.5-flash", residential: false, gpu: false, cua: false, domSettleTimeout: 5000 },
  Workday:         { maxSteps: 40, timeout: 600,  model: "google/gemini-2.5-flash", residential: false, gpu: true,  cua: true,  domSettleTimeout: 8000 },
  iCIMS:           { maxSteps: 35, timeout: 480,  model: "google/gemini-2.5-flash", residential: false, gpu: false, cua: true,  domSettleTimeout: 5000 },
  SmartRecruiters: { maxSteps: 25, timeout: 420,  model: "google/gemini-2.5-flash", residential: false, gpu: false, cua: false, domSettleTimeout: 5000 },
  BambooHR:        { maxSteps: 22, timeout: 300,  model: "google/gemini-2.5-flash", residential: false, gpu: false, cua: false, domSettleTimeout: 5000 },
  Jobvite:         { maxSteps: 25, timeout: 420,  model: "google/gemini-2.5-flash", residential: false, gpu: false, cua: false, domSettleTimeout: 5000 },
  LinkedIn:        { maxSteps: 25, timeout: 480,  model: "google/gemini-2.5-flash", residential: true,  gpu: true,  cua: false, domSettleTimeout: 5000 },
}

const DEFAULT_PORTAL_CONFIG: PortalConfig = { maxSteps: 25, timeout: 420, model: "google/gemini-2.5-flash", residential: false, gpu: false, cua: false, domSettleTimeout: 5000 }

/**
 * How many pages a portal's application may span before we stop advancing.
 *
 * A ceiling, not an expectation — reaching it means something went wrong, so it
 * is set just above the worst real case per portal rather than generously. The
 * single-page boards get 3 (form, occasional review, confirmation); Workday and
 * iCIMS genuinely run six or seven screens.
 */
const PORTAL_WIZARD_STEPS: Record<string, number> = {
  Greenhouse: 3,
  Lever: 3,
  Ashby: 3,
  SmartRecruiters: 5,
  BambooHR: 4,
  Jobvite: 5,
  LinkedIn: 6,
  Workday: 9,
  iCIMS: 8,
}
const DEFAULT_WIZARD_STEPS = 6

function wizardStepsFor(portalName: string): number {
  return PORTAL_WIZARD_STEPS[portalName] ?? DEFAULT_WIZARD_STEPS
}

function getPortalConfig(portalName: string): PortalConfig {
  return PORTAL_CONFIGS[portalName] || DEFAULT_PORTAL_CONFIG
}

// ─── OpenRouter: primary LLM provider (fresh quota, OpenAI-compatible) ───
// Kernel+Stagehand call the LLM directly with the user's key, so an exhausted Gemini quota
// silently starves every agent pass (0 actions → nothing gets filled). OpenRouter is used
// first, with Gemini and OpenAI as fallbacks.
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

// ─── Cached keys ───
let cachedKernelApiKey: string | null = null
let cachedGeminiApiKey: string | null = null
let cachedOpenAiApiKey: string | null = null
let cachedOpenRouterApiKey: string | null = null
let cachedGroqApiKey: string | null = null
// The independent CAPTCHA solver (CapSolver-compatible). Optional: without it
// we fall back to the browser vendor's auto-solve and then to a human.
let cachedCaptchaSolverKey: string | null = null

async function getKeys(): Promise<{ apiKey: string; geminiKey: string; openAiKey: string; openRouterKey: string; groqKey: string; captchaSolverKey: string }> {
  if (cachedKernelApiKey && cachedGeminiApiKey !== null && cachedOpenAiApiKey !== null && cachedOpenRouterApiKey !== null && cachedGroqApiKey !== null && cachedCaptchaSolverKey !== null) {
    return { apiKey: cachedKernelApiKey, geminiKey: cachedGeminiApiKey, openAiKey: cachedOpenAiApiKey, openRouterKey: cachedOpenRouterApiKey, groqKey: cachedGroqApiKey, captchaSolverKey: cachedCaptchaSolverKey }
  }
  try {
    const { data } = await supabase.from("settings").select("kernelApiKey, geminiApiKey, openAiApiKey, openRouterApiKey, groqApiKey, captchaSolverApiKey").single()
    cachedKernelApiKey = process.env.KERNEL_API_KEY || data?.kernelApiKey || ""
    cachedGeminiApiKey = process.env.GEMINI_API_KEY || data?.geminiApiKey || ""
    cachedOpenAiApiKey = process.env.OPENAI_API_KEY || data?.openAiApiKey || ""
    cachedOpenRouterApiKey = process.env.OPENROUTER_API_KEY || data?.openRouterApiKey || ""
    cachedGroqApiKey = process.env.GROQ_API_KEY || data?.groqApiKey || ""
    cachedCaptchaSolverKey = process.env.CAPTCHA_SOLVER_API_KEY || data?.captchaSolverApiKey || ""
  } catch {
    cachedKernelApiKey = process.env.KERNEL_API_KEY || ""
    cachedGeminiApiKey = process.env.GEMINI_API_KEY || ""
    cachedOpenAiApiKey = process.env.OPENAI_API_KEY || ""
    cachedOpenRouterApiKey = process.env.OPENROUTER_API_KEY || ""
    cachedGroqApiKey = process.env.GROQ_API_KEY || ""
    cachedCaptchaSolverKey = process.env.CAPTCHA_SOLVER_API_KEY || ""
  }
  return { apiKey: cachedKernelApiKey!, geminiKey: cachedGeminiApiKey!, openAiKey: cachedOpenAiApiKey!, openRouterKey: cachedOpenRouterApiKey!, groqKey: cachedGroqApiKey!, captchaSolverKey: cachedCaptchaSolverKey! }
}

/**
 * The Kernel API key, for callers that need it before a run starts — the
 * dispatch gate reads the plan's concurrency limit with it.
 */
export async function getKernelApiKey(): Promise<string> {
  const { apiKey } = await getKeys()
  return apiKey
}

export function clearCachedKernelKey() {
  // The dispatch gate and the concurrency limit were both derived from this
  // key, so a new key must not keep running against the old plan's limits.
  clearDispatchGate()
  clearConcurrencyCache()
  cachedKernelApiKey = null
  cachedGeminiApiKey = null
  cachedOpenAiApiKey = null
  cachedOpenRouterApiKey = null
  cachedGroqApiKey = null
  cachedCaptchaSolverKey = null
}

// ─── Build the ordered list of Stagehand model configs to try ───
//
// Direct Gemini first, OpenRouter last, for every portal.
//
// OpenRouter used to lead for DOM/tool agents on the theory that OpenAI models
// support function-calling most reliably. In practice the direct Gemini entry
// was answering these calls anyway — every successful act() in a live run is
// logged [google/gemini-2.5-flash] — while the three OpenRouter entries ahead of
// it were being tried first and failing, because a credit-exhausted OpenRouter
// account returns HTTP 402 rather than declining to be chosen. That is three
// guaranteed round trips, about eleven seconds, in front of every single AI call
// on the form.
//
// Putting the provider we actually have quota on first makes OpenRouter what it
// should have been: the fallback for when Gemini is rate-limited or out.
//
// The cua flag no longer changes the order — it happened to produce this order
// already for Computer-Use portals, since OpenRouter cannot drive CUA providers.
type ModelChoice = { label: string; stagehandModel: any; apiKey: string }

/**
 * Groq, first in every chain.
 *
 * OpenAI-compatible endpoint, so it needs no new transport — only a base URL.
 * Both models below are named `openai/...` in Groq's own catalogue, which means
 * they satisfy Stagehand's provider-prefix check (see STAGEHAND_PROVIDER_PREFIXES)
 * without any rewriting. That is what makes Groq usable for observe/act and not
 * just for text answers.
 *
 * 120b leads on quality, 20b follows as the faster, cheaper retry — a chain of
 * two costs nothing extra unless the first one fails.
 */
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1"
export const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]

/** How many free OpenRouter models to offer Stagehand before falling back to paid. */
const STAGEHAND_FREE_MODELS = 4

/**
 * Vendor prefixes Stagehand's aiSDK layer will accept.
 *
 * Stagehand does not take our word for the provider. It re-derives one from the
 * text BEFORE the first slash in `modelName` and rejects anything outside this
 * set with "<vendor> is not currently supported for aiSDK".
 *
 * That is invisible for the paid entries only by luck: OpenRouter names its
 * OpenAI and Google models `openai/…` and `google/…`, which collide with real
 * provider names. Most of the free tier does not — `minimax/…`, `z-ai/…`,
 * `nvidia/…`, `dots-studio/…` — and offering those to Stagehand cost four
 * guaranteed failures and about fourteen seconds on EVERY escalation before a
 * working model was reached.
 *
 * The id cannot be rewritten to dodge this: OpenRouter needs the full vendor
 * prefix to route the call, so `openai/minimax/…` is simply a 404. Filtering is
 * the only correct move here.
 *
 * `askModel` is deliberately unaffected — it calls OpenRouter over plain fetch,
 * never through Stagehand, so the whole free tier stays available for the text
 * answers where most of the free-model value actually is.
 */
const STAGEHAND_PROVIDER_PREFIXES = new Set(["openai", "google", "anthropic", "xai", "azure", "bedrock", "vertex"])

/** Can Stagehand actually route this OpenRouter model id? */
export function isStagehandRoutableModel(id: string): boolean {
  const vendor = String(id || "").split("/")[0]
  return STAGEHAND_PROVIDER_PREFIXES.has(vendor.toLowerCase())
}

export function buildModelChain(
  cua: boolean,
  keys: { openRouterKey: string; geminiKey: string; openAiKey: string; groqKey?: string },
  freeModels: string[] = freeModelIds
): ModelChoice[] {
  const groq: ModelChoice[] = keys.groqKey
    ? GROQ_MODELS.map((m) => ({
        label: `groq/${m}`,
        apiKey: keys.groqKey!,
        stagehandModel: { provider: "openai", modelName: m, apiKey: keys.groqKey!, baseURL: GROQ_BASE_URL },
      }))
    : []
  // OpenAI models via OpenRouter first — the DOM agent relies on function/tool-calling, which
  // OpenAI models support most reliably. Gemini-via-OpenRouter is a secondary option.
  const openRouter: ModelChoice[] = keys.openRouterKey ? [
    { label: "openrouter/gpt-4o-mini",      apiKey: keys.openRouterKey, stagehandModel: { provider: "openai", modelName: "openai/gpt-4o-mini",       apiKey: keys.openRouterKey, baseURL: OPENROUTER_BASE_URL } },
    { label: "openrouter/gpt-4.1-mini",     apiKey: keys.openRouterKey, stagehandModel: { provider: "openai", modelName: "openai/gpt-4.1-mini",      apiKey: keys.openRouterKey, baseURL: OPENROUTER_BASE_URL } },
    { label: "openrouter/gemini-2.5-flash", apiKey: keys.openRouterKey, stagehandModel: { provider: "openai", modelName: "google/gemini-2.5-flash", apiKey: keys.openRouterKey, baseURL: OPENROUTER_BASE_URL } },
  ] : []
  // Object form so each agent() call carries its OWN provider+key (works when many models share
  // one Stagehand instance — a bare string model would inherit the instance's construction key).
  const direct: ModelChoice[] = []
  if (keys.geminiKey) direct.push({ label: "google/gemini-2.5-flash", apiKey: keys.geminiKey, stagehandModel: { provider: "google", modelName: "google/gemini-2.5-flash", apiKey: keys.geminiKey } })
  if (keys.openAiKey) {
    direct.push({ label: "gpt-4.1-mini", apiKey: keys.openAiKey, stagehandModel: { provider: "openai", modelName: "gpt-4.1-mini", apiKey: keys.openAiKey } })
    direct.push({ label: "gpt-4o-mini",  apiKey: keys.openAiKey, stagehandModel: { provider: "openai", modelName: "gpt-4o-mini", apiKey: keys.openAiKey } })
  }
  // ── The free tier goes AHEAD of the paid one ──
  //
  // These are the same models `askModel` has always kept as its last resort, but
  // Stagehand was never offered them at all: buildModelChain only ever knew about
  // the three paid entries, so all 64 observe/act escalations in a live run went
  // through models the account had no credit for. Zero-cost models that might
  // work belong in front of paid models that are returning HTTP 402.
  //
  // Capped, because unlike a text answer each Stagehand attempt re-sends a full
  // accessibility tree — a long chain of unlikely models is expensive in latency
  // even when every call is free. The curated list is ordered JSON-capable first
  // (see FREE_OPENROUTER_MODELS), which is what observe/act needs, so taking the
  // head of it takes the models most likely to actually answer.
  const freeOpenRouter: ModelChoice[] = keys.openRouterKey
    ? freeModels.filter(isStagehandRoutableModel).slice(0, STAGEHAND_FREE_MODELS).map((m) => ({
        label: `openrouter-free/${m}`,
        apiKey: keys.openRouterKey,
        stagehandModel: { provider: "openai", modelName: m, apiKey: keys.openRouterKey, baseURL: OPENROUTER_BASE_URL },
      }))
    : []

  void cua
  return [...groq, ...direct, ...freeOpenRouter, ...openRouter]
}

/**
 * Mirror every run log to stdout, timestamped.
 *
 * Off by default. The run's own narration is written to `application_logs`,
 * which is the right place for it in production but useless when you are
 * watching a single run in a terminal and want to see what the agent decided,
 * in order, as it happens.
 */
const CONSOLE_LOGS = process.env.KERNEL_CONSOLE_LOGS === "1"

/**
 * Fill the form, audit it, and then STOP instead of clicking the final button.
 *
 * The submit click is the one irreversible thing a run does: it puts a real
 * application in front of a real employer. This makes every step before it
 * observable without that consequence — the submit gate still runs in full and
 * reports the verdict it would have acted on.
 */
const DRY_RUN = process.env.KERNEL_DRY_RUN === "1"

let consoleLogStart = Date.now()
function consoleLog(level: string, message: string) {
  if (!CONSOLE_LOGS) return
  const t = ((Date.now() - consoleLogStart) / 1000).toFixed(1).padStart(6)
  const tag = level === "error" ? "ERR " : level === "warn" ? "WARN" : "INFO"
  console.log(`[${t}s] ${tag} ${message}`)
}

/**
 * Probe each configured LLM key once and report which ones actually work.
 *
 * A dead key is not a silent condition — it is the most expensive failure in the
 * whole run. The chain is tried in order for EVERY field, so one 401 key at the
 * front costs three failed round-trips (~10s) per field, on every field, and
 * then quietly falls through. A run against a nine-field form spent 90 seconds
 * discovering the same 401 nine times.
 *
 * Cached per key value for the life of the process: a probe is cheap, but not
 * cheap enough to repeat per run.
 */
const llmKeyHealth = new Map<string, boolean>()

async function probeLlmKey(provider: "openrouter" | "gemini" | "openai" | "groq", key: string): Promise<boolean> {
  if (!key) return false
  const cacheKey = `${provider}:${key.slice(-8)}`
  const cached = llmKeyHealth.get(cacheKey)
  if (cached !== undefined) return cached

  let ok = false
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 8000)
    try {
      if (provider === "groq") {
        // Groq's /models requires the key, so it authenticates without spending
        // generation quota — the same property that makes Gemini's ListModels
        // the right probe there.
        const r = await fetch(`${GROQ_BASE_URL}/models`, { signal: ctl.signal, headers: { Authorization: `Bearer ${key}` } })
        ok = r.ok
      } else if (provider === "gemini") {
        // ─── Probe the KEY, not one model's minute-quota ───
        //
        // Generating a completion here conflated two very different things: an
        // invalid key and a model that is merely rate-limited. Google's free
        // tier allows 20 requests per minute PER MODEL, so a healthy key
        // routinely answers 429 — and the old probe then dropped Gemini from the
        // chain for the whole run, leaving nothing to answer with.
        //
        // ListModels authenticates the key without consuming generation quota,
        // which is exactly the question being asked.
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal: ctl.signal })
        ok = r.ok
      } else {
        // ─── Probe an AUTHENTICATED endpoint ───
        // OpenRouter serves /models publicly: it returns 200 for a garbage key,
        // so the old probe reported a dead key as healthy and the run then hit
        // 401 on every single field. /credits requires the key to be real.
        const url = provider === "openrouter"
          ? `${OPENROUTER_BASE_URL}/credits`
          : "https://api.openai.com/v1/models"
        const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: ctl.signal })
        ok = r.ok
      }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    ok = false
  }
  llmKeyHealth.set(cacheKey, ok)
  return ok
}

/** Drop providers whose keys do not authenticate, so no field pays for them. */
async function healthyKeys(
  keys: { openRouterKey: string; geminiKey: string; openAiKey: string; groqKey?: string },
  applicationId?: string
): Promise<{ openRouterKey: string; geminiKey: string; openAiKey: string; groqKey: string; report: string }> {
  const [orOk, gemOk, oaiOk, groqOk] = await Promise.all([
    probeLlmKey("openrouter", keys.openRouterKey),
    probeLlmKey("gemini", keys.geminiKey),
    probeLlmKey("openai", keys.openAiKey),
    probeLlmKey("groq", keys.groqKey || ""),
  ])
  const say = (name: string, present: boolean, good: boolean) =>
    !present ? `${name}: not configured` : good ? `${name}: OK` : `${name}: REJECTED (key not recognised)`
  const report = [
    say("Groq", !!keys.groqKey, groqOk),
    say("OpenRouter", !!keys.openRouterKey, orOk),
    say("Gemini", !!keys.geminiKey, gemOk),
    say("OpenAI", !!keys.openAiKey, oaiOk),
  ].join(" · ")

  if (applicationId) {
    const anyDead = (keys.openRouterKey && !orOk) || (keys.geminiKey && !gemOk) || (keys.openAiKey && !oaiOk) || (keys.groqKey && !groqOk)
    await persistLog(applicationId, anyDead ? "warn" : "info", `LLM key check — ${report}`)
  }
  return {
    openRouterKey: orOk ? keys.openRouterKey : "",
    geminiKey: gemOk ? keys.geminiKey : "",
    openAiKey: oaiOk ? keys.openAiKey : "",
    groqKey: groqOk ? (keys.groqKey || "") : "",
    report,
  }
}

// ─── Batched, non-blocking log writer ───
//
// Every log line used to be an awaited INSERT sitting on the critical path of
// the run. That is a round-trip per line, and it is why logging had to be kept
// sparse: richer narration would have made the run measurably slower. Batching
// removes the cost, which is what makes it affordable to record every decision
// the agent makes — the plan, the route for each field, the handler outcome,
// the audit — rather than a summary.
//
// Ordering is preserved by a single in-flight flush chain, and `flushLogs()` is
// awaited once at the end of a run so nothing is lost when the process exits.
const LOG_BATCH_SIZE = 25
const LOG_FLUSH_MS = 1200
let logQueue: Array<Record<string, any>> = []
let logFlushTimer: ReturnType<typeof setTimeout> | null = null
let logFlushChain: Promise<void> = Promise.resolve()
let logSeq = 0

function scheduleLogFlush() {
  if (logFlushTimer) return
  logFlushTimer = setTimeout(() => {
    logFlushTimer = null
    void flushLogs()
  }, LOG_FLUSH_MS)
}

/** Write everything queued. Safe to call at any time; awaited at run end. */
async function flushLogs(): Promise<void> {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer)
    logFlushTimer = null
  }
  const batch = logQueue
  if (batch.length === 0) return logFlushChain
  logQueue = []
  logFlushChain = logFlushChain
    .then(async () => {
      try {
        await supabase.from("application_logs").insert(batch)
      } catch {
        // A log that cannot be stored must never fail the application it is
        // describing. The console mirror already has it.
      }
    })
    .catch(() => {})
  return logFlushChain
}

async function persistLog(applicationId: string, level: string, message: string) {
  consoleLog(level, message)
  // With no application row to write to there is nothing to persist, but the
  // console mirror above still fires — which is what makes an ad-hoc run
  // observable without creating a queue row just to read its logs.
  if (!applicationId) return
  logQueue.push({
    // A monotonic counter breaks ties: several lines can share a millisecond,
    // and the UI orders by timestamp.
    id: `log-${Date.now()}-${(logSeq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    level,
    agent_id: applicationId,
    message: `[Kernel] ${message}`,
    application_id: applicationId,
  })
  if (logQueue.length >= LOG_BATCH_SIZE) await flushLogs()
  else scheduleLogFlush()
}

// Build a RunTracker that writes its timeline into live_application_queue.
// The denormalized columns (failed_step, confirmation_id, …) are written alongside
// the JSONB so the queue list can filter and badge without parsing every document.
function makeRunTracker(applicationId: string): RunTracker {
  return new RunTracker(async (timeline: RunTimeline) => {
    await supabase
      .from("live_application_queue")
      .update({
        run_timeline: timeline,
        failed_step: timeline.failedStep,
        confirmation_id: timeline.confirmationId,
        confirmation_confidence: timeline.confirmationConfidence,
        validation_errors: timeline.validationErrors.length ? timeline.validationErrors : null,
      })
      .eq("id", applicationId)
  })
}

// Upload a base64 PNG telemetry screenshot to the `screenshots` storage bucket; return public URL.
// Returns null on any failure (e.g. bucket missing) so the caller can stop trying.
let screenshotBucketReady = false
async function uploadScreenshot(applicationId: string, pngBase64: string): Promise<string | null> {
  try {
    const bytes = Buffer.from(pngBase64, "base64")
    const path = `${applicationId}/${Date.now()}.png`
    let { error } = await supabase.storage.from("screenshots").upload(path, bytes, { contentType: "image/png", upsert: true })
    if (error && !screenshotBucketReady) {
      // Bucket may not exist yet — create it once (public) and retry.
      await supabase.storage.createBucket("screenshots", { public: true }).catch(() => {})
      screenshotBucketReady = true
      const retry = await supabase.storage.from("screenshots").upload(path, bytes, { contentType: "image/png", upsert: true })
      error = retry.error
    }
    if (error) return null
    const { data } = supabase.storage.from("screenshots").getPublicUrl(path)
    return data?.publicUrl || null
  } catch {
    return null
  }
}

// ─── Persistent Profile Management ───
// Distributed lock via Supabase to prevent concurrent profile writes.
// The Kernel docs note that the check-then-create is two separate requests,
// so a DB-level advisory lock is required to prevent a race between workers.
async function getOrCreateKernelProfile(
  userId: string,
  userName: string,
  kernel: InstanceType<typeof Kernel>
): Promise<{ profileName: string; safeToWrite: boolean } | null> {
  try {
    const profileName = `user-${userId}-${userName.replace(/\s+/g, "-").toLowerCase()}`
    try {
      await kernel.profiles.create({ name: profileName })
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err
    }

    // Distributed lock: attempt to insert a lock row for this profile.
    // Only one worker can hold the lock at a time — others get a conflict and
    // fall back to save_changes:false rather than risking a concurrent write.
    let safeToWrite = false
    try {
      const lockKey = `kernel_profile_${userId}`
      const { error } = await supabase
        .from("kernel_profile_locks")
        .insert({ lock_key: lockKey, locked_at: new Date().toISOString() })
      if (!error) {
        // We hold the lock — safe to write
        safeToWrite = true
      } else {
        // Another worker holds the lock (unique constraint violation)
        console.warn(`[Kernel] Profile ${profileName} lock held by another worker. Disabling save_changes.`)
      }
    } catch {
      // Lock table may not exist yet — fall back to the old active-session check
      try {
        const activeBrowsers = await (kernel.browsers as any).list({ status: "active" })
        const profileSessions = Array.isArray(activeBrowsers)
          ? activeBrowsers.filter((b: any) => b.profile?.name === profileName && b.profile?.save_changes === true)
          : []
        safeToWrite = profileSessions.length === 0
        if (!safeToWrite) {
          console.warn(`[Kernel] Profile ${profileName} in use by ${profileSessions.length} active session(s). Disabling save_changes.`)
        }
      } catch {
        safeToWrite = false
      }
    }

    return { profileName, safeToWrite }
  } catch (err) {
    console.error("[Kernel] Profile management failed:", err)
    return null
  }
}

// Release the profile lock in the finally block after deleteByID.
async function releaseProfileLock(userId: string): Promise<void> {
  try {
    await supabase.from("kernel_profile_locks").delete().eq("lock_key", `kernel_profile_${userId}`)
  } catch {}
}

// ─── Submission confirmation signals per portal ───
const PORTAL_SUBMISSION_SIGNALS: Record<string, { urlPatterns: RegExp[]; confirmationText: RegExp[] }> = {
  Greenhouse:      { urlPatterns: [/\/confirmation/i, /thank/i],    confirmationText: [/application (has been )?submitted/i, /thank you for applying/i, /we('ve| have) received your application/i] },
  Lever:           { urlPatterns: [/\/thanks/i],                    confirmationText: [/thank you for applying/i, /application (has been )?received/i] },
  Ashby:           { urlPatterns: [],                               confirmationText: [/application (has been )?submitted/i, /thanks for applying/i, /we('ve| have) received/i] },
  Workday:         { urlPatterns: [/\/confirmation/i, /\/complete/i], confirmationText: [/thank you for your interest/i, /application (has been )?submitted/i] },
  iCIMS:           { urlPatterns: [/\/confirmation/i],              confirmationText: [/thank you/i, /application (has been )?submitted/i] },
  SmartRecruiters: { urlPatterns: [/\/confirmation/i, /\/thank/i],  confirmationText: [/thank you for applying/i, /application submitted/i] },
}
const DEFAULT_SUBMISSION_SIGNALS = {
  urlPatterns: [/confirmation/i, /thank/i, /success/i, /submitted/i],
  confirmationText: [/thank you/i, /application submitted/i, /successfully applied/i, /application received/i, /we have received/i],
}

// ─── confirmSubmission: DOM/URL-based truth, never trusts agent self-report ───
// Claude: a submission can ONLY be confirmed if we actually clicked Submit (didClickSubmit).
// Without that gate, static boilerplate like "Thank you for your interest" that sits ABOVE
// most job forms was matching confirmationText and reporting success on an untouched form.
// "form gone" is now detected by counting VISIBLE fillable inputs, not by the presence of a
// [required] attribute — React ATS forms (Greenhouse/Lever/Ashby) validate in JS and rarely
// set [required], which previously made formGone=true on a fully-visible empty form.
async function confirmSubmission(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  portalType: string,
  targetUrl: string,
  didClickSubmit: boolean,
  applicationId?: string
): Promise<{
  submitted: boolean
  confidence: 'high' | 'medium' | 'low'
  reason: string
  confirmationText?: string
  /** ATS-issued reference printed on the confirmation page, when there is one. */
  confirmationId?: string
  confirmationLabel?: string
}> {
  // Hard gate: if Submit was never clicked, the application was NOT submitted — full stop.
  if (!didClickSubmit) {
    if (applicationId) await persistLog(applicationId, "warn", "confirmSubmission: Submit was never clicked — form incomplete, not submitted")
    return { submitted: false, confidence: 'high', reason: 'Submit button was never clicked (form was incomplete)' }
  }
  try {
    const signals = PORTAL_SUBMISSION_SIGNALS[portalType] || DEFAULT_SUBMISSION_SIGNALS
    const urlPatternSources = signals.urlPatterns.map(p => p.source)
    const textPatternSources = signals.confirmationText.map(p => p.source)

    const checkRes = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
const currentUrl = page.url();
const info = await page.evaluate(() => {
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  };
  const bodyText = document.body.innerText;
  const visibleInputs = Array.from(document.querySelectorAll(
    'input[type="text"],input[type="email"],input[type="tel"],input[type="url"],input:not([type]),textarea,select'
  )).filter(isVisible).length;
  const visibleSubmit = Array.from(document.querySelectorAll('button,input[type="submit"]'))
    .some(b => isVisible(b) && /submit|apply|send application/i.test(b.innerText || b.value || ''));
  const visibleErrors = Array.from(document.querySelectorAll('[aria-invalid="true"],.error,.invalid,[class*="error"]'))
    .filter(isVisible).length;
  // 2500 chars, not 800: a confirmation reference often sits below the heading
  // and a short window was truncating it away before extractConfirmationId saw it.
  return { bodyText: bodyText.substring(0, 2500), visibleInputs, visibleSubmit, visibleErrors };
});
return { currentUrl, ...info };
`,
      timeout_sec: 15,
    })

    const { currentUrl, bodyText, visibleInputs, visibleSubmit, visibleErrors } = (checkRes.result as any) || {}
    const urlMatch = urlPatternSources.some(src => new RegExp(src, 'i').test(currentUrl || ""))
    const textMatchSrc = textPatternSources.find(src => new RegExp(src, 'i').test(bodyText || ""))
    // Form is "gone" only when there are no visible fillable inputs AND no visible submit button.
    const formGone = (visibleInputs ?? 1) === 0 && !visibleSubmit

    // Receipt: the reference the ATS printed, if any. Independent of the verdict
    // below — we extract it once here and attach it to whichever branch returns.
    const ref = extractConfirmationId(bodyText)
    if (ref && applicationId) {
      await persistLog(applicationId, "info", `Confirmation ${ref.label}: ${ref.id}`)
    }
    const receipt = ref ? { confirmationId: ref.id, confirmationLabel: ref.label } : {}

    if (applicationId) {
      await persistLog(applicationId, "info",
        `confirmSubmission: url=${currentUrl?.substring(0, 60)} | urlMatch=${urlMatch} | textMatch=${!!textMatchSrc} | formGone=${formGone} (inputs=${visibleInputs}, submitBtn=${visibleSubmit}) | visibleErrors=${visibleErrors}`
      )
    }

    // Validation errors appeared after clicking Submit → the click bounced, form rejected.
    if ((visibleErrors ?? 0) > 0 && !formGone) {
      return { submitted: false, confidence: 'high', reason: `${visibleErrors} validation error(s) after Submit — form rejected` }
    }
    // Strongest signal: form disappeared after we clicked Submit (navigated to confirmation page).
    if (formGone && (visibleErrors ?? 0) === 0) {
      return { submitted: true, confidence: 'high', reason: 'Form gone after Submit + no errors', confirmationText: textMatchSrc, ...receipt }
    }
    // URL/text confirmation appeared after our click.
    if ((urlMatch || textMatchSrc) && (visibleErrors ?? 0) === 0) {
      return { submitted: true, confidence: 'medium', reason: 'URL/text confirmation after Submit, no errors', confirmationText: textMatchSrc, ...receipt }
    }
    // Still attach any reference we found. It does NOT upgrade the verdict — but
    // an operator triaging this run wants to see that the page printed an ID.
    return { submitted: false, confidence: 'low', reason: `Clicked Submit but no confirmation signal (inputs=${visibleInputs}, urlMatch=${urlMatch}, textMatch=${!!textMatchSrc})`, ...receipt }
  } catch (err) {
    return { submitted: false, confidence: 'low', reason: `confirmSubmission check failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ─── uploadResumeFromBuffer: the fallback attach, run inside the Kernel VM ───
//
// This used to drive the Stagehand `page` we hold locally. Two reasons it no
// longer does. First, that object is a CDP proxy and never was a full Playwright
// Page — `waitForEvent("filechooser")` and friends simply are not on it, and the
// v4 client removes `evaluate()` outright. Second, the VM already has a real
// Playwright Page, so doing it there is both more capable and consistent with
// every other DOM operation in this file.
//
// Takes the buffer we already downloaded, so a résumé URL that has since expired
// or rate-limited does not cost us the retry. Ships it as base64 because the VM
// program is a string.
async function uploadResumeFromBuffer(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  applicationId?: string
): Promise<{ uploaded: boolean; method: string }> {
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
const NAME = ${JSON.stringify(fileName)};
const MIME = ${JSON.stringify(mimeType)};
const B64 = ${JSON.stringify(buffer.toString("base64"))};
const buffer = Buffer.from(B64, 'base64');
const fileArg = { name: NAME, mimeType: MIME, buffer };

// A file counts as attached only when the page says so — either the input holds
// a file, or the ATS rendered the filename somewhere. Checking only the input
// misses Greenhouse and Ashby, which move the file into their own widget and
// leave the input empty.
const verify = async () => {
  try {
    return await page.evaluate((name) => {
      const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
      if (inputs.some(i => i.files && i.files.length > 0)) return true;
      const stem = (name.split('.')[0] || name).toLowerCase();
      return stem.length > 3 && document.body.innerText.toLowerCase().includes(stem);
    }, NAME);
  } catch { return false; }
};

if (await verify()) return { uploaded: true, method: 'already-present' };

// ─── Give the upload time to land before declaring it failed ───
//
// setInputFiles returns as soon as the file is handed to the input, but the
// portal then uploads it (Greenhouse POSTs to S3) and re-renders before any
// evidence appears in the DOM. Checking once, immediately, therefore asked the
// question before the answer could exist: a live run logged a successful
// "201 POST .../s3.amazonaws.com" at 34.1s, failed its instant verify, walked
// every remaining input, fell through to the Attach-button path, and reported
// success at 63.6s — thirty seconds spent re-uploading a file that was already
// there.
//
// Polling costs nothing on the happy path (it exits on the first true) and only
// spends its budget when the upload genuinely is slow.
const verifyFor = async (ms) => {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await verify()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(250);
  }
};

let lastErr = '';

// 1. Straight at every file input, including hidden ones — setInputFiles does
//    not require visibility, which is the whole reason it beats clicking.
try {
  const inputs = page.locator('input[type="file"]');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    try {
      await inputs.nth(i).setInputFiles(fileArg);
      if (await verifyFor(8000)) return { uploaded: true, method: 'setInputFiles-buffer', inputs: n };
    } catch (e) { lastErr = String(e && e.message || e); }
  }
} catch (e) { lastErr = String(e && e.message || e); }

// 2. Click the visible Attach/Upload control and satisfy the file chooser.
//    Needed where the real input is created only once the button is pressed.
try {
  const btn = page.locator(
    'button:has-text("Attach"), button:has-text("Upload"), button:has-text("Choose file"), button:has-text("Browse"), ' +
    'label:has-text("Attach"), label:has-text("Upload"), label:has-text("Choose file"), label:has-text("Browse"), ' +
    '[role="button"]:has-text("Attach"), [role="button"]:has-text("Upload")'
  ).first();
  if (await btn.count() > 0) {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 8000 }),
      btn.click(),
    ]);
    await chooser.setFiles(fileArg);
    if (await verifyFor(8000)) return { uploaded: true, method: 'filechooser-buffer' };
  }
} catch (e) { lastErr = String(e && e.message || e); }

return { uploaded: false, method: 'none', error: lastErr.slice(0, 300) };
`,
      timeout_sec: 90,
    })
    const r = (res.result as any) || { uploaded: false, method: "none" }
    if (applicationId) {
      await persistLog(
        applicationId,
        r.uploaded ? "info" : "warn",
        r.uploaded
          ? `Resume attached from buffer via ${r.method}`
          : `Resume attach from buffer failed. Last error: ${r.error || "no file input found / verify failed"}`
      )
    }
    return { uploaded: !!r.uploaded, method: r.method || "none" }
  } catch (err) {
    if (applicationId) {
      await persistLog(applicationId, "warn", `Resume attach from buffer threw: ${err instanceof Error ? err.message : String(err)}`)
    }
    return { uploaded: false, method: "none" }
  }
}

// ─── selectCountryCode: 3-pattern fallback for phone country code ───
// Claude: digits filled but flag not clicked is the #1 silent failure on phone fields.
// Hard gate: always verify +91/India is selected AFTER phone digits are filled.
async function selectCountryCodeInPage(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  country: { name: string; dial: string; iso: string },
  applicationId?: string
): Promise<{ selected: boolean }> {
  const result = await kernelClient.browsers.playwright.execute(sessionId, {
    code: `
// Derived from the candidate's own profile. This was hardcoded to India/+91,
// which silently set the wrong dial code for every non-Indian candidate.
const countryName = ${JSON.stringify(country.name)};
const dialCode = ${JSON.stringify(country.dial)};
const isoCode = ${JSON.stringify(country.iso.toLowerCase())};
let matchedPattern = 'none';

// ─── Pattern A0: react-select country picker, checked HONESTLY ───
//
// Greenhouse renders the phone country as react-select (id #country, options
// react-select-country-option-N) with a hidden required input holding the real
// submitted value. Pattern A below matched one of its decorative [class*=flag]
// nodes, found the word "India" somewhere in its text, and returned
// 'A:already-correct' without ever opening anything — so every run logged
// "Country code: +91 India selected" while the field sat visibly empty.
//
// A fuzzy text match is not evidence of a committed value. The hidden input is.
// When it is empty we report NOT selected, which keeps Country on the work list
// for the Phase 2 typeahead handler — the one that now knows how to drive
// react-select — instead of silently declaring victory here.
const rsCountry = page.locator('#country,[id^="react-select-country"]').first();
if (await rsCountry.count() > 0) {
  const committed = await rsCountry.evaluate((el) => {
    const shell = el.closest('[class*="select__container"],[class*="phone-input__country"],[class*="select"]');
    if (!shell) return '';
    const single = shell.querySelector('[class*="single-value"],[class*="singleValue"]');
    const hidden = shell.querySelector('input[aria-hidden="true"],input[type="hidden"]');
    return ((single && single.textContent) || '').trim() || ((hidden && hidden.value) || '').trim();
  }).catch(() => '');
  if (committed) {
    return { selected: true, matchedPattern: 'A0:react-select-already-correct' };
  }
  return { selected: false, matchedPattern: 'A0:react-select-empty-deferred' };
}

// Pattern A: intl-tel-input style flag button
const flagTrigger = page.locator('[class*="flag"],[class*="country-code"],[class*="phone-country"],[class*="iti__flag"]').first();
if (await flagTrigger.count() > 0) {
  const currentText = await flagTrigger.textContent() || '';
  const currentData = await flagTrigger.getAttribute('data-country') || '';
  if (currentText.includes(countryName) || currentText.includes(dialCode) || currentData.toLowerCase() === isoCode) {
    return { selected: true, matchedPattern: 'A:already-correct' };
  }
  await flagTrigger.click();
  await page.waitForTimeout(400);
  const searchBox = page.locator('input[placeholder*="Search" i],.iti__search-input').first();
  if (await searchBox.count() > 0) {
    await searchBox.pressSequentially(countryName, { delay: 30 });
    await page.waitForTimeout(300);
  }
  const digits = dialCode.replace(/\D/g, '');
  const opt = page.locator(
    '.iti__country-list li[data-dial-code="' + digits + '"],' +
    '[data-country-code="' + isoCode + '"],' +
    'li:has-text("' + countryName + '"),' +
    '[role="option"]:has-text("' + countryName + '")'
  ).first();
  if (await opt.count() > 0) {
    await opt.click();
    await page.waitForTimeout(200);
    return { selected: true, matchedPattern: 'A:flag-list' };
  }
  matchedPattern = 'A:trigger-found-option-missing';
}

// Pattern B: native <select> for country/dial code
const select = page.locator('select[name*="country" i],select[id*="country" i],select[name*="phone" i],select[id*="phone" i]').first();
if (await select.count() > 0) {
  try {
    await select.selectOption({ label: new RegExp(countryName, 'i') });
    return { selected: true, matchedPattern: 'B:select-label' };
  } catch {
    try { await select.selectOption({ value: isoCode.toUpperCase() }); return { selected: true, matchedPattern: 'B:select-iso' }; } catch {}
    try { await select.selectOption({ value: dialCode.replace(/\D/g, '') }); return { selected: true, matchedPattern: 'B:select-dial' }; } catch {}
    matchedPattern = 'B:select-found-no-option';
  }
}

// Pattern C: role=combobox (Workday/Ashby style)
const combobox = page.locator('[role="combobox"][aria-label*="country" i],[role="combobox"][aria-label*="phone" i]').first();
if (await combobox.count() > 0) {
  await combobox.click();
  await page.waitForTimeout(300);
  // Include Workday promptOption nodes, which carry no role=option.
  const option = page.locator(
    '[role="option"]:has-text("' + countryName + '"), [data-automation-id="promptOption"]:has-text("' + countryName + '")'
  ).first();
  if (await option.count() > 0) {
    await option.click();
    return { selected: true, matchedPattern: 'C:combobox' };
  }
  matchedPattern = 'C:combobox-found-no-option';
}

// ─── Pattern D: react-select combobox labelled via aria-labelledby ───
//
// Modern Greenhouse (job-boards.greenhouse.io) renders Country as:
//   <label id="country-label" for="country">Country*</label>
//   <input id="country" role="combobox" aria-labelledby="country-label"
//          aria-autocomplete="list" aria-required="true">
// inside <fieldset class="phone-input"><div class="phone-input__country">.
//
// There is NO <select> anywhere on the page, no flag class, and — critically —
// no aria-label, so A, B and C all miss it and every run logged
// "Country code: NOT selected". Resolving the label through aria-labelledby and
// through the wrapper is what finds it.
const resolveLabel = async (handle) => {
  return await handle.evaluate((el) => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const direct = clean(el.getAttribute('aria-label'));
    if (direct) return direct;
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = clean(by.split(/\\s+/).map(id => document.getElementById(id)?.textContent || '').join(' '));
      if (t) return t;
    }
    if (el.id) {
      const l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]');
      if (l) return clean(l.textContent);
    }
    const wrap = el.closest('[class*="country"],[class*="phone"],fieldset,[class*="field"]');
    const wl = wrap && wrap.querySelector('label,legend');
    return wl ? clean(wl.textContent) : '';
  });
};

const candidates = await page.locator(
  '[role="combobox"], input[aria-autocomplete="list"], [class*="country"] input, [class*="phone"] input[role="combobox"]'
).elementHandles();

for (const handle of candidates) {
  let labelText = '';
  try { labelText = await resolveLabel(handle); } catch { continue; }
  if (!/country|phone|dial|code/i.test(labelText)) continue;

  // Already showing the right country? Then touching it would only risk
  // clearing a correct value.
  try {
    const shown = await handle.evaluate((el) => {
      const wrap = el.closest('[class*="select"],[class*="control"],[class*="country"]');
      const chosen = wrap && wrap.querySelector('[class*="singleValue"],[class*="single-value"],[class*="selectedValue"]');
      return ((chosen && chosen.textContent) || el.value || '').trim();
    });
    if (shown && (shown.includes(countryName) || shown.includes(dialCode))) {
      return { selected: true, matchedPattern: 'D:already-correct' };
    }
  } catch {}

  try {
    await handle.scrollIntoViewIfNeeded().catch(() => {});
    await handle.click();
    await page.waitForTimeout(350);
    // Type to filter — a 250-entry country list is virtualised, so the option
    // is usually not in the DOM until the list is narrowed.
    await handle.type(countryName, { delay: 40 }).catch(() => {});
    await page.waitForTimeout(600);

    const opt = page.locator(
      '[role="option"]:has-text("' + countryName + '"), ' +
      '[class*="select__option"]:has-text("' + countryName + '"), ' +
      '[class*="-option"]:has-text("' + countryName + '"), ' +
      'ul[role="listbox"] li:has-text("' + countryName + '")'
    ).first();
    if (await opt.count() > 0) {
      await opt.click();
      await page.waitForTimeout(300);
      return { selected: true, matchedPattern: 'D:react-select' };
    }
    // Keyboard commit: react-select selects the focused option on Enter, which
    // works even when the option node never matched our text selector.
    await handle.press('Enter').catch(() => {});
    await page.waitForTimeout(300);
    const after = await handle.evaluate((el) => {
      const wrap = el.closest('[class*="select"],[class*="control"],[class*="country"]');
      const chosen = wrap && wrap.querySelector('[class*="singleValue"],[class*="single-value"],[class*="selectedValue"]');
      return ((chosen && chosen.textContent) || el.value || '').trim();
    });
    if (after && after.toLowerCase().includes(countryName.toLowerCase().slice(0, 5))) {
      return { selected: true, matchedPattern: 'D:react-select-enter' };
    }
    matchedPattern = 'D:combobox-found-no-option';
  } catch (e) {
    matchedPattern = 'D:threw';
  }
}

return { selected: false, matchedPattern };
`,
    timeout_sec: 25,
  })

  const r = (result.result as any) || { selected: false }
  if (applicationId) {
    await persistLog(
      applicationId,
      r.selected ? "info" : "warn",
      // Name the pattern that matched (or how far it got): "failed to select"
      // alone gave no way to tell which widget shape we were up against.
      `Country code: ${r.selected ? `${country.dial} ${country.name} selected` : "NOT selected"} [${r.matchedPattern || "none"}]`
    )
  }
  return { selected: !!r.selected }
}

// ─── Wait for CAPTCHA solve via telemetry stream (replaces DOM polling) ───
async function waitForCaptchaSolveEvent(
  kernel: InstanceType<typeof Kernel>,
  sessionId: string,
  timeoutMs = 60000
): Promise<boolean> {
  return new Promise(async (resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    try {
      const stream = await (kernel.browsers as any).telemetry.stream(sessionId)
      for await (const { event } of stream) {
        if (event?.type === "captcha_solve_result") {
          clearTimeout(timer)
          resolve(true)
          return
        }
      }
    } catch {
      // stream error — fall back to false so human fallback kicks in
    }
    clearTimeout(timer)
    resolve(false)
  })
}

// ─── Background telemetry stream logger ───
// Runs as a non-blocking background task. Logs every browser event to application_logs.
// Also resolves the captchaSolvePromise when captcha_solve_result fires.
// Q9: service_crashed and system_oom_kill are treated as fatal — signals onFatalError to abort.
// Q6: Fires onNavigationSettled on first page_navigation_settled event (used to replace waitForTimeout).
function startTelemetryLogger(
  kernel: InstanceType<typeof Kernel>,
  sessionId: string,
  applicationId: string,
  onCaptchaSolved: () => void,
  onFatalError: (reason: string) => void,
  onNavigationSettled: () => void,
  // Lets the run timeline attach each uploaded screenshot to whichever step is
  // open when it was captured, instead of leaving them only as log lines.
  onScreenshot?: (url: string) => void
): { stop: () => void } {
  let stopped = false
  let navigationSettledFired = false
  let lastScreenshotAt = 0
  let screenshotsEnabled = CAPTURE_SCREENSHOTS

  const run = async () => {
    let lastSeq = 0
    let attempts = 0
    const MAX_RECONNECT = 5

    while (!stopped && attempts <= MAX_RECONNECT) {
      try {
        // Pass Last-Event-ID on reconnect so the stream resumes without gaps
        const streamOpts = lastSeq > 0 ? { lastEventId: String(lastSeq) } : undefined
        const stream = await (kernel.browsers.telemetry as any).stream(sessionId, streamOpts)
        attempts = 0 // reset on successful connect
        for await (const { seq, event } of stream) {
          if (stopped) break
          if (seq) lastSeq = seq

        // Resolve CAPTCHA waiter
        if (event.type === "captcha_solve_result") {
          const data = (event as any).data
          await persistLog(applicationId, data?.status === "success" ? "info" : "warn",
            `CAPTCHA solve result: ${data?.status} | type: ${data?.captcha_type} | duration: ${data?.duration_ms}ms${data?.error_code ? ` | error: ${data.error_code}` : ""}`
          )
          if (data?.status === "success") onCaptchaSolved()
          continue
        }

        // Log high-value events — skip noisy ones
        const type = event.type as string
        const data = (event as any).data

        if (type === "console_error") {
          await persistLog(applicationId, "error", `[browser:console_error] ${data?.text || ""}${data?.source_url ? ` @ ${data.source_url}:${data?.line}` : ""}`)
        } else if (type === "page_navigation") {
          await persistLog(applicationId, "info", `[browser:navigation] → ${data?.url || ""}`)
        } else if (type === "page_navigation_settled") {
          await persistLog(applicationId, "info", `[browser:navigation_settled] seq=${seq}`)
          // Q6: Signal the main flow that start_url navigation has settled
          if (!navigationSettledFired) {
            navigationSettledFired = true
            onNavigationSettled()
          }
        } else if (type === "network_loading_failed") {
          await persistLog(applicationId, "warn", `[browser:network_failed] ${data?.error_text || ""} | ${data?.resource_type || ""}`)
        } else if (type === "proxy_error") {
          await persistLog(applicationId, "error", `[browser:proxy_error] ${data?.code} | url context: ${data?.url || ""}`)
        } else if (type === "service_crashed") {
          // Q9: Fatal — browser process crashed, session is unrecoverable
          await persistLog(applicationId, "error", `[browser:service_crashed] ${data?.service_name} | phase: ${data?.phase}`)
          onFatalError(`Browser service crashed: ${data?.service_name} (phase: ${data?.phase})`)
        } else if (type === "system_oom_kill") {
          // Q9: Fatal — OOM kill, session is unrecoverable
          await persistLog(applicationId, "error", `[browser:oom_kill] ${data?.process_name} | rss: ${data?.rss_kb}KB`)
          onFatalError(`Browser OOM killed: ${data?.process_name} (rss: ${data?.rss_kb}KB)`)
        } else if (type === "interaction_click") {
          await persistLog(applicationId, "info", `[browser:click] <${data?.tag || "?"}> "${(data?.text || "").slice(0, 60)}" @ ${data?.selector || ""}`)
        } else if (type === "interaction_key") {
          // What the agent is typing, key by key (into which field).
          await persistLog(applicationId, "info", `[browser:key] "${data?.key || ""}" → <${data?.tag || "?"}> ${data?.selector || ""}`)
        } else if (type === "interaction_scroll_settled") {
          await persistLog(applicationId, "info", `[browser:scroll] to y=${data?.to?.y ?? data?.to ?? "?"}`)
        } else if (type === "console_log") {
          await persistLog(applicationId, "info", `[browser:console] ${(data?.text || "").slice(0, 200)}`)
        } else if (type === "network_response") {
          // Skip static assets; log document/xhr/fetch (form submits, API calls the page makes).
          const rt = data?.resource_type || ""
          if (/document|xhr|fetch/i.test(rt)) {
            await persistLog(applicationId, "info", `[browser:net] ${data?.status || ""} ${data?.method || ""} ${(data?.url || "").slice(0, 100)} (${rt})`)
          }
        } else if (type === "page_dom_content_loaded") {
          await persistLog(applicationId, "info", `[browser:dom_ready]`)
        } else if (type === "page_crashed") {
          await persistLog(applicationId, "error", `[browser:page_crashed] ${data?.url || ""}`)
          onFatalError(`Page renderer crashed: ${data?.url || ""}`)
        } else if (type === "monitor_screenshot") {
          // A base64 PNG of exactly what the agent sees. Throttle + upload to storage; log the URL.
          if (data?.png && screenshotsEnabled && (Date.now() - lastScreenshotAt) >= SCREENSHOT_MIN_INTERVAL_MS) {
            lastScreenshotAt = Date.now()
            const url = await uploadScreenshot(applicationId, data.png)
            if (url) {
              await persistLog(applicationId, "info", `[browser:screenshot] ${url}`)
              onScreenshot?.(url)
            }
            else screenshotsEnabled = false  // upload failed (e.g. no bucket) — stop trying, log once
          }
        } else if (type === "monitor_disconnected") {
          await persistLog(applicationId, "warn", `[browser:monitor_disconnected] CDP collector disconnected — will reconnect`)
        } else if (type === "monitor_reconnected") {
          await persistLog(applicationId, "info", `[browser:monitor_reconnected] CDP collector reconnected`)
        } else if (type === "monitor_reconnect_failed") {
          await persistLog(applicationId, "error", `[browser:monitor_reconnect_failed] CDP collector failed to reconnect`)
          onFatalError(`CDP monitor reconnect failed permanently`)
        } else if (type === "cdp_disconnect") {
          await persistLog(applicationId, "warn", `[browser:cdp_disconnect] reason: ${data?.reason} | messages: ${data?.message_count}`)
        }
      }
      } catch (err) {
        if (stopped) break
        attempts++
        await persistLog(applicationId, "warn", `[telemetry_stream_error] attempt ${attempts}/${MAX_RECONNECT}: ${err instanceof Error ? err.message : String(err)}`)
        if (attempts <= MAX_RECONNECT) {
          await new Promise(r => setTimeout(r, Math.min(1000 * attempts, 8000)))
        }
      }
    }
  }

  run() // fire and forget
  return { stop: () => { stopped = true } }
}

// ─── Classify errors for better log messages ───
function classifyError(err: unknown): { level: string; message: string } {
  if (err instanceof RateLimitError) {
    return { level: "error", message: `Kernel rate limit exceeded. Retry-After: ${(err as any).headers?.['retry-after'] || 'unknown'}s` }
  }
  if (err instanceof APIError) {
    return { level: "error", message: `Kernel API error ${(err as any).status}: ${err.message}` }
  }
  if (err instanceof Error) {
    const msg = err.message
    // Gemini/LLM quota errors
    if (msg.includes("quota") || msg.includes("exceeded") || msg.includes("RESOURCE_EXHAUSTED")) {
      return { level: "error", message: `LLM quota/rate limit: ${msg}` }
    }
    // Stagehand maxSteps
    if (msg.includes("maxSteps") || msg.includes("max steps") || msg.includes("step limit")) {
      return { level: "warn", message: `Stagehand step limit reached: ${msg}` }
    }
    return { level: "error", message: `${msg}\nStack: ${err.stack || "no stack"}` }
  }
  return { level: "error", message: String(err) }
}

function buildUserDataJson(userData: any): Record<string, any> {
  const json: Record<string, any> = {}
  if (userData.firstName) json.first_name = userData.firstName
  if (userData.lastName) json.last_name = userData.lastName
  if (userData.name) json.name = userData.name
  if (userData.email) json.email = userData.email
  if (userData.phone) json.phone = userData.phone
  if (userData.location) json.location = userData.location
  if (userData.linkedinUrl) json.linkedin_url = userData.linkedinUrl
  if (userData.githubUrl) json.github_url = userData.githubUrl
  if (userData.gender) json.gender = userData.gender
  if (userData.ethnicity) json.ethnicity = userData.ethnicity
  if (userData.disabilityStatus) json.disability_status = userData.disabilityStatus
  if (userData.veteranStatus) json.veteran_status = userData.veteranStatus
  if (userData.workAuthorization) json.work_authorization = userData.workAuthorization
  if (userData.resume) json.resume_url = userData.resume
  if (userData.coverLetter) json.cover_letter = userData.coverLetter
  if (userData.experience) json.experience = userData.experience
  if (userData.education) json.education = userData.education
  if (userData.certifications) json.certifications = userData.certifications
  if (userData.achievements) json.achievements = userData.achievements
  if (userData.skills?.length > 0) json.skills = userData.skills
  if (userData.salaryMin || userData.salaryMax) {
    json.salary_expectation = `${userData.salaryCurrency || "USD"} ${userData.salaryMin || 0} - ${userData.salaryMax || 0}`
  }
  return json
}

// A label auditForm emitted as a diagnostic descriptor because the element
// carries no usable text. Never send these to act() or the LLM.
const UNIDENTIFIED_FIELD = /^\[unidentified /i

/**
 * Controls the user picks from rather than types into.
 *
 * These are allowed to be driven with no preferred answer: the handler reports
 * the options the widget actually offers and the model chooses from that real
 * list, which is always safer than guessing a string and hoping it matches.
 */
const CHOICE_KINDS = ['select', 'multiselect', 'radio', 'typeahead', 'buttongroup']

// ─── Anti-bot / spam rejections ───
// These are NOT field validation errors. Ashby answered a submit with "flagged
// as possible spam", which readValidationErrors dutifully returned as a field to
// fix — so the driver re-ran the fill loop and submitted again. Re-submitting
// into a spam block cannot succeed and makes the signal worse, so these are
// detected separately and end the run immediately with an honest reason.
const ANTI_BOT_PATTERNS: RegExp[] = [
  /flagged as (?:possible )?spam/i,
  /we couldn'?t submit your application/i,
  /suspected (?:bot|automated) (?:activity|traffic)/i,
  /unusual (?:activity|traffic) (?:detected|from)/i,
  /automated (?:submission|request)s? (?:are )?(?:not allowed|blocked|detected)/i,
  /please verify you are human/i,
  /access denied.*security/i,
  /request (?:was )?blocked by/i,
]

function detectAntiBotBlock(text: string | null | undefined): boolean {
  if (!text) return false
  return ANTI_BOT_PATTERNS.some((re) => re.test(text))
}

// Deliberately specific. The old list contained the bare token "otp", which
// matched any page whose text happened to contain those three letters, and
// "check your email", which appears on plenty of post-submit confirmation
// pages — exactly the pages where a false OTP detection is most damaging.
const OTP_KEYWORDS = [
  "otp_verification_required", "verification code", "verify your email address",
  "enter the code", "confirmation code", "one-time code", "one-time password",
  "we sent a code", "sent you a code", "6-digit code", "six-digit code",
  "enter the 6 digit", "security code we sent",
]
const CAPTCHA_KEYWORDS = ["captcha_verification_required", "captcha", "recaptcha", "hcaptcha", "cloudflare", "i am not a robot", "verify you are human"]

function detectOtp(text: string): boolean {
  return OTP_KEYWORDS.some(kw => text.toLowerCase().includes(kw))
}

/**
 * Is there an OTP challenge ON THE PAGE right now?
 *
 * `detectOtp` reads `allAgentText` — what the Stagehand agent said. Since the
 * typed handlers now do nearly all the filling, the agent rarely speaks, so
 * that string is usually empty and the entire OTP subsystem below it was
 * unreachable in normal operation. The page's own text and its inputs are the
 * signal that actually exists.
 *
 * Requires BOTH a code-shaped input and matching page copy, because either one
 * alone produces false positives: a 6-character input could be a postcode, and
 * "verification code" appears in privacy policies.
 */
async function detectOtpOnPage(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string
): Promise<{ present: boolean; evidence: string }> {
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
return await page.evaluate(() => {
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  };
  const inputs = Array.from(document.querySelectorAll('input')).filter(isVisible);
  const codeInput = inputs.find(el => {
    const hay = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.placeholder || '') + ' ' + (el.getAttribute('autocomplete') || '')).toLowerCase();
    if (/\b(otp|one-?time|verification-?code|verificationcode|auth-?code|security-?code|passcode|mfa|2fa)\b/.test(hay)) return true;
    if (el.getAttribute('autocomplete') === 'one-time-code') return true;
    // A short numeric input is only suggestive, never sufficient on its own.
    const max = parseInt(el.getAttribute('maxlength') || '0', 10);
    return (el.inputMode === 'numeric' || el.type === 'tel') && max >= 4 && max <= 8;
  });
  return {
    hasCodeInput: !!codeInput,
    codeInputName: codeInput ? (codeInput.name || codeInput.id || codeInput.getAttribute('aria-label') || 'unnamed') : '',
    bodyText: document.body.innerText.slice(0, 4000),
  };
});
`,
      timeout_sec: 15,
    })
    const r = (res.result as any) || {}
    const textHit = detectOtp(String(r.bodyText || ""))
    if (r.hasCodeInput && textHit) {
      return { present: true, evidence: `code input "${r.codeInputName}" and matching page copy` }
    }
    return { present: false, evidence: r.hasCodeInput ? "a code-shaped input but no matching page copy" : "no code input" }
  } catch {
    return { present: false, evidence: "page could not be read" }
  }
}
function detectCaptcha(text: string): boolean {
  return CAPTCHA_KEYWORDS.some(kw => text.toLowerCase().includes(kw))
}

// ─── Question classifier: routes known patterns to Playwright, unknown to LLM ───
// Claude: fail-safe approach — if label doesn't match a known pattern, route to LLM.
// This prevents silent mis-answers on unrecognized fields.
const KNOWN_QUESTION_PATTERNS: { pattern: RegExp; handler: string }[] = [
  { pattern: /legally authorized to work|authorized to work in the (us|united states)/i, handler: 'workAuth' },
  { pattern: /require.*sponsorship|sponsorship.*now or in the future|need.*visa.*sponsor/i, handler: 'sponsorship' },
  { pattern: /how did you hear|how did you find|source of (this )?job|referral source/i, handler: 'source' },
  { pattern: /phone type|type of phone/i, handler: 'phoneType' },
  { pattern: /linkedin/i, handler: 'linkedin' },
  { pattern: /portfolio|personal (website|site|url)|github/i, handler: 'portfolio' },
  { pattern: /disability|disabled/i, handler: 'disabilityStatus' },
  { pattern: /veteran|military service/i, handler: 'veteranStatus' },
  { pattern: /gender|pronouns/i, handler: 'gender' },
  { pattern: /race|ethnicity/i, handler: 'ethnicity' },
  { pattern: /salary|compensation|pay expectation/i, handler: 'salary' },
  { pattern: /start date|available to start|earliest start/i, handler: 'startDate' },
  { pattern: /cover letter/i, handler: 'coverLetter' },
  { pattern: /agree|acknowledge|consent|terms|privacy policy/i, handler: 'consent' },
]

function classifyQuestion(labelText: string): string | null {
  const match = KNOWN_QUESTION_PATTERNS.find(p => p.pattern.test(labelText))
  return match?.handler ?? null // null = route to LLM
}

// ─── Dropdown option resolver ───
// Tiered matching so "USA" finds "United States of America", "No" never matches "Norway",
// and "CA" resolves to "California" — without the LLM guessing.
//
// Ported from src/server/workday-select.ts in github.com/jaethebaeee/tsenta.
// Copyright (c) 2026 Jae Hoon Kim. Licensed under the MIT License.
// The MIT license requires this notice be retained — see THIRD-PARTY-NOTICES.md
// for the full license text. Do not remove.

const US_STATES: string[][] = [
  ["alabama","al"],["alaska","ak"],["arizona","az"],["arkansas","ar"],["california","ca"],
  ["colorado","co"],["connecticut","ct"],["delaware","de"],["district of columbia","dc"],
  ["florida","fl"],["georgia","ga"],["hawaii","hi"],["idaho","id"],["illinois","il"],
  ["indiana","in"],["iowa","ia"],["kansas","ks"],["kentucky","ky"],["louisiana","la"],
  ["maine","me"],["maryland","md"],["massachusetts","ma"],["michigan","mi"],["minnesota","mn"],
  ["mississippi","ms"],["missouri","mo"],["montana","mt"],["nebraska","ne"],["nevada","nv"],
  ["new hampshire","nh"],["new jersey","nj"],["new mexico","nm"],["new york","ny"],
  ["north carolina","nc"],["north dakota","nd"],["ohio","oh"],["oklahoma","ok"],["oregon","or"],
  ["pennsylvania","pa"],["rhode island","ri"],["south carolina","sc"],["south dakota","sd"],
  ["tennessee","tn"],["texas","tx"],["utah","ut"],["vermont","vt"],["virginia","va"],
  ["washington","wa"],["west virginia","wv"],["wisconsin","wi"],["wyoming","wy"],
]

const SYNONYM_GROUPS: string[][] = [
  ["united states","united states of america","usa","us","u s","u s a","america"],
  ["united kingdom","uk","u k","great britain","britain"],
  ["united arab emirates","uae"],
  ["prefer not to say","prefer not to answer","decline to self identify","decline to answer",
   "i do not wish to answer","i don t wish to answer","do not wish to disclose",
   "i prefer not to answer","choose not to disclose"],
  ...US_STATES,
]

function normalizeOption(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function synonymsOf(term: string): string[] {
  return SYNONYM_GROUPS.find(g => g.includes(term)) ?? [term]
}

// Returns the index of the best matching option label, or -1 if no confident match.
export function matchOption(want: string, labels: string[]): number {
  const w = normalizeOption(want)
  if (!w) return -1
  const norm = labels.map(normalizeOption)

  // 1. Exact normalized match
  let i = norm.indexOf(w)
  if (i >= 0) return i

  // 2. Synonym class equivalence
  const wantSyn = synonymsOf(w)
  i = norm.findIndex(n => n.length > 0 && synonymsOf(n).some(s => wantSyn.includes(s)))
  if (i >= 0) return i

  // 2b. Yes/No leading-token — "Yes" matches "Yes, I am authorized" but NOT "Norway"
  if (w === "yes" || w === "no") {
    i = norm.findIndex(n => n.split(" ")[0] === w)
    if (i >= 0) return i
  }

  // Short values (≤3 chars) stop here — fuzzy would produce false positives
  if (w.replace(/ /g, "").length <= 3) return -1

  // 3. Prefix match — "California" matches "California (CA)"
  i = norm.findIndex(n => n.length > 0 && (n.startsWith(w) || w.startsWith(n)))
  if (i >= 0) return i

  // 4. Contains
  i = norm.findIndex(n => n.length > 0 && (n.includes(w) || w.includes(n)))
  if (i >= 0) return i

  // 5. All tokens present
  const wantTokens = w.split(" ").filter(Boolean)
  if (wantTokens.length > 0) {
    i = norm.findIndex(n => n.length > 0 && wantTokens.every(t => n.includes(t)))
    if (i >= 0) return i
  }

  return -1
}

// Progressive search terms for searchable comboboxes — most precise first.
export function searchTerms(want: string): string[] {
  const out: string[] = []
  const add = (t: string) => { const v = t.trim(); if (v && !out.some(x => x.toLowerCase() === v.toLowerCase())) out.push(v) }
  add(want)
  const norm = normalizeOption(want)
  for (const s of synonymsOf(norm)) add(s)
  const lead = norm.split(" ").filter(Boolean)[0]
  if (lead) add(lead)
  return out
}

// ─── Phase 1: In-VM Playwright pre-fill ───
// React portals (Greenhouse, Lever, Ashby, SmartRecruiters) need pressSequentially.
// Claude: .fill() sets DOM value but React's synthetic event system doesn't see it.
// pressSequentially triggers real keydown/input/blur events that React's onChange fires on.
// Native setter fallback for components that ignore even pressSequentially (contenteditable, custom inputs).
const REACT_PORTALS = new Set(["Greenhouse", "Lever", "Ashby", "SmartRecruiters"])

function buildPreFillCode(userData: any, resumeFileName: string | null, portalType: string): string {
  // Safe data injection: JSON.stringify handles all escaping correctly.
  // String interpolation with manual quote-escaping was fragile — names or
  // locations containing backslashes, newlines, or Unicode broke the VM script.
  const profile = JSON.stringify({
    phone: (userData.phone || "").replace(/\D/g, "").replace(/^91/, ""),
    firstName: userData.firstName || "",
    lastName: userData.lastName || "",
    fullName: userData.name || `${userData.firstName || ""} ${userData.lastName || ""}`.trim(),
    email: userData.email || "",
    location: userData.location || "",
    linkedinUrl: userData.linkedinUrl || "",
    githubUrl: userData.githubUrl || "",
    workAuth: userData.workAuthorization || "",
    disabilityStatus: userData.disabilityStatus || "",
    veteranStatus: userData.veteranStatus || "",
  })

  // Destructure inside the VM so the rest of the code is unchanged
  const profileBlock = `const _p = ${profile};
const phone = _p.phone, firstName = _p.firstName, lastName = _p.lastName,
  fullName = _p.fullName, email = _p.email, location = _p.location,
  linkedinUrl = _p.linkedinUrl, githubUrl = _p.githubUrl, workAuth = _p.workAuth,
  disabilityStatus = _p.disabilityStatus, veteranStatus = _p.veteranStatus;`

  // TS-level variables still needed for template literal interpolations
  // in the Workday experience block and portal-specific selector strings below.
  // ─── The number WITHOUT its dial code ───
  //
  // Every portal that shows a country dropdown beside the phone box expects the
  // national number only — the dial code is the dropdown's job, and typing it
  // twice produces "+91 +917776004343".
  //
  // The dial code is stripped using the candidate's OWN country, not a hardcoded
  // one. The previous `.replace(/^91/, "")` assumed India and silently corrupted
  // everyone else: a US number in area code 917, "9175551234", came out as
  // "75551234". Guarded on length too, so a national number that merely happens
  // to begin with its own dial digits is left alone.
  const phoneDial = resolvePhoneCountry(userData).dial.replace(/\D/g, "")
  const phoneDigits = (userData.phone || "").replace(/\D/g, "")
  const phone =
    phoneDial && phoneDigits.startsWith(phoneDial) && phoneDigits.length - phoneDial.length >= 7
      ? phoneDigits.slice(phoneDial.length)
      : phoneDigits
  const firstName = (userData.firstName || "").replace(/'/g, "\\'")
  const lastName = (userData.lastName || "").replace(/'/g, "\\'")
  const fullName = (userData.name || `${userData.firstName || ""} ${userData.lastName || ""}`.trim()).replace(/'/g, "\\'")
  const email = (userData.email || "").replace(/'/g, "\\'")
  const location = (userData.location || "").replace(/'/g, "\\'")
  const linkedinUrl = (userData.linkedinUrl || "").replace(/'/g, "\\'")
  const githubUrl = (userData.githubUrl || "").replace(/'/g, "\\'")
  const workAuth = (userData.workAuthorization || "").replace(/'/g, "\\'")
  const disabilityStatus = (userData.disabilityStatus || "").replace(/'/g, "\\'")
  const veteranStatus = (userData.veteranStatus || "").replace(/'/g, "\\'")  // eslint-disable-line @typescript-eslint/no-unused-vars

  const useReactFill = ["Greenhouse", "Lever", "Ashby", "SmartRecruiters"].includes(portalType)

  // Resume is uploaded page-side (uploadResumeViaPage) with a buffer over CDP — the Kernel-
  // recommended approach — so the pre-fill no longer attempts a VM-path upload.
  const resumeBlock = ""

  // fillLocator: react portals need pressSequentially (real keystrokes so React's onChange fires);
  // plain HTML uses locator.fill() (Playwright-recommended — focuses + fires input event).
  // tryFill iterates a CSS fallback list; nativeFill is the last-resort setter for custom inputs.
  // ─── Human interaction timing ───
  // Ashby flagged a submission as spam. A fixed 20ms/char cadence is ~50 chars
  // per second, sustained, with zero variance and no pauses between fields —
  // a shape no person produces. These helpers add per-chunk jitter and
  // occasional thinking pauses.
  //
  // Long values are pasted rather than typed, deliberately: a human writing a
  // 600-character essay answer pastes it from a document. Typing that out
  // keystroke-by-keystroke is the LESS human behaviour, and it would also blow
  // the session timeout.
  const humanHelpers = `
const HUMAN_PASTE_THRESHOLD = 120;
function rnd(min, max) { return min + Math.random() * (max - min); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function humanPause(min, max) { await sleep(rnd(min, max)); }
async function humanType(loc, value) {
  const text = String(value ?? '');
  if (!text) return;
  if (text.length > HUMAN_PASTE_THRESHOLD) { await loc.fill(text); return; }
  // Word-sized chunks, each with its own cadence, plus the occasional pause.
  const chunks = text.match(/\\S+\\s*/g) || [text];
  for (const chunk of chunks) {
    await loc.pressSequentially(chunk, { delay: Math.round(rnd(45, 105)) });
    if (Math.random() < 0.22) await humanPause(110, 340);
  }
}
`

  const helperFns = useReactFill ? `
async function fillLocator(loc, value) {
  await loc.click();
  await humanPause(80, 260);
  await loc.fill('');
  await humanType(loc, value);
  await humanPause(60, 200);
  await loc.blur();
  // Verify the value actually landed — React masked inputs can silently no-op
  const got = await loc.inputValue().catch(() => value);
  if (value && !got.trim()) {
    // Fallback: native setter fires React's synthetic onChange
    await loc.evaluate((el, val) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }
}
async function tryFill(selectors, value) {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
        await fillLocator(loc, value);
        return true;
      }
    } catch {}
  }
  return false;
}
async function nativeFill(selector, value) {
  try {
    const loc = page.locator(selector).first();
    if (await loc.count() === 0) return false;
    await loc.evaluate((el, val) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    return true;
  } catch { return false; }
}
` : `
async function fillLocator(loc, value) {
  await loc.click().catch(() => {});
  await humanPause(80, 240);
  await humanType(loc, value);
  await humanPause(60, 180);
}
async function tryFill(selectors, value) {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
        await fillLocator(loc, value);
        return true;
      }
    } catch {}
  }
  return false;
}
async function nativeFill(selector, value) {
  try {
    const loc = page.locator(selector).first();
    if (await loc.count() === 0) return false;
    await loc.fill(value);
    return true;
  } catch { return false; }
}
`

  // getAssociatedLabelText: label-driven field detection (more stable than hardcoded name= attrs)
  const labelHelper = `
async function getLabelText(field) {
  return await field.evaluate(el => {
    const wrapper = el.closest('[class*="field"],[class*="question"],[class*="form-group"],fieldset');
    return wrapper?.querySelector('label,legend,[class*="label"]')?.textContent?.trim() ?? '';
  }).catch(() => '');
}
// \`exclude\`, when given, vetoes a label the pattern would otherwise claim.
// Needed because the question and its conditional follow-up share vocabulary:
// 'If selected "Referral", who referred you?' matches any pattern loose enough
// to catch "How did you hear about us?", and answering the follow-up invents a
// reason for a trigger that was never selected.
async function findFieldByLabel(pattern, exclude) {
  const inputs = page.locator('input[type="text"],input[type="url"],input[type="email"],textarea,select');
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    const f = inputs.nth(i);
    const label = await getLabelText(f);
    if (!pattern.test(label)) continue;
    if (exclude && exclude.test(String(label || '').trim())) continue;
    return f;
  }
  return null;
}
// Playwright-recommended: prefer getByLabel/getByPlaceholder (robust to DOM/class changes),
// then fall back to the structural label-text scan above.
async function findByLabelPreferred(pattern) {
  try {
    const byLabel = page.getByLabel(pattern).first();
    if (await byLabel.count() > 0 && await byLabel.isVisible({ timeout: 1000 }).catch(() => false)) return byLabel;
  } catch {}
  try {
    const byPh = page.getByPlaceholder(pattern).first();
    if (await byPh.count() > 0 && await byPh.isVisible({ timeout: 500 }).catch(() => false)) return byPh;
  } catch {}
  return await findFieldByLabel(pattern);
}
// fillByLabel: label-first fill with a CSS selector list as fallback (non-regressive).
async function fillByLabel(pattern, value, cssFallback) {
  try {
    const f = await findByLabelPreferred(pattern);
    if (f) {
      const tag = await f.evaluate(el => el.tagName).catch(() => '');
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        // Pause only once we've actually found a field to fill. Pausing before
        // the lookup cost ~350ms on every probe for a field the form doesn't
        // even have — dozens of those per run, for no realism benefit.
        await humanPause(150, 400);
        await f.scrollIntoViewIfNeeded().catch(() => {});
        await fillLocator(f, value);
        return true;
      }
    }
  } catch {}
  return await tryFill(cssFallback, value);
}
// matchOption: tiered resolver — exact normalized > synonym class > yes/no leading token
// > prefix > contains > all-tokens. Short values (<=3 chars) skip fuzzy tiers.
function normalizeOpt(s) {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
const SYNONYM_GROUPS_INLINE = [
  ['united states','united states of america','usa','us','u s','u s a','america'],
  ['united kingdom','uk','u k','great britain','britain'],
  ['prefer not to say','prefer not to answer','decline to self identify','decline to answer',
   'i do not wish to answer','i don t wish to answer','do not wish to disclose','i prefer not to answer','choose not to disclose'],
];
function synonymsOfInline(term) {
  return SYNONYM_GROUPS_INLINE.find(g => g.includes(term)) ?? [term];
}
function matchOptionInline(want, labels) {
  const w = normalizeOpt(want);
  if (!w) return -1;
  const norm = labels.map(normalizeOpt);
  let i = norm.indexOf(w); if (i >= 0) return i;
  const wSyn = synonymsOfInline(w);
  i = norm.findIndex(n => n.length > 0 && synonymsOfInline(n).some(s => wSyn.includes(s))); if (i >= 0) return i;
  if (w === 'yes' || w === 'no') { i = norm.findIndex(n => n.split(' ')[0] === w); if (i >= 0) return i; }
  if (w.replace(/ /g,'').length <= 3) return -1;
  i = norm.findIndex(n => n.length > 0 && (n.startsWith(w) || w.startsWith(n))); if (i >= 0) return i;
  i = norm.findIndex(n => n.length > 0 && (n.includes(w) || w.includes(n))); if (i >= 0) return i;
  const toks = w.split(' ').filter(Boolean);
  if (toks.length > 0) { i = norm.findIndex(n => n.length > 0 && toks.every(t => n.includes(t))); if (i >= 0) return i; }
  return -1;
}
async function trySelectOption(locator, wantValues) {
  // wantValues is now a string[] of candidate values to try in order (most preferred first)
  const tag = await locator.evaluate(el => el.tagName).catch(() => '');
  if (tag === 'SELECT') {
    const options = await locator.evaluate(el => Array.from(el.options).map(o => o.text));
    for (const want of wantValues) {
      const idx = matchOptionInline(want, options);
      if (idx >= 0) { await locator.selectOption({ label: options[idx] }); return true; }
    }
    return false;
  }
  // Custom listbox/combobox
  await locator.click();
  const anyOption = page.locator('[role="option"],li[role="option"],[data-automation-id="promptOption"]').first();
  await anyOption.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  const allOptions = page.locator('[role="option"],li[role="option"],[data-automation-id="promptOption"]');
  const count = await allOptions.count();
  const optionTexts = [];
  for (let oi = 0; oi < count; oi++) { optionTexts.push((await allOptions.nth(oi).textContent() || '').trim()); }
  for (const want of wantValues) {
    const idx = matchOptionInline(want, optionTexts);
    if (idx >= 0) { await allOptions.nth(idx).click(); return true; }
  }
  // Searchable combobox: try typing progressive search terms
  for (const want of wantValues) {
    const terms = [want, want.split(' ')[0]].filter(Boolean);
    for (const term of terms) {
      try {
        await page.locator(':focus').fill(term, { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(400);
        const opts2 = page.locator('[role="option"],[data-automation-id="promptOption"]');
        const c2 = await opts2.count();
        const texts2 = [];
        for (let oi = 0; oi < c2; oi++) { texts2.push((await opts2.nth(oi).textContent() || '').trim()); }
        const idx2 = matchOptionInline(want, texts2);
        if (idx2 >= 0) { await opts2.nth(idx2).click(); return true; }
      } catch {}
    }
  }
  await page.keyboard.press('Escape');
  return false;
}
`

  // Workday uses data-automation-id attributes for stable field targeting
  const workdayFirstSels = portalType === "Workday" ? `'input[data-automation-id="legalNameSection_firstName"]','input[data-automation-id="firstName"]',` : ""
  const workdayLastSels = portalType === "Workday" ? `'input[data-automation-id="legalNameSection_lastName"]','input[data-automation-id="lastName"]',` : ""
  const workdayEmailSels = portalType === "Workday" ? `'input[data-automation-id="email"]',` : ""
  const workdayPhoneSels = portalType === "Workday" ? `'input[data-automation-id="phone-number-input"]',` : ""

  return `
${profileBlock}
const results = {
  firstName: false, lastName: false, fullName: false, email: false,
  phone: false, resume: false, linkedin: false, portfolio: false,
  location: false, workAuth: false, sponsorship: false, source: false,
  phoneType: false, consent: false, disabilityStatus: false, veteranStatus: false,
  preferredName: false
};

${humanHelpers}
${helperFns}
${labelHelper}

// ─── A: Deterministic fields (getByLabel-first, CSS list as fallback) ───
results.firstName = await fillByLabel(/first name|given name|legal first/i, '${firstName}', [${workdayFirstSels}'input[name="first_name"]','input[id*="first"][id*="name" i]','input[placeholder*="First" i]','input[autocomplete="given-name"]','#first_name','#firstName']);
results.lastName = await fillByLabel(/last name|surname|family name|legal last/i, '${lastName}', [${workdayLastSels}'input[name="last_name"]','input[id*="last"][id*="name" i]','input[placeholder*="Last" i]','input[autocomplete="family-name"]','#last_name','#lastName']);
if (!results.firstName) {
  // "Legal Name" is Ashby's label for the single full-name field; the old
  // /^full name$|^name$/ pattern missed it entirely, so the field was left empty
  // and then re-surfaced in the audit as an unfilled required field.
  results.fullName = await fillByLabel(/^full name$|^name$|legal name|^your name$|full legal name/i, '${fullName}', ['input[name="name"]','input[id="name"]','input[placeholder*="Full name" i]','input[placeholder*="Legal name" i]','input[autocomplete="name"]','input[name*="legal" i][name*="name" i]']);
}
// Ashby and several others ask for a preferred/display name alongside the legal
// one; leaving it blank is a required-field failure on those forms.
if (!results.preferredName) {
  results.preferredName = await fillByLabel(/preferred name|nickname|what should we call you/i, '${firstName || fullName}', ['input[name*="preferred" i]','input[id*="preferred" i]']);
}
results.email = await fillByLabel(/e-?mail/i, '${email}', [${workdayEmailSels}'input[type="email"]','input[name="email"]','input[id*="email" i]','input[placeholder*="email" i]','input[autocomplete="email"]']);

// LinkedIn URL — label-first (name= attr varies per posting)
${linkedinUrl ? `
try {
  results.linkedin = await fillByLabel(/linkedin/i, '${linkedinUrl}', ['input[name*="linkedin" i]','input[id*="linkedin" i]','input[placeholder*="linkedin" i]']);
} catch {}
` : ""}

// Portfolio/GitHub URL — label-first
${githubUrl ? `
try {
  results.portfolio = await fillByLabel(/portfolio|website|github|personal site/i, '${githubUrl}', ['input[name*="github" i]','input[id*="github" i]','input[name*="website" i]','input[id*="website" i]']);
} catch {}
` : ""}

// ─── Country code + phone ───
// Auto-waiting: the isVisible({timeout}) checks below already wait for the dropdown/options to
// render, so no fixed waitForTimeout sleeps are needed (Playwright actionability handles it).
try {
  const flagBtn = page.locator('.iti__flag-container,.iti__selected-flag,[class*="flag-container"],[class*="country-selector"]').first();
  if (await flagBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await flagBtn.click();
    const searchInput = page.locator('.iti__search-input,input[placeholder*="Search" i]').first();
    if (await searchInput.isVisible({ timeout: 1500 }).catch(() => false)) {
      await searchInput.fill('India');
    }
    const indiaOption = page.locator('.iti__country-list li[data-dial-code="91"],[data-country-code="in"],li:has-text("India (+91)")').first();
    if (await indiaOption.isVisible({ timeout: 1500 }).catch(() => false)) { await indiaOption.click(); }
  }
} catch {}
results.phone = await tryFill([${workdayPhoneSels}'input[type="tel"]','input[name="phone"]','input[id*="phone" i]','input[placeholder*="phone" i]','input[autocomplete="tel"]'], '${phone}');

// iCIMS phone type dropdown — select "Mobile" before filling number
${portalType === "iCIMS" ? `
try {
  const phoneTypeField = await findFieldByLabel(/phone type|type of phone/i);
  if (phoneTypeField) await trySelectOption(phoneTypeField, [/mobile/i, /cell/i]);
  else {
    const ptSel = page.locator('select[name*="phone_type" i],select[id*="phone_type" i],select[name*="phoneType" i]').first();
    if (await ptSel.count() > 0) { await ptSel.selectOption({ label: /mobile/i }); results.phoneType = true; }
  }
} catch {}
` : ""}

// ─── Location autocomplete ───
//
// Greenhouse renders this as a react-select combobox backed by a geocode
// service, and it has three traps that the obvious implementation walks into.
//
//   1. IT IS A PREFIX SEARCH. Typing the profile's location verbatim —
//      "Bangalore, India" — sends the whole string, suffix included, and the
//      menu comes back empty. Only the city token goes in the box; the rest of
//      the string is what we match the RESULTS against.
//
//   2. ITS OPTIONS ARE NOT WHERE YOU GUESS. They are not \`.pac-item\`, not
//      \`li\`, and not reliably \`[role="option"]\` — react-select names them
//      after the input (\`react-select-candidate-location-option-0\`) and, while
//      the menu is open, publishes the listbox id on the input's own
//      \`aria-controls\`. Reading that attribute is exact; guessing class names
//      is how this ended up clicking nothing at all.
//
//   3. TYPED IS NOT SELECTED. The visible box shows the text either way, but
//      until an option is committed the hidden geocode companions stay empty
//      and the form rejects the submission with the field looking filled. So
//      the outcome is verified from the committed value, never from the typing.
//
// The first match is also not necessarily the right one — "Bangalore" returns
// several administrative regions — so options are scored against the full
// location string rather than blindly taking \`.first()\`.
try {
  const want = '${location}'.trim();
  const locInput = page.locator('input[name="location"],input[id*="location" i],input[placeholder*="location" i],input[placeholder*="city" i],#candidate-location').first();
  if (want && await locInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const term = (want.split(',')[0] || want).trim();
    const wantTokens = norm(want).split(' ').filter(Boolean);

    await locInput.click({ timeout: 2000 }).catch(() => {});
    await locInput.fill('');
    await locInput.pressSequentially(term, { delay: 60 });

    // Wait for the menu by asking the input which listbox it opened.
    let listboxId = '';
    for (let i = 0; i < 24; i++) {
      listboxId = (await locInput.getAttribute('aria-controls').catch(() => '')) || '';
      if (listboxId) break;
      await page.waitForTimeout(250);
    }
    const optionSel = listboxId
      ? '#' + listboxId + ' [role="option"], #' + listboxId + ' [class*="option"], [id^="' + listboxId.replace(/-listbox$/, '') + '-option"]'
      : '[role="option"],[class*="select__option"],[class*="pac-item"],[class*="suggestion"]';

    const opts = page.locator(optionSel);
    await opts.first().waitFor({ state: 'visible', timeout: 6000 }).catch(() => null);
    const texts = (await opts.allTextContents().catch(() => [])).map((t) => t.trim()).filter(Boolean);

    let picked = -1, best = 0;
    for (let i = 0; i < texts.length; i++) {
      const t = norm(texts[i]);
      let score = 0;
      for (const tok of wantTokens) if (t.includes(tok)) score += 2;
      if (t.startsWith(norm(term))) score += 3;
      if (score > best) { best = score; picked = i; }
    }

    if (picked >= 0) {
      await opts.nth(picked).click({ timeout: 3000 }).catch(() => {});
    } else {
      // react-select is always keyboard-drivable, whatever it calls its DOM.
      await locInput.press('ArrowDown').catch(() => {});
      await locInput.press('Enter').catch(() => {});
    }

    await page.waitForTimeout(400);
    const committed = (await page.locator('[class*="single-value"],[class*="singleValue"],.select__single-value').first().textContent().catch(() => '')) || '';
    results.location = norm(committed).length > 0;
    console.log('[location] term="' + term + '" options=' + texts.length +
      ' picked=' + (picked >= 0 ? '"' + texts[picked] + '"' : '(keyboard fallback)') +
      ' committed="' + committed.trim() + '"');
  }
} catch (e) { console.log('[location] failed: ' + (e && e.message)); }

// ─── B: Semi-deterministic fields via label-text matching ───

// Work authorization — label-driven, tiered option match
${workAuth ? `
try {
  const waField = await findFieldByLabel(/legally authorized to work|authorized to work/i);
  if (waField) {
    const matched = await trySelectOption(waField, ['Yes', 'Authorized to work', 'Eligible to work', 'I am authorized']);
    results.workAuth = matched;
  }
} catch {}
` : ""}

// Sponsorship — label-driven
try {
  const spField = await findFieldByLabel(/require.*sponsorship|need.*visa.*sponsor/i);
  if (spField) {
    const matched = await trySelectOption(spField, ['No', 'No, I do not require', 'Will not require']);
    results.sponsorship = matched;
  }
} catch {}

// Source / How did you hear — progressive fallback list
//
// The pattern is anchored on the QUESTION, not on its keywords. The previous
// bare /referral/ matched Greenhouse's conditional follow-up — 'If selected
// "Referral", who referred you?' — and typed a source name into it, inventing a
// referrer for a trigger nobody selected. A lone /source/ was worse: it claims
// "Have you contributed to open source?". Follow-ups are excluded outright,
// because a label that opens with "If ..." is never the question itself.
try {
  const srcField = await findFieldByLabel(/\b(how|where)\s+did\s+you\s+(\w+\s+)?(hear|learn|find)\b|\breferral\s+source\b|\bsource\s+of\s+(this\s+)?(job|application)\b/i, /^\s*if\b/i);
  if (srcField) {
    const matched = await trySelectOption(srcField, ['LinkedIn', 'Linkedin', 'linkedin', 'Job Board', 'Job board', 'Internet', 'Online', 'Other']);
    results.source = matched;
  }
} catch {}

// Disability status — from stored profile answer, never inferred
${disabilityStatus ? `
try {
  const dsField = await findFieldByLabel(/disability|disabled/i);
  if (dsField) {
    const matched = await trySelectOption(dsField, ['${disabilityStatus.replace(/'/g, "\\'")}'.trim(), 'Prefer not to say', 'Decline to answer', 'I do not wish to answer']);
    results.disabilityStatus = matched;
  }
} catch {}
` : ""}

// Veteran status — from stored profile answer, never inferred
${veteranStatus ? `
try {
  const vsField = await findFieldByLabel(/veteran|military service/i);
  if (vsField) {
    const matched = await trySelectOption(vsField, ['${veteranStatus.replace(/'/g, "\\'")}'.trim(), 'I am not a protected veteran', 'Not a veteran', 'Prefer not to say', 'Decline to answer']);
    results.veteranStatus = matched;
  }
} catch {}
` : ""}

// ─── Consent / agreement checkboxes ───
//
// "Required checkbox" does NOT mean "consent checkbox", and treating the two as
// synonyms ticked every box on the form.
//
// A multi-select question — "How did you learn about us? Select ALL that apply."
// — is rendered by Greenhouse as one checkbox per option, and EVERY option
// carries a required attribute so the browser enforces "pick at least one". On the KnowBe4
// posting that is 27 required checkboxes across two questions and not one
// standalone consent box among them. The old selector matched all 27 and
// setChecked(true) on each, which silently claimed the candidate had heard about
// the role from all sixteen sources at once and researched it with all eleven.
//
// What separates the two is arity, not wording: group members SHARE a name (and
// Greenhouse suffixes it with the [] array marker), while a consent box is
// alone under its own. So a box is only ticked when nothing else on the page
// shares its name — which is the definition of "there is nothing here to choose
// between". Anything in a group is left to the fill plan, which knows which
// single option was actually asked for.
try {
  const requiredCbs = page.locator('input[type="checkbox"][required],input[type="checkbox"][aria-required="true"],[role="checkbox"][aria-required="true"]');
  const cbCount = await requiredCbs.count();

  const names = [];
  for (let i = 0; i < cbCount; i++) {
    names.push((await requiredCbs.nth(i).getAttribute('name').catch(() => '')) || '');
  }
  const seen = {};
  for (const n of names) seen[n] = (seen[n] || 0) + 1;

  let eligible = 0, checkedCount = 0, skipped = 0;
  for (let i = 0; i < cbCount; i++) {
    const n = names[i];
    // [] is Greenhouse's own array marker; a shared name is the general case.
    if (n.endsWith('[]') || seen[n] > 1) { skipped++; continue; }
    eligible++;
    try {
      const cb = requiredCbs.nth(i);
      await cb.setChecked(true);
      // Verify it registered (isChecked reads aria-checked for role=checkbox too).
      if (await cb.isChecked().catch(() => false)) checkedCount++;
    } catch {}
  }
  // Only mark consent handled when every standalone box is confirmed checked.
  results.consent = eligible > 0 && checkedCount === eligible;
  console.log('[consent] required=' + cbCount + ' standalone=' + eligible +
    ' checked=' + checkedCount + ' left-to-the-fill-plan=' + skipped);
} catch (e) { console.log('[consent] failed: ' + (e && e.message)); }

// ─── Resume upload ───
${resumeBlock}

// ─── Workday: data-automation-id based work experience pre-fill ───
// Fills title/company/location/description deterministically using Workday's stable
// automation IDs — avoids the LLM transposing company into title or losing its place.
${portalType === "Workday" && userData.experience ? `
try {
  const expHeading = await page.evaluate(() => /work experience|work history|employment history/i.test(document.body.innerText));
  if (expHeading) {
    const titleInput = page.locator('[data-automation-id="jobTitle"],[data-automation-id="position"]').first();
    const companyInput = page.locator('[data-automation-id="companyName"],[data-automation-id="employer"]').first();
    const locationInput = page.locator('[data-automation-id="location"],[data-automation-id="jobLocation"]').first();
    const descInput = page.locator('[data-automation-id="jobDescription"],[data-automation-id="description"] textarea,textarea[data-automation-id*="description"]').first();
    const currentCb = page.locator('[data-automation-id="currentlyWorkHere"]').first();
    if (await titleInput.count() > 0 && !(await titleInput.inputValue().catch(() => ''))) {
      await fillLocator(titleInput, '${(Array.isArray(userData.experience) ? (userData.experience[0]?.title || '') : '').replace(/'/g, "\\'")}'.trim() || 'Software Engineer');
    }
    if (await companyInput.count() > 0 && !(await companyInput.inputValue().catch(() => ''))) {
      await fillLocator(companyInput, '${(Array.isArray(userData.experience) ? (userData.experience[0]?.company || '') : '').replace(/'/g, "\\'")}'.trim() || 'Previous Company');
    }
    if (await locationInput.count() > 0 && !(await locationInput.inputValue().catch(() => ''))) {
      await fillLocator(locationInput, '${(userData.location || '').replace(/'/g, "\\'")}'.trim());
    }
    if (await descInput.count() > 0 && !(await descInput.inputValue().catch(() => ''))) {
      const desc = '${(Array.isArray(userData.experience) ? (userData.experience[0]?.description || '') : (typeof userData.experience === 'string' ? userData.experience.slice(0, 300) : '')).replace(/'/g, "\\'").replace(/\n/g, ' ')}'.trim();
      if (desc) await fillLocator(descInput, desc);
    }
    // "I currently work here" checkbox
    if (await currentCb.count() > 0) {
      const isCurrentRole = ${Array.isArray(userData.experience) && userData.experience[0]?.current === true};
      if (isCurrentRole && !(await currentCb.isChecked().catch(() => false))) {
        await currentCb.check();
      }
    }
    results.workdayExperience = true;
  }
} catch {}
` : ''}

return results;
`
}

const FORM_FILLING_SYSTEM_PROMPT = `You are a precise job application form filler. Your ONLY job is to FILL fields. You do NOT click Submit.

CRITICAL — DO NOT CLICK SUBMIT. EVER. Your task ends when every visible field has a value.
The system will handle submission separately after verifying all fields are complete.
If you click Submit before being explicitly told to, you have failed the task.

WHAT COUNTS AS REQUIRED:
Treat a field as REQUIRED if ANY of the following is true:
- It has an asterisk (*) next to its label
- It has aria-required="true"
- Its wrapper has a CSS class containing "required"
- It is a radio group, toggle, or dropdown with no visible "(optional)" marker
When uncertain, treat it as required. Do NOT skip it.

DO NOT SKIP: radio button groups, Yes/No toggles, multi-select checkboxes, custom dropdowns.
Every visible question block must have a value before you stop.

FIELD INTERACTION RULES:
- Text inputs: click, then type character by character. Do not paste.
- Dropdowns (native or custom listbox): click to open, read options, click closest match. NEVER type into a plain dropdown.
- Searchable dropdowns: click to open, type 2-3 chars, click the matching suggestion.
- Radio groups: click the correct option button. Do NOT use .check() on ARIA-role fakes.
- Yes/No toggles (aria-pressed buttons): click the correct button, verify aria-pressed="true".
- Checkboxes: click to check. Always check required agreement checkboxes.
- Autocomplete (location, city): type chars, wait for suggestions, click the match.
- Phone country code: click flag/dropdown, search India, select +91, then type digits only.
- Dismiss popups/banners immediately.
- If you see a CAPTCHA, wait silently.
- If you see an OTP prompt, output "OTP_VERIFICATION_REQUIRED" and stop.

WHEN YOU ARE DONE:
Scroll from top to bottom. Confirm every visible required field has a value.
Output: FIELDS_COMPLETE when done. Do NOT click Submit.`

function buildAgentInstruction(portalType: string, userData: any, preFillResults: any): string {
  const fullName = userData.name || `${userData.firstName || ""} ${userData.lastName || ""}`.trim()

  // Track all pre-fill results — both filled and failed — so agent knows exactly what to retry
  // and doesn't waste steps on fields already handled deterministically.
  const filledFields: string[] = []
  const failedFields: string[] = []

  const track = (key: string, label: string, failLabel?: string) => {
    if (preFillResults?.[key]) filledFields.push(label)
    else if (failLabel !== undefined) failedFields.push(failLabel || label)
  }

  track('firstName', 'first name')
  track('lastName', 'last name')
  track('fullName', 'full name')
  track('email', 'email')
  track('phone', 'phone + country code (+91 India)', 'phone (click flag, search India +91, select, then type number digits only)')
  track('resume', 'resume', 'resume (upload /tmp/resume.pdf using the file input)')
  track('linkedin', 'LinkedIn URL')
  track('portfolio', 'portfolio/GitHub URL')
  track('location', 'location', 'location (type city, wait for autocomplete suggestion, click it)')
  track('workAuth', 'work authorization')
  track('sponsorship', 'sponsorship')
  track('source', 'source/referral')
  track('phoneType', 'phone type')
  track('consent', 'consent checkboxes')
  track('disabilityStatus', 'disability status')
  track('veteranStatus', 'veteran status')

  const alreadyFilled = filledFields.length > 0
    ? `ALREADY FILLED BY PLAYWRIGHT — do NOT touch: ${filledFields.join(", ")}.`
    : ""
  const needsRetry = failedFields.length > 0
    ? `PLAYWRIGHT FAILED ON THESE — you MUST fill them: ${failedFields.join("; ")}.`
    : ""

  // Field-to-value mapping for everything the agent might encounter
  const fieldMapping = `
FIELD-TO-VALUE MAPPING — match form labels to these values:
- "First Name" / "Given Name" → ${userData.firstName || ""}
- "Last Name" / "Surname" → ${userData.lastName || ""}
- "Full Name" / "Name" → ${fullName}
- "Email" → ${userData.email || ""}
- "Phone" / "Mobile" → ${(userData.phone || "").replace(/\D/g, "").replace(/^91/, "")} (country code: +91 India)
- "Location" / "City" → ${userData.location || ""}
- "LinkedIn URL" → ${userData.linkedinUrl || ""}
- "Portfolio" / "Website" / "GitHub" → ${userData.githubUrl || ""}
- "Work Authorization" / "Legally authorized" → Yes / Authorized
- "Require sponsorship" → No
- "How did you hear" / "Source" → LinkedIn
- "Start Date" / "Availability" → Immediately
- "Disability Status" → ${userData.disabilityStatus || "I do not wish to answer"}
- "Veteran Status" → ${userData.veteranStatus || "I am not a protected veteran"}
- Any agreement / consent checkbox → Check it`

  const applicantData = `
APPLICANT DATA (for custom questions the agent must answer):
- Name: ${fullName}
- Email: ${userData.email || ""}
- Phone: ${userData.phone || ""}
- Location: ${userData.location || ""}
- Work Authorization: ${userData.workAuthorization || "Authorized to work"}
- Current Company: ${userData.currentCompany || "Freelance"}${userData.coverLetter ? `\n- Cover Letter: ${userData.coverLetter}` : ""}${userData.experience ? `\n- Experience: ${userData.experience}` : ""}${userData.skills?.length > 0 ? `\n- Skills: ${Array.isArray(userData.skills) ? userData.skills.join(", ") : userData.skills}` : ""}`

  // LLM-required fields: custom questions, free-text, multi-select skills, salary open text
  // The agent should ONLY focus on these — everything else was handled by Playwright.
  const agentFocusNote = `
YOUR JOB: The Playwright pre-fill already handled all standard fields. You ONLY need to:
1. Fill any fields listed in PLAYWRIGHT FAILED ON THESE above
2. Answer custom screening questions (job-specific questions not in the standard field list)
3. Handle any field types Playwright couldn't detect (custom radio groups, multi-select, yes/no toggles)
4. Do NOT re-fill anything in ALREADY FILLED BY PLAYWRIGHT

CUSTOM QUESTION DETECTION: A custom question is any visible question block that is NOT one of: name, email, phone, resume, LinkedIn, location, work auth, sponsorship, source, disability, veteran, consent. If you see a question you don't recognize, answer it using the APPLICANT DATA above.

FOR RADIO GROUPS / YES-NO TOGGLES: Click the correct option button. For Ashby-style aria-pressed buttons, verify aria-pressed="true" after clicking.
FOR MULTI-SELECT: Click each applicable option individually.
FOR DROPDOWNS: Click to open, read all options, select closest match by meaning.
`

  const commonRules = `
RULES:
- ${alreadyFilled}
- ${needsRetry}
- Treat a field as REQUIRED if it has * next to label, aria-required="true", or no "(optional)" marker.
- Do NOT skip radio groups, Yes/No toggles, or custom dropdowns — these are the most commonly missed.
- SKIP the EEO section (gender, race, ethnicity) UNLESS it explicitly blocks submission.
- PRE-SUBMIT VERIFICATION (mandatory): scroll entire form top to bottom, confirm every required field has a value. Fill any missed fields before clicking Submit.
- Do NOT click "Apply with LinkedIn".
- If you cannot determine how to answer a field, output FIELD_NEEDS_HUMAN_INPUT: <field label> and continue.
${fieldMapping}`

  switch (portalType) {
    case "Greenhouse":
      return `Greenhouse application. ${alreadyFilled}
${needsRetry}
${agentFocusNote}
STEPS:
1. Scroll to the form. Do NOT read the job description.
2. Fill any PLAYWRIGHT FAILED fields above.
3. Find all custom questions (inside .application-question blocks with *). Answer each one.
4. SKIP the entire EEO section at the bottom.
5. PRE-SUBMIT VERIFICATION: scroll top-to-bottom, confirm all required fields filled, resume attached.
6. Click "Submit Application".
QUIRKS: Single-page. Location uses Google Places autocomplete. react-select dropdowns need click-to-open then click-option.
${commonRules}${applicantData}`

    case "Lever":
      return `Lever application. ${alreadyFilled}
${needsRetry}
${agentFocusNote}
STEPS:
1. If not on /apply page, click "Apply for this job".
2. Fill any PLAYWRIGHT FAILED fields above.
QUIRK: Lever uses ONE full name field, not separate first/last. Use: "${fullName}".
3. Answer required custom questions. SKIP EEO section.
4. PRE-SUBMIT VERIFICATION: scroll form, confirm all required fields filled, resume attached.
5. Click "Submit Application".
${commonRules}${applicantData}`

    case "Ashby":
      return `Ashby application. ${alreadyFilled}
${needsRetry}
${agentFocusNote}
STEPS:
1. Scroll to the bottom to find the form.
2. Fill any PLAYWRIGHT FAILED fields above.
3. Answer required custom questions.
QUIRKS:
- Yes/No fields are BUTTONS with aria-pressed, not checkboxes. Click the correct button and verify aria-pressed="true".
- Location requires autocomplete — type, wait for dropdown, click suggestion.
4. Check required arbitration/consent checkboxes.
5. PRE-SUBMIT VERIFICATION: scroll form, confirm all required fields filled, resume attached.
6. Click "Submit". Skip any EEO survey that appears after.
${commonRules}${applicantData}`

    case "Workday":
      return `Workday multi-page application. ${alreadyFilled}
${needsRetry}
${agentFocusNote}
STEPS:
1. Click "Apply" or "Apply Manually". Do NOT click "Apply with LinkedIn".
2. Fill any PLAYWRIGHT FAILED fields above.
3. Each page: fill required fields (*), then click "Next"/"Continue".
4. If "My Experience" offers resume auto-fill, USE IT.
5. "Source"/"How did you hear" if required: select "LinkedIn" if available, otherwise "Job Board" or "Internet".
6. PRE-SUBMIT VERIFICATION on Review page: confirm all required fields across all pages.
7. Click "Submit".
QUIRKS: Multi-page. Dropdowns are div[role="listbox"] — click trigger, wait for listbox, click option. Page detection via pageHeader text.
${commonRules}${applicantData}`

    case "iCIMS":
      return `iCIMS application. ${alreadyFilled}
${needsRetry}
${agentFocusNote}
STEPS:
1. Click "Apply"/"Apply Now". Choose "Apply as Guest" if available.
2. Fill any PLAYWRIGHT FAILED fields above.
QUIRKS:
- Phone TYPE dropdown (Mobile/Home/Work) must be selected before filling number.
- Location, state, country are searchable dropdowns — click to open, type to filter, select.
3. SKIP optional experience/education pages.
4. PRE-SUBMIT VERIFICATION: scroll form, confirm all required fields filled, resume attached.
5. Click "Submit Application".
${commonRules}${applicantData}`

    case "SmartRecruiters":
      return `SmartRecruiters application. ${alreadyFilled}
${needsRetry}
${agentFocusNote}
STEPS:
1. Click "Apply"/"Apply Now".
2. Fill any PLAYWRIGHT FAILED fields above.
3. Location: type "${userData.location}", wait for autocomplete suggestion, click it.
4. Answer required screening questions. Check required consent checkboxes.
5. PRE-SUBMIT VERIFICATION: scroll form, confirm all required fields filled, resume attached.
6. Click "Submit"/"Apply".
${commonRules}${applicantData}`

    default:
      return `Job application form. ${alreadyFilled}
${needsRetry}
${agentFocusNote}
STEPS:
1. Find the form or click "Apply".
2. Fill any PLAYWRIGHT FAILED fields above.
3. Fill remaining required fields using the FIELD-TO-VALUE MAPPING.
4. Multi-page: fill required fields per page, click "Next", then "Submit".
5. PRE-SUBMIT VERIFICATION: scroll entire form, confirm all required fields filled, resume attached.
6. Click Submit.
${commonRules}${applicantData}`
  }
}

// ─── Extract custom questions from form (non-standard questions only) ───
// Claude: extract BEFORE any agent pass so we know exactly what needs LLM answers.
async function extractCustomQuestions(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string
): Promise<{ label: string; type: string; id: string }[]> {
  const res = await kernelClient.browsers.playwright.execute(sessionId, {
    code: `
const questions = await page.evaluate(() => {
  const standardLabels = /first.?name|last.?name|^name$|^email$|^phone$|resume|cv|linkedin|location|city|where.*locat|where do you live|where are you|based in|source|how did you hear|where did you hear|where did you find|how did you find|find out about|learn about|about us|referr|work auth|sponsor|country|nationality|citizen|relocat|remote|background check|18 years|non.?compete|nda|driver.*licen|employment type|work type|years.*experience|notice period|salary|ctc|compensation|currency|currently employed|education|degree|field.*study|major|fresher|language|travel|passport|pip|terminated|criminal|drug test|contractor|disability|veteran|gender|race|ethnicity|agree|consent|terms/i;
  const blocks = document.querySelectorAll('.field, [class*="question"], [class*="form-group"], fieldset');
  const out = [];
  blocks.forEach((block, i) => {
    const label = block.querySelector('label, legend, [class*="label"]')?.textContent?.trim() ?? '';
    if (!label || standardLabels.test(label)) return;
    const hasRequired = /[*\\u2731\\uff0a\\u2217\\u066d]/.test(label) || block.querySelector('[aria-required="true"],[required]') || block.querySelector('[class*="required"]');
    if (!hasRequired) return; // only required custom questions
    let type = 'text';
    if (block.querySelector('textarea')) type = 'textarea';
    else if (block.querySelector('select,[role="listbox"],[role="combobox"]')) type = 'dropdown';
    else if (block.querySelector('[role="radiogroup"],input[type="radio"],[aria-pressed]')) type = 'radio';
    else if (block.querySelector('input[type="checkbox"]')) type = 'checkbox';
    out.push({ label: label.replace(/\\s+/g, ' ').slice(0, 200), type, id: 'q_' + i });
  });
  return out;
});
return questions;
`,
    timeout_sec: 15,
  })
  return (res.result as any) || []
}

// ─── Detect required EEO fields (structurally, not by guessing) ───
// Claude: detect which EEO fields actually have * or aria-required before agent runs.
// This replaces the blanket "SKIP EEO" instruction with a pre-computed required list.
async function detectRequiredEeoFields(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string
): Promise<{ label: string; type: string }[]> {
  const res = await kernelClient.browsers.playwright.execute(sessionId, {
    code: `
const required = await page.evaluate(() => {
  const eeoContainer = Array.from(document.querySelectorAll('div,section,fieldset'))
    .find(el => /equal employment|eeo|voluntary|self-identif|demographic/i.test(el.textContent?.slice(0, 300) || '') && el.children.length > 1);
  if (!eeoContainer) return [];
  const fields = eeoContainer.querySelectorAll('select,[role="radiogroup"],fieldset,input[type="radio"]');
  const out = [];
  fields.forEach(f => {
    const wrapper = f.closest('[class*="field"],[class*="question"]') || f.parentElement;
    const labelText = wrapper?.querySelector('label,legend,[class*="label"]')?.textContent?.trim() ?? '';
    const isRequired = /[*\\u2731\\uff0a\\u2217\\u066d]/.test(labelText) || f.getAttribute('aria-required') === 'true' || !!wrapper?.querySelector('[class*="required"]');
    if (isRequired && labelText) {
      let type = 'dropdown';
      if (f.tagName === 'FIELDSET' || f.getAttribute('role') === 'radiogroup') type = 'radio';
      out.push({ label: labelText.replace(/\\s+/g, ' ').slice(0, 200), type });
    }
  });
  return out;
});
return required;
`,
    timeout_sec: 15,
  })
  return (res.result as any) || []
}

// ─── Fill plan: resolve every answer before touching the browser ───
// Each inventory item gets a resolution method and a pre-decided value.
// The fill loop becomes pure execution — no reasoning mid-fill.
export type ResolutionMethod =
  | "profile"         // identity taken straight from the candidate profile
  | "deterministic"   // a fixed factual answer, shape-checked against the widget
  | "choice"          // pick one of the widget's real options
  | "consent"         // a consent / certification checkbox
  | "bank"            // recalled from the candidate's answer bank
  | "llm"             // generated by the LLM (custom question)
  | "sensitive"       // must not be auto-answered — needs a human
  | "skip"            // optional and no answer available
  | "unanswerable"    // we needed an answer and could not produce one
  | "correct"         // the page already has a value, and it disagrees with ours
  | "keep"            // the page already has a value, and it matches ours

export interface FieldPlan {
  key: string
  label: string
  kind: string
  required: boolean
  options: string[]
  method: ResolutionMethod
  value: string        // empty string when method is "sensitive" or "skip"
  /** For bank hits: which stored question matched and at what confidence. */
  bankMatch?: { question: string; confidence: number }
  /** For "correct"/"keep": what the page already contained. */
  existingValue?: string
  /**
   * True when the answer came from the bank but was not human-confirmed, or
   * was confirmed under a different scope. Still filled, but surfaced for
   * review rather than trusted silently.
   */
  needsReview?: boolean
  /** Why this route was chosen — carried into the logs for diagnosis. */
  why?: string
  /**
   * Set when the field NEEDS a value and we have none. Distinct from "skip",
   * which means the field was optional and we chose not to fill it. Conflating
   * the two is what let unanswered required questions look complete.
   */
  blocker?: { kind: "unanswerable" | "human-required"; detail: string }
}


/**
 * Build the complete fill plan for a form inventory.
 *
 * Runs entirely before the browser is touched:
 *   1. Deterministic patterns (profile fields) — free, instant, no LLM
 *   2. Answer bank recall — stored answers from previous runs
 *   3. LLM batch generation — one call for all remaining custom questions
 *   4. Sensitive questions — flagged, never auto-answered
 *
 * Returns a FieldPlan per inventory item. The fill loop just executes the plan.
 */
async function buildFillPlan(
  inventory: InventoryItem[],
  userData: any,
  bank: import("./application-answers").ApplicationAnswer[],
  geminiKey: string,
  openAiKey: string,
  openRouterKey: string,
  applicationId?: string,
  /** Employer/ATS, so employer-scoped bank answers resolve correctly. */
  scopeContext?: { employer?: string | null; ats?: string | null },
  /** Answers already fixed earlier in this run. Never recomputed. */
  ledger?: AnswerLedger
): Promise<FieldPlan[]> {
  const plan: FieldPlan[] = []

  /**
   * Reconcile a resolved answer against what the form already contains.
   *
   * ATS résumé parsers pre-populate aggressively and are frequently wrong —
   * "Current Job Title" in particular is whatever the parser guessed. Treating
   * a populated field as satisfied is how a wrong value reaches an employer
   * without ever appearing in a log.
   *
   *   nothing on the page  → fill it
   *   page agrees with us  → `keep`: leave it alone, save the action
   *   page disagrees       → `correct`: overwrite, and say so in the log
   */
  const reconcileExisting = (
    item: InventoryItem,
    method: ResolutionMethod,
    value: string,
    extra: Partial<FieldPlan> = {}
  ): FieldPlan => {
    const existing = (item.value || "").trim()
    if (!existing) return { ...item, method, value, ...extra }
    if (valuesAgree(existing, value)) {
      return { ...item, method: "keep", value, existingValue: existing, ...extra }
    }
    return { ...item, method: "correct", value, existingValue: existing, ...extra }
  }

  // ── Pass 1: route every field by SHAPE first, then text ──
  //
  // `routeField` is the whole point of this pass. The old code ran 36 loose
  // regexes against every label in order, so `/relocat/` answered "Describe a
  // time you helped relocate a team" with "Yes" and `/major/` answered "What
  // was your major accomplishment?" with "Computer Science". A pattern now only
  // fires on a control that can actually accept that kind of answer.
  const needsLlm: Array<{ item: InventoryItem; idx: number }> = []

  for (let i = 0; i < inventory.length; i++) {
    const item = inventory[i]

    // An answer already fixed on an earlier wizard step is reused verbatim.
    // This is what stops the same question getting two different model-written
    // answers on two pages of the same application.
    const carried = ledger?.get(item.key, item.label)
    if (carried && carried.trim()) {
      plan.push(reconcileExisting(item, ledger?.entry(item.key)?.method === "llm" ? "llm" : "deterministic", carried, {
        why: "already answered earlier in this run",
      }))
      continue
    }

    const route = routeField(
      { label: item.label, kind: item.kind, required: item.required, options: item.options, schemaGroup: (item as any).schemaGroup, key: item.key },
      userData
    )

    switch (route.route) {
      case "file":
        plan.push({ ...item, method: "skip", value: "", why: route.why })
        continue

      case "sensitive":
        plan.push({
          ...item, method: "sensitive", value: "", why: route.why,
          blocker: { kind: "human-required", detail: route.why },
        })
        continue

      case "profile":
      case "deterministic":
      case "consent":
      case "choice": {
        // The bank may hold a human-confirmed answer that beats our default.
        const recalled = recallAnswer(bank, item.label, scopeContext)
        const value = recalled?.answer || route.value
        if (!value) {
          // A choice control with no preferred value still gets driven — the
          // handler will offer its real options to the model.
          plan.push({ ...item, method: "choice", value: "", why: route.why })
          continue
        }
        const method: ResolutionMethod = recalled
          ? "bank"
          : route.route === "profile"
            ? "profile"
            : route.route === "consent"
              ? "consent"
              : route.route === "choice"
                ? "choice"
                : "deterministic"
        plan.push(
          reconcileExisting(item, method, value, {
            why: recalled ? `answer bank: "${recalled.matchedQuestion.slice(0, 40)}"` : route.why,
            ...(recalled ? { bankMatch: { question: recalled.matchedQuestion, confidence: recalled.confidence }, needsReview: !recalled.reusableWithoutAsking } : {}),
          })
        )
        continue
      }

      case "skip":
        // A REQUIRED field we have no profile value for is a blocker, not a
        // skip. The submit gate has to know the difference.
        plan.push({
          ...item, method: item.required ? "unanswerable" : "skip", value: "", why: route.why,
          ...(item.required ? { blocker: { kind: "unanswerable" as const, detail: route.why } } : {}),
        })
        continue

      case "llm": {
        const recalled = recallAnswer(bank, item.label, scopeContext)
        if (recalled) {
          plan.push(
            reconcileExisting(item, "bank", recalled.answer, {
              why: `answer bank: "${recalled.matchedQuestion.slice(0, 40)}"`,
              bankMatch: { question: recalled.matchedQuestion, confidence: recalled.confidence },
              needsReview: !recalled.reusableWithoutAsking,
            })
          )
          continue
        }
        needsLlm.push({ item, idx: i })
        plan.push({ ...item, method: "llm", value: "", why: route.why })
        continue
      }
    }
  }

  // ── Pass 2: one batched model call for everything left ──
  if (needsLlm.length > 0) {
    const generated = await generateCustomAnswers(
      needsLlm.map(({ item }) => ({ label: item.label, type: item.kind === "textarea" ? "textarea" : "text" })),
      userData,
      userData.jobTitle || "",
      userData.companyName || "",
      geminiKey, openAiKey, openRouterKey,
      applicationId
    )

    for (let n = 0; n < needsLlm.length; n++) {
      const { item, idx } = needsLlm[n]
      const answer = generated.answers[n] || ""
      if (!answer) {
        // ─── An unanswered question is NOT a completed question ───
        //
        // This used to become `method: "skip"` with an empty value, and the fill
        // loop then treated any empty value as "nothing to do here" and ticked
        // the field off as filled. A question nobody answered looked identical
        // to a question answered perfectly, right up until the submit gate
        // failed for reasons nothing in the logs explained.
        const detail = generated.failed
          ? `the model could not be reached (${generated.reason})`
          : "the model returned no answer for this question"
        plan[idx] = {
          ...item,
          method: item.required ? "unanswerable" : "skip",
          value: "",
          why: detail,
          ...(item.required ? { blocker: { kind: "unanswerable" as const, detail } } : {}),
        }
        continue
      }
      // A model-written answer is never "confirmed" — flag it for review even
      // when it fills cleanly.
      plan[idx] = reconcileExisting(item, "llm", answer, { needsReview: true, why: "model-written" })
    }
  }

  // ── Pass 3: reject answers that do not belong in their field ──
  //
  // The last guard against a mismatch. Even with correct routing, a stale `idx:`
  // key or a re-rendered form can point at the wrong node, and this catches the
  // obvious cases: an email in a phone box, an essay in a single-line input, a
  // free-text string offered to a dropdown that does not list it.
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i]
    if (!p.value || p.method === "sensitive" || p.method === "keep") continue
    const check = validateAnswerForField(
      { label: p.label, kind: p.kind, required: p.required, options: p.options },
      p.value
    )
    if (check.ok) continue
    if (applicationId) {
      await persistLog(applicationId, "warn", `Rejected answer for "${p.label.slice(0, 45)}": ${check.reason}`)
    }
    // A choice control keeps its route — the handler will show the model the
    // real options. Anything else becomes an explicit blocker.
    if (CHOICE_KINDS.includes(p.kind)) {
      plan[i] = { ...p, method: "choice", value: "", why: `rejected (${check.reason}) — model will pick from the real options` }
    } else {
      plan[i] = {
        ...p, method: p.required ? "unanswerable" : "skip", value: "", why: `rejected: ${check.reason}`,
        ...(p.required ? { blocker: { kind: "unanswerable" as const, detail: check.reason } } : {}),
      }
    }
  }

  // ── Pass 4: log the complete plan ──
  if (applicationId) {
    const count = (m: ResolutionMethod) => plan.filter(p => p.method === m).length
    await persistLog(applicationId, "info",
      `Fill plan: ${plan.length} fields — ${count("profile")} profile, ${count("deterministic")} deterministic, ` +
      `${count("choice")} choice, ${count("consent")} consent, ${count("bank")} from bank, ${count("llm")} LLM-written, ` +
      `${count("sensitive")} human-required, ${count("unanswerable")} UNANSWERABLE, ${count("skip")} skipped, ` +
      `${count("keep")} already correct, ${count("correct")} to correct`
    )
    const fix = plan.filter(p => p.method === "correct")
    if (fix.length) {
      await persistLog(applicationId, "warn",
        `Pre-filled values being corrected: ${fix.map(p => `${p.label.slice(0, 30)}: page had "${(p.existingValue || "").slice(0, 30)}" → "${p.value.slice(0, 30)}"`).join(" | ")}`
      )
    }
    const blocked = plan.filter(p => p.blocker)
    if (blocked.length) {
      await persistLog(applicationId, "error",
        `${blocked.length} field(s) cannot be completed automatically: ${blocked.map(p => `"${p.label.slice(0, 40)}" (${p.blocker!.kind}: ${p.blocker!.detail})`).join(" | ")}`
      )
    }
    const review = plan.filter(p => p.needsReview && p.value)
    if (review.length) {
      await persistLog(applicationId, "info",
        `${review.length} answer(s) filled but not human-confirmed: ${review.map(p => p.label.slice(0, 35)).join(" | ")}`
      )
    }
    // ─── One line per field ───
    //
    // Previously ten fields were crammed into a single log line to keep the row
    // count down. That made the single most useful record in the whole run —
    // what we decided to put in each box, and why — unreadable in the UI. With
    // batched writes there is no reason to compress it.
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i]
      const val = p.method === "sensitive" ? "[HUMAN REQUIRED]" :
                  p.method === "unanswerable" ? "[UNANSWERABLE]" :
                  p.method === "skip" ? "[SKIP]" :
                  p.method === "keep" ? `already correct: "${(p.existingValue || "").slice(0, 60)}"` :
                  `"${p.value.slice(0, 160)}${p.value.length > 160 ? "…" : ""}"`
      const opts = p.options?.length ? ` | offered: ${p.options.slice(0, 6).map(o => o.slice(0, 24)).join(" / ")}${p.options.length > 6 ? ` (+${p.options.length - 6})` : ""}` : ""
      const level = p.blocker ? "error" : p.method === "sensitive" ? "warn" : "info"
      await persistLog(applicationId, level,
        `Field ${i + 1}/${plan.length} · ${p.required ? "REQUIRED" : "optional"} · ${p.kind} · "${p.label.slice(0, 70)}"\n` +
        `    → ${p.method.toUpperCase()}: ${val}\n` +
        `    why: ${p.why || "—"}${opts}`
      )
    }
  }

  return plan
}


/**
 * Record what the model actually wrote, question by question.
 *
 * The single biggest blind spot in the old logs: a run reported "3 LLM-answered"
 * and nothing else, so the only way to see what had been sent to an employer in
 * the candidate's name was to open the live view before the session closed.
 */
async function logGeneratedAnswers(
  questions: { label: string; type: string }[],
  answers: Record<number, string>,
  model: string,
  applicationId?: string
): Promise<void> {
  if (!applicationId) return
  await persistLog(applicationId, "info", `Model ${model} answered ${Object.keys(answers).length}/${questions.length} free-text question(s):`)
  for (let i = 0; i < questions.length; i++) {
    const a = answers[i]
    await persistLog(
      applicationId,
      a ? "info" : "warn",
      a
        ? `  Q${i + 1}: "${questions[i].label.slice(0, 80)}"\n      A: ${a.slice(0, 600)}${a.length > 600 ? "…" : ""}`
        : `  Q${i + 1}: "${questions[i].label.slice(0, 80)}" — NO ANSWER RETURNED`
    )
  }
}

// ─── Pre-generate LLM answers for custom free-text questions ───
// Claude: separate LLM call BEFORE the browsing agent so agent just types, doesn't compose.
// Agent composing answers on-the-fly burns steps and produces generic filler.
async function generateCustomAnswers(
  questions: { label: string; type: string }[],
  userData: any,
  jobTitle: string,
  companyName: string,
  geminiKey: string,
  openAiKey: string,
  openRouterKey: string,
  applicationId?: string
): Promise<{ answers: Record<number, string>; failed: boolean; reason: string }> {
  const freeTextQuestions = questions
  if (freeTextQuestions.length === 0) return { answers: {}, failed: false, reason: "no questions" }

  const fullName = userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim()
  // ─── Index-keyed, not text-keyed ───
  //
  // The old contract asked the model to echo each question back as the JSON key.
  // Greenhouse labels are multi-line and get truncated at 120 characters by the
  // scanner, so the model's key almost never matched ours and the answer was
  // silently discarded — indistinguishable from the model having nothing to say.
  // A position is impossible to garble.
  const prompt = `You are drafting job application answers for ${fullName}, applying to ${jobTitle} at ${companyName}.

Applicant background:
- Experience: ${userData.experience || 'Software engineer with several years of experience'}
- Skills: ${Array.isArray(userData.skills) ? userData.skills.join(', ') : (userData.skills || 'software development')}
- Location: ${userData.location || ''}
- Work Authorization: ${userData.workAuthorization || 'Authorized to work'}

Answer each question in 2-4 sentences, in first person, specific to their actual background.
Do NOT invent experience not listed above. Be concise and professional.

Return strict JSON only, keyed by the question NUMBER as a string:
{ "1": "answer to question 1", "2": "answer to question 2" }
Every number from 1 to ${freeTextQuestions.length} must be present. Never return the question text as a key.

Questions:
${freeTextQuestions.map((q, i) => `${i + 1}. ${q.label}`).join('\n')}`

  /** Accept both the index contract and a text-keyed reply from an older model. */
  const coerce = (parsed: Record<string, string>): Record<number, string> => {
    const out: Record<number, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== "string" || !v.trim()) continue
      const n = Number(String(k).trim().replace(/[^0-9]/g, ""))
      if (Number.isInteger(n) && n >= 1 && n <= freeTextQuestions.length) {
        out[n - 1] = v.trim()
        continue
      }
      // Fallback: a model that ignored the contract and echoed the question.
      const idx = freeTextQuestions.findIndex(
        (q) => q.label.toLowerCase().slice(0, 40) === String(k).toLowerCase().slice(0, 40)
      )
      if (idx >= 0) out[idx] = v.trim()
    }
    return out
  }

  // One walk down the unified chain: paid models first, then every free
  // OpenRouter model. Previously this had its own three-provider ladder that
  // stopped at the first exhausted quota and returned {} — indistinguishable
  // from "the model had nothing to say", which is what let unanswered questions
  // be ticked off as complete.
  const chain = buildLlmChain({ openRouterKey, geminiKey, openAiKey, freeModels: freeModelIds, geminiModels: GEMINI_TEXT_MODELS })
  if (chain.length === 0) {
    const reason = "no LLM provider is configured"
    if (applicationId) await persistLog(applicationId, "error", `Custom-answer generation FAILED for ${freeTextQuestions.length} question(s): ${reason}`)
    return { answers: {}, failed: true, reason }
  }

  const { text, model, failures } = await callLlm(prompt, chain, {
    json: true,
    maxTokens: 2000,
    applicationId,
    purpose: `${freeTextQuestions.length} free-text answer(s)`,
  })

  if (text) {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const answers = coerce(JSON.parse(jsonMatch[0]))
        if (Object.keys(answers).length > 0) {
          await logGeneratedAnswers(freeTextQuestions, answers, model, applicationId)
          return { answers, failed: false, reason: model }
        }
      } catch (e) {
        failures.push(`${model}: reply was not valid JSON`)
      }
    } else {
      failures.push(`${model}: reply contained no JSON object`)
    }
  }

  const reason = failures.length ? failures.slice(0, 6).join(" | ") : "no usable answer returned"
  if (applicationId) {
    await persistLog(applicationId, "error", `Custom-answer generation FAILED for ${freeTextQuestions.length} question(s): ${reason}`)
  }
  return { answers: {}, failed: true, reason }
}

// ─── visionScanForm: screenshot → vision LLM → structured field list ───
// Captures a full-page screenshot and asks a vision model to enumerate every
// visible question. This catches non-standard widgets (Workday div-radios,
// Ashby aria-pressed toggles, iCIMS custom grids) that DOM traversal misses
// because they have no backing <input> element.
// Returns only fields NOT already in the DOM inventory (by label match), so
// the two scans complement rather than duplicate each other.
async function visionScanForm(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  domInventory: Array<{ key: string; label: string; kind: string; required: boolean; options: string[] }>,
  openRouterKey: string,
  geminiKey: string,
  openAiKey: string,
  applicationId?: string
): Promise<Array<{ key: string; label: string; kind: string; required: boolean; options: string[] }>> {
  try {
    // Capture full-page screenshot via Kernel computer controls
    const screenshotResponse = await (kernelClient.browsers.computer as any).captureScreenshot(sessionId)
    let pngBase64: string | null = null
    try {
      // Response is a binary stream — convert to base64
      const blob = await screenshotResponse.blob()
      const arrayBuffer = await blob.arrayBuffer()
      pngBase64 = Buffer.from(arrayBuffer).toString("base64")
    } catch {
      // Fallback: response may already be a buffer or have a different shape
      try {
        const buf = Buffer.from(await screenshotResponse.arrayBuffer())
        pngBase64 = buf.toString("base64")
      } catch { return [] }
    }
    if (!pngBase64 || pngBase64.length < 1000) return []

    const domLabels = new Set(domInventory.map(i => i.label.toLowerCase().replace(/\s+/g, " ").trim()))

    const prompt = `You are analyzing a job application form screenshot.
List EVERY visible question or input field in the form, in top-to-bottom order.
For each field return a JSON object with:
- label: the question text or field label (exact, as shown)
- kind: one of: text, textarea, checkbox, radio, select, date, file
- required: true if there is an asterisk (*) or "required" marker, false otherwise
- options: array of visible option labels for radio/checkbox/select, empty array otherwise

Return ONLY a JSON array. No explanation. No markdown. Example:
[{"label":"Years of experience","kind":"select","required":true,"options":["0-1","1-3","3-5","5+"]},
 {"label":"Are you authorized to work?","kind":"radio","required":true,"options":["Yes","No"]}]`

    let visionReply = ""

    // Try OpenRouter with vision model first
    if (openRouterKey) {
      try {
        const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openRouterKey}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/png;base64,${pngBase64}` } },
            ]}],
            max_tokens: 2000,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          visionReply = data?.choices?.[0]?.message?.content || ""
        }
      } catch {}
    }

    // Fallback: Gemini direct
    if (!visionReply && geminiKey) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/png", data: pngBase64 } },
          ]}]}),
        })
        if (res.ok) {
          const data = await res.json()
          visionReply = data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
        }
      } catch {}
    }

    // Fallback: OpenAI GPT-4o
    if (!visionReply && openAiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/png;base64,${pngBase64}`, detail: "high" } },
            ]}],
            max_tokens: 2000,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          visionReply = data?.choices?.[0]?.message?.content || ""
        }
      } catch {}
    }

    if (!visionReply) return []

    // Parse the JSON array from the reply
    const jsonMatch = visionReply.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed: Array<{ label: string; kind: string; required: boolean; options: string[] }> = JSON.parse(jsonMatch[0])

    // Only return fields the DOM scan didn't already find
    const newFields = parsed.filter(f => {
      const norm = f.label.toLowerCase().replace(/\s+/g, " ").trim()
      return norm.length > 0 && !domLabels.has(norm)
    })

    if (applicationId) {
      await persistLog(applicationId, "info",
        `Vision scan: ${parsed.length} total fields seen, ${newFields.length} new (not in DOM inventory): ${newFields.map(f => `${f.label.slice(0, 30)} [${f.kind}${f.required ? "*" : ""}]`).join(" | ") || "none"}`
      )
    }

    // Assign synthetic keys for vision-only fields (no DOM element to key on)
    return newFields.map((f, i) => ({
      key: `vision:${i}:${f.label.slice(0, 40).replace(/\s+/g, "_")}`,
      label: f.label,
      kind: f.kind || "text",
      required: !!f.required,
      options: Array.isArray(f.options) ? f.options : [],
    }))
  } catch (err) {
    if (applicationId) {
      await persistLog(applicationId, "warn", `visionScanForm failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
    }
    return []
  }
}

// ─── scanFormInventory: ONE-TIME full scan of ALL visible form controls ───
// Scans every visible form element — required AND optional — and returns a fixed
// checklist. The fill loop works against this fixed list; nothing is re-discovered.
// This fixes two structural bugs in the old auditForm-based loop:
//   1. auditForm only saw [required]/aria-required fields — optional checkboxes,
//      radio groups, and custom questions were invisible to it.
//   2. Re-discovery each round couldn't distinguish "done" from "reappeared",
//      causing infinite loops on correctly-filled custom widgets.
/**
 * One control on the form, as discovered by a scan.
 *
 * `value` / `checked` were added so a pre-populated field can be *checked*
 * rather than assumed correct — see the `correct` resolution method.
 */
export interface InventoryItem {
  key: string
  label: string
  kind: string
  required: boolean
  options: string[]
  /** What the control already holds, if anything. */
  value?: string
  /** Current state for checkbox/radio-like controls. */
  checked?: boolean
}

async function scanFormInventory(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  applicationId?: string
): Promise<InventoryItem[]> {
  const res = await kernelClient.browsers.playwright.execute(sessionId, {
    code: `
const items = await page.evaluate(() => {
${VM_DOM_HELPERS}
  const clean = nqClean;
  const isVisible = nqIsVisible;
  const labelOf = nqLabelOf;
  const keyOf = nqKeyOf;
  const textWithoutOptions = nqTextWithoutOptions;

  const isRequired = (el) => {
    if (el.required || el.getAttribute('aria-required') === 'true') return true;
    const wrapper = nqWrapperOf(el);
    if (wrapper?.querySelector('[class*="required"]')) return true;
    return /[*\\u2731\\uff0a\\u2217\\u066d]/.test(labelOf(el));
  };

  const kindOf = (el) => {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const role = el.getAttribute('role') || '';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (tag === 'select') return el.multiple ? 'multiselect' : 'select';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'fieldset' || role === 'radiogroup' || role === 'group') return 'radio';
    if (role === 'combobox' || el.getAttribute('aria-autocomplete')) return 'typeahead';
    if (type === 'date' || type === 'datetime-local' || type === 'month') return 'date';
    if (el.closest('[class*="datepicker"],[class*="date-picker"],[class*="calendar"]')) return 'date';
    if (type === 'file') return 'file';
    return 'text';
  };

  const optionsOf = (el) => {
    if (el.tagName === 'SELECT') return Array.from(el.options).map(o => o.text.trim()).filter(Boolean);
    const wrapper = nqWrapperOf(el);
    if (!wrapper) return [];
    const opts = wrapper.querySelectorAll('input[type="radio"],input[type="checkbox"],[role="option"],[role="radio"]');
    if (opts.length > 0) {
      return Array.from(opts).map(o => {
        const lbl = o.closest('label') || document.querySelector('label[for="' + (o.id || '') + '"]');
        return clean(lbl?.textContent || o.getAttribute('aria-label') || o.value || '');
      }).filter(Boolean);
    }
    return [];
  };

  const allControls = Array.from(document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),'
    + 'select,textarea,fieldset,[role="radiogroup"],[role="combobox"]'
  ));

  const valueOf = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') {
      const o = el.options[el.selectedIndex];
      return el.selectedIndex > 0 && o ? clean(o.textContent) : '';
    }
    if (tag === 'fieldset' || el.getAttribute('role') === 'radiogroup') {
      const checked = el.querySelector('input:checked,[aria-checked="true"],[role="radio"][aria-checked="true"]');
      if (!checked) return '';
      const lbl = checked.closest('label') || (checked.id ? document.querySelector('label[for="' + checked.id + '"]') : null);
      return clean(lbl?.textContent || checked.getAttribute('aria-label') || checked.value || '');
    }
    return clean(el.value || '');
  };

  const checkedOf = (el) => {
    if (typeof el.checked === 'boolean') return el.checked;
    const a = el.getAttribute('aria-checked') || el.getAttribute('aria-selected');
    return a === 'true';
  };

  const seen = new Set();
  const out = [];

  // ─── Grouped checkboxes / radios are ONE question each ───
  //
  // Emitted first so their individual members are skipped below. Sixteen
  // checkboxes sharing a name are one "Select ALL that apply" question, not
  // sixteen yes/no questions that happen to share a label.
  const inputGroups = nqFindInputGroups();
  const groupedNames = new Set(inputGroups.map(g => g.key.slice(6)));
  for (const g of inputGroups) {
    if (seen.has(g.key)) continue;
    seen.add(g.key);
    out.push({
      key: g.key,
      label: g.label.replace(/[*\\u2731\\uff0a\\u2217\\u066d]+/g, '').trim(),
      kind: g.kind,
      required: g.required,
      options: g.options,
      value: g.answered ? 'answered' : '',
      checked: g.answered,
      honeypot: null,
    });
  }

  for (const el of allControls) {
    if (!isVisible(el)) continue;
    // Portal chrome (résumé-autofill panes, cookie banners, site search) and the
    // internals of an open calendar or listbox popup are not questions.
    if (nqIsDecoy(el)) continue;
    if (nqInPopup(el)) continue;
    if (nqIsGhost(el)) continue;
    // Already covered by the group entry above.
    if (el.name && groupedNames.has(el.name)) continue;
    const key = keyOf(el);
    if (seen.has(key)) continue;
    seen.add(key);

    const kind = kindOf(el);
    // Skip file inputs — resume has its own dedicated upload path
    if (kind === 'file') continue;

    const label = labelOf(el);
    // Skip controls with no label and no identifying attribute — unactionable
    if (!label) continue;

    // Honeypot geometry. Collected here rather than in a second pass so it
    // costs no extra round-trip; the decision itself is made outside the VM.
    let hp = null;
    try { hp = ${HONEYPOT_PROBE}; } catch (e) { hp = null; }

    out.push({
      key,
      label: label.replace(/\\*+/g, '').trim(),
      kind,
      required: isRequired(el),
      options: optionsOf(el),
      value: valueOf(el),
      checked: checkedOf(el),
      honeypot: hp,
    });
  }

  // ─── Questions rendered as a row of buttons ───
  //
  // Appended after the control scan because they have no control to scan. Ashby
  // renders every Boolean question as two bare <button>s with aria-pressed and
  // no backing input, so both of OpenAI's knockout questions ("authorized to
  // work…", "require sponsorship…") were not merely unanswered — they never
  // reached the checklist at all.
  for (const g of nqFindButtonGroups()) {
    if (seen.has(g.key)) continue;
    seen.add(g.key);
    out.push({
      key: g.key,
      label: g.label.replace(/[*\\u2731\\uff0a\\u2217\\u066d]+/g, '').trim(),
      kind: 'buttongroup',
      required: g.required,
      options: g.options,
      value: g.answered ? (g.options.find(Boolean) || 'answered') : '',
      checked: g.answered,
      honeypot: null,
    });
  }

  return out;
});
return items;
`,
    timeout_sec: 30,
  })

  // ─── A scan that threw is not a form with no fields ───
  //
  // playwright.execute reports a failed script by returning no result, and the
  // old code coerced that straight to []. A ReferenceError inside the VM was
  // therefore indistinguishable from "this page genuinely has no controls" —
  // which is exactly how a broken helper injection produced a confident
  // "Form inventory: 0 total controls" and a run that filled nothing.
  if (!res.success || res.error) {
    if (applicationId) {
      await persistLog(applicationId, "error", `Form inventory scan FAILED in the browser: ${String(res.error || "unknown").slice(0, 300)}`)
      if (res.stderr) await persistLog(applicationId, "error", `[scan stderr] ${String(res.stderr).slice(0, 300)}`)
    }
    return []
  }
  const rawItems = ((res.result as any) || []) as Array<Record<string, any>>
  if (applicationId && rawItems.length === 0) {
    await persistLog(applicationId, "warn", "Form inventory scan returned no controls — the page may not have rendered its form yet.")
  }

  // ─── Honeypot filter ───
  // The VM's own visibility test only catches display/visibility/opacity:0.
  // Anti-bot fields are commonly positioned off-canvas, clipped, or nested in a
  // 1px overflow:hidden wrapper — all of which pass that test. Filling one is a
  // reliable spam signal, and this codebase has already been flagged as
  // automated by Ashby once.
  const items: any[] = []
  const trapped: string[] = []
  for (const item of rawItems) {
    const probe = item.honeypot as HoneypotDescriptor | null
    if (probe) {
      const verdict = isHoneypot(probe)
      if (verdict.isHoneypot) {
        trapped.push(`${item.label.slice(0, 30)} (${verdict.reason})`)
        continue
      }
    }
    delete item.honeypot
    items.push(item)
  }

  if (applicationId) {
    const req = items.filter((i: any) => i.required).length
    const opt = items.length - req
    const prefilled = items.filter((i: any) => i.value || i.checked).length
    await persistLog(applicationId, "info",
      `Form inventory: ${items.length} total controls (${req} required, ${opt} optional, ${prefilled} already populated) — ${items.map((i: any) => `${i.label.slice(0, 30)} [${i.kind}${i.required ? '*' : ''}]`).slice(0, 20).join(' | ')}`
    )
    if (trapped.length) {
      await persistLog(applicationId, "warn",
        `Skipped ${trapped.length} honeypot field(s) — filling these flags the submission as a bot: ${trapped.join(' | ')}`
      )
    }
  }
  return items
}

// ─── auditForm: list every visible required field that is still empty (NO submit) ───
// Claude: audit-only, so the caller can drive a fill-the-gaps loop before submitting.
// Detects required-ness three ways: [required]/[aria-required], a label ending in "*", and
// radio/checkbox groups whose legend has a "*". Returns human-readable labels for the agent.
async function auditForm(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  applicationId?: string
): Promise<{ unfilledFields: string[]; fields: Array<{ label: string; key: string }> }> {
  const res = await kernelClient.browsers.playwright.execute(sessionId, {
    code: `
const result = await page.evaluate(() => {
${VM_DOM_HELPERS}
  const candidates = [];
  document.querySelectorAll('input[required],select[required],textarea[required],[aria-required="true"]').forEach(el => candidates.push(el));
  document.querySelectorAll('label').forEach(label => {
    if (/[*\\u2731\\uff0a\\u2217\\u066d]\\s*$/.test(label.textContent?.trim() || '')) {
      const forId = label.getAttribute('for');
      const input = forId ? document.getElementById(forId) : (label.querySelector('input,select,textarea') || nqWrapperOf(label)?.querySelector('input,select,textarea'));
      if (input && !candidates.includes(input)) candidates.push(input);
    }
  });
  document.querySelectorAll('fieldset,[role="radiogroup"],[role="group"]').forEach(group => {
    const legendText = group.querySelector('legend,[class*="label"],[class*="title"]')?.textContent || '';
    if (/[*\\u2731\\uff0a\\u2217\\u066d]/.test(legendText) && !candidates.includes(group)) candidates.push(group);
  });

  // ─── Is this control actually filled? ───
  // Reads RENDERED state, not just .value: a Greenhouse/Ashby combobox shows its
  // choice in a sibling <div> while the backing input stays empty, which made a
  // correctly-filled field audit as empty forever and get refilled every round.
  const isFilled = (el) => {
    const tag = el.tagName;
    const role = el.getAttribute('role');
    const type = (el.getAttribute('type') || '').toLowerCase();

    if (tag === 'FIELDSET' || role === 'radiogroup' || role === 'group') {
      return !!el.querySelector('[aria-checked="true"],input:checked,[aria-pressed="true"],[aria-selected="true"]');
    }
    if (type === 'checkbox' || type === 'radio') return !!el.checked;
    const ariaState = el.getAttribute('aria-checked') || el.getAttribute('aria-selected');
    if (ariaState !== null) return ariaState === 'true';
    if (tag === 'SELECT') {
      const v = (el.value || '').trim();
      return !!v && el.selectedIndex > 0;
    }
    const v = (el.value || '').trim();
    if (v && v !== 'Select...' && v !== 'Select' && v !== '--' && v !== '-') return true;

    const isCombo = role === 'combobox' || !!el.getAttribute('aria-autocomplete') || !!el.getAttribute('aria-controls');
    const wrap = el.closest('[class*="select"],[class*="combobox"],[class*="autocomplete"],[class*="control"],[class*="field"],[class*="question"]');
    if (isCombo || wrap) {
      if (el.getAttribute('aria-activedescendant')) return true;
      if (wrap) {
        const chosen = wrap.querySelector(
          '[class*="singleValue"],[class*="single-value"],[class*="multiValue"],[class*="multi-value"],' +
          '[class*="chip"],[class*="tag"],[class*="selectedValue"],[class*="selected-value"],[aria-selected="true"]'
        );
        if (chosen && (chosen.textContent || '').trim()) return true;
        const hidden = wrap.querySelector('input[type="hidden"]');
        if (hidden && (hidden.value || '').trim()) return true;
      }
    }
    return false;
  };

  const unfilled = candidates.filter(el => {
    if (el.type === 'file') return false;               // résumé tracked separately
    if (el.type === 'hidden') return false;
    if (nqIsGhost(el)) return false;                    // react-select sentinel
    if (nqIsDecoy(el) || nqInPopup(el)) return false;
    if (!nqIsVisible(el)) return false;
    return !isFilled(el);
  }).map(el => ({ label: nqLabelOf(el).slice(0, 120), key: nqKeyOf(el) }));

  // Button-group questions have no control for the [required] sweep to find.
  for (const g of nqFindButtonGroups()) {
    if (!g.required || g.answered) continue;
    unfilled.push({ label: g.label.slice(0, 120), key: g.key });
  }

  // De-dup on the STABLE key, not the label.
  const seen = new Set();
  const fields = [];
  for (const f of unfilled) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    fields.push(f);
  }
  return { unfilledFields: fields.map(f => f.label), fields };
});
return result;
`,
    timeout_sec: 20,
  })
  if ((!res.success || res.error) && applicationId) {
    // Same trap as the inventory scan: a thrown audit reads as "everything is
    // filled", which is the most dangerous possible default — it opens the
    // submit gate on a form nobody checked.
    await persistLog(applicationId, "error", `auditForm FAILED in the browser: ${String(res.error || "unknown").slice(0, 300)}`)
  }
  const result = (res.result as any) || { unfilledFields: [], fields: [] }
  if (!Array.isArray(result.fields)) result.fields = []
  if (applicationId) {
    await persistLog(applicationId, result.unfilledFields.length ? 'warn' : 'info',
      // Log the stable key alongside the label: when a loop happens, this is
      // what shows whether the field identity actually changed between rounds.
      `auditForm: ${result.unfilledFields.length} unfilled → ${result.fields.map((f: any) => `${f.label} <${f.key}>`).join(' | ') || 'all required fields filled'}`
    )
  }
  return result
}

// ─── ensureApplyFormOpen: click through to the actual application form ───
// Board URLs often serve a job DESCRIPTION with an "Apply for this Job" button;
// the form only exists after clicking it (or at a dedicated apply URL). This ran
// on the CDP page proxy inside a bare try/catch, so when the proxy choked the
// failure was invisible and the run continued against a form-less page.
async function ensureApplyFormOpen(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  applicationId?: string
): Promise<{ clicked: boolean; reason: string }> {
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
// Already have real inputs? Nothing to click.
const existing = await page.evaluate(() => {
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (r.width > 0 || r.height > 0) && s.display !== 'none' && s.visibility !== 'hidden';
  };
  return Array.from(document.querySelectorAll('input[type="text"],input[type="email"],input[type="file"],textarea'))
    .filter(isVisible).length;
});
if (existing > 0) return { clicked: false, reason: 'form-already-present', inputs: existing };

const selectors = [
  'a:has-text("Apply for this Job")', 'button:has-text("Apply for this Job")',
  'a:has-text("Apply Now")', 'button:has-text("Apply Now")',
  'a:has-text("Apply")', 'button:has-text("Apply")',
  '[role="button"]:has-text("Apply")',
];

for (const sel of selectors) {
  try {
    const btn = page.locator(sel).first();
    if (await btn.count() === 0) continue;
    if (!(await btn.isVisible({ timeout: 2000 }).catch(() => false))) continue;
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.click({ timeout: 5000 });
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => document.querySelectorAll('input,textarea').length);
    return { clicked: true, reason: 'clicked:' + sel, inputsAfter: after };
  } catch (e) { /* try the next selector */ }
}
return { clicked: false, reason: 'no-apply-button-found', inputs: existing };
`,
      timeout_sec: 45,
    })
    const r = (res.result as any) || {}
    if (applicationId) {
      await persistLog(applicationId, "info", `ensureApplyFormOpen: ${r.reason}${r.inputsAfter != null ? ` (inputs after: ${r.inputsAfter})` : ""}`)
    }
    return { clicked: !!r.clicked, reason: r.reason || "unknown" }
  } catch (err) {
    if (applicationId) {
      await persistLog(applicationId, "warn", `ensureApplyFormOpen threw: ${err instanceof Error ? err.message : String(err)}`)
    }
    return { clicked: false, reason: "threw" }
  }
}

// ─── waitForApplicationForm: prove a fillable form exists before proceeding ───
// Without this, a description page reports "0 unfilled → all required fields
// filled" (because there are no fields), which looks like success everywhere
// except the final submit gate.
async function waitForApplicationForm(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  applicationId?: string
): Promise<{ hasForm: boolean; inputs: number; fileInputs: number }> {
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
try {
  await page.waitForFunction(() => {
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (r.width > 0 || r.height > 0) && s.display !== 'none' && s.visibility !== 'hidden';
    };
    return Array.from(document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],textarea'))
      .filter(isVisible).length > 0;
  }, null, { timeout: 12000 });
} catch {}

return await page.evaluate(() => {
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (r.width > 0 || r.height > 0) && s.display !== 'none' && s.visibility !== 'hidden';
  };
  const inputs = Array.from(document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],textarea'))
    .filter(isVisible).length;
  // File inputs are counted regardless of visibility: ATS forms routinely hide
  // the real <input type=file> behind a styled button.
  const fileInputs = document.querySelectorAll('input[type="file"]').length;
  return { inputs, fileInputs, url: location.href };
});
`,
      timeout_sec: 45,
    })
    const r = (res.result as any) || { inputs: 0, fileInputs: 0 }
    const hasForm = (r.inputs ?? 0) > 0 || (r.fileInputs ?? 0) > 0
    if (applicationId) {
      await persistLog(
        applicationId,
        hasForm ? "info" : "error",
        `Form check: ${r.inputs ?? 0} visible text input(s), ${r.fileInputs ?? 0} file input(s) at ${String(r.url || "").slice(0, 100)}${hasForm ? "" : " — NO APPLICATION FORM ON THIS PAGE"}`
      )
    }
    return { hasForm, inputs: r.inputs ?? 0, fileInputs: r.fileInputs ?? 0 }
  } catch {
    return { hasForm: false, inputs: 0, fileInputs: 0 }
  }
}


/**
 * Call the first model in the chain that actually answers.
 *
 * One implementation for every LLM call in the file. Previously `askModel` and
 * `generateCustomAnswers` each had their own provider loop with their own
 * fallback rules, and they disagreed: one skipped Google entirely, the other
 * hard-coded a single Gemini model. Both flattened all failures to "" so an
 * exhausted quota looked identical to a model with nothing to say.
 *
 * Failures are classified, and a bad credential poisons only itself: a 401 on
 * OpenRouter removes every OpenRouter attempt from the rest of THIS call, but a
 * 429 moves to the next model and keeps the key.
 */
const deadKeys = new Set<string>()

/**
 * OpenRouter's currently-free model ids, refreshed once per process.
 *
 * Read from the live catalogue because the free tier changes constantly — a
 * hard-coded list goes stale and every entry in it then costs a wasted request.
 */
let freeModelIds: string[] = []
let freeModelsLoaded = false
async function ensureFreeModels(applicationId?: string): Promise<void> {
  if (freeModelsLoaded) return
  freeModelsLoaded = true
  try {
    freeModelIds = await refreshFreeModels()
    if (applicationId) {
      await persistLog(applicationId, "info", `${freeModelIds.length} free OpenRouter model(s) available as fallbacks: ${freeModelIds.slice(0, 6).join(", ")}${freeModelIds.length > 6 ? " …" : ""}`)
    }
  } catch {
    freeModelIds = []
  }
}

async function callLlm(
  prompt: string,
  attempts: LlmAttempt[],
  opts: { json?: boolean; maxTokens?: number; applicationId?: string; purpose?: string } = {}
): Promise<{ text: string; model: string; failures: string[] }> {
  const failures: string[] = []
  const maxTokens = opts.maxTokens ?? 800
  let chain = attempts
  let retriedAfterWait: Set<string> | null = null

  for (let ci = 0; ci < chain.length; ci++) {
    const a = chain[ci]
    const keyId = `${a.provider}:${a.apiKey.slice(-8)}`
    if (deadKeys.has(keyId)) continue

    try {
      let res: Response
      if (a.provider === "google") {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${a.model}:generateContent?key=${a.apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0,
                maxOutputTokens: maxTokens,
                ...(opts.json ? { responseMimeType: "application/json" } : {}),
              },
            }),
          }
        )
      } else {
        const base = a.provider === "groq" ? GROQ_BASE_URL : a.provider === "openrouter" ? OPENROUTER_BASE_URL : "https://api.openai.com/v1"
        res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${a.apiKey}`,
            ...(a.provider === "openrouter"
              ? { "HTTP-Referer": "https://admin.nextquark.in", "X-Title": "NextQuark Auto-Apply" }
              : {}),
          },
          body: JSON.stringify({
            model: a.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
            max_tokens: maxTokens,
            ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          }),
        })
      }

      if (!res.ok) {
        const kind = classifyLlmStatus(res.status)
        let detail = `HTTP ${res.status} (${kind})`
        // A bad credential is a property of the KEY, not of this model — skip
        // every remaining attempt that would present it again.
        if (kind === "auth") {
          deadKeys.add(keyId)
        } else if (kind === "quota") {
          // Gemini's free tier meters per model and per minute, and says how
          // long to wait. Moving to the next model is nearly always better than
          // waiting — but when this is the LAST attempt and the wait is short,
          // sleeping beats returning nothing.
          const body = await res.json().catch(() => null)
          const wait = parseRetryDelaySeconds(body)
          if (wait !== null) detail += ` — retry in ${wait.toFixed(0)}s`
          const isLast = a === chain[chain.length - 1]
          if (isLast && wait !== null && wait <= 65) {
            if (opts.applicationId) {
              await persistLog(opts.applicationId, "warn", `Last model in the chain is rate-limited; waiting ${wait.toFixed(0)}s for ${a.label} rather than giving up.`)
            }
            await new Promise((r) => setTimeout(r, Math.ceil((wait + 1) * 1000)))
            retriedAfterWait = retriedAfterWait || new Set()
            if (!retriedAfterWait.has(a.label)) {
              retriedAfterWait.add(a.label)
              chain = [...chain, a]  // one more go, once
            }
          }
        }
        failures.push(`${a.label}: ${detail}`)
        continue
      }

      const data = await res.json()
      const text =
        a.provider === "google"
          ? String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim()
          : String(data?.choices?.[0]?.message?.content ?? "").trim()

      if (!text) {
        failures.push(`${a.label}: empty reply`)
        continue
      }
      if (opts.applicationId && failures.length > 0) {
        await persistLog(opts.applicationId, "info",
          `LLM${opts.purpose ? ` (${opts.purpose})` : ""} answered on fallback ${a.label} after ${failures.length} failed attempt(s): ${failures.slice(0, 4).join("; ")}`
        )
      }
      return { text, model: a.label, failures }
    } catch (e) {
      failures.push(`${a.label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (opts.applicationId) {
    await persistLog(opts.applicationId, "error",
      `Every model in the chain failed${opts.purpose ? ` for ${opts.purpose}` : ""} (${chain.length} attempted): ${failures.slice(0, 8).join(" | ")}`
    )
  }
  return { text: "", model: "none", failures }
}

/**
 * A plain text completion — no JSON schema, no tool calls.
 *
 * Used for option selection, where the reply is a single option string that
 * {@link matchReplyToOption} maps back to a real DOM index. Deliberately
 * separate from generateCustomAnswers, which asks for a JSON object.
 *
 * Walks the same model chain and returns "" if every model fails, so the caller
 * falls through to its own handling rather than throwing.
 */
async function askModel(
  prompt: string,
  chain: ModelChoice[],
  applicationId?: string
): Promise<string> {
  // The legacy ModelChoice chain is mapped onto the unified attempt list so
  // there is exactly one place that knows how to talk to a provider, one place
  // that classifies a failure, and one place that walks the free-tier fallbacks.
  const attempts: LlmAttempt[] = []
  for (const c of chain) {
    if (c.label.startsWith("groq/")) {
      attempts.push({ label: c.label, provider: "groq", model: c.label.replace(/^groq\//, ""), apiKey: c.apiKey, json: false })
      continue
    }
    const isOpenRouter = c.label.startsWith("openrouter/")
    if (isOpenRouter) {
      attempts.push({ label: c.label, provider: "openrouter", model: c.label.replace(/^openrouter\//, ""), apiKey: c.apiKey, json: false })
    } else if (c.stagehandModel?.provider === "google") {
      attempts.push({ label: c.label, provider: "google", model: String(c.stagehandModel.modelName || "gemini-2.5-flash").replace(/^google\//, ""), apiKey: c.apiKey, json: false })
    } else {
      attempts.push({ label: c.label, provider: "openai", model: String(c.stagehandModel?.modelName || "gpt-4o-mini"), apiKey: c.apiKey, json: false })
    }
  }
  // ── Fallbacks, appended so a rate-limited model never ends the attempt ──
  // Gemini's ladder first: its quota is per-model and per-minute, so the very
  // next entry usually succeeds immediately. The OpenRouter free tier after it.
  const gemKey = chain.find((c) => c.stagehandModel?.provider === "google")?.apiKey
  if (gemKey) {
    const already = new Set(attempts.filter((a) => a.provider === "google").map((a) => a.model))
    for (const m of GEMINI_TEXT_MODELS) {
      if (already.has(m)) continue
      attempts.push({ label: `google/${m}`, provider: "google", model: m, apiKey: gemKey, json: false })
    }
  }
  const orKey = chain.find((c) => c.label.startsWith("openrouter/"))?.apiKey
  if (orKey) {
    for (const m of freeModelIds) {
      attempts.push({ label: `openrouter-free/${m}`, provider: "openrouter", model: m, apiKey: orKey, free: true, json: false })
    }
  }

  // ── Exhaust a provider's own ladder before moving to the next provider ──
  //
  // The two fallback blocks above append to the END of the list, so the Gemini
  // ladder was landing BEHIND the paid OpenRouter entries. A Gemini model that
  // was merely rate-limited — its quota is per-model and per-minute, so the next
  // Gemini entry usually succeeds within seconds — therefore sent the call to
  // OpenRouter first, which is exactly the hop this ordering exists to avoid.
  //
  // Free OpenRouter outranks paid OpenRouter for the same reason: a model that
  // costs nothing and might answer beats one that bills for the attempt, and on
  // a credit-exhausted account the paid entries cannot answer at all.
  //
  // A stable sort, so the deliberate ordering WITHIN each tier is preserved.
  const tier = (a: LlmAttempt): number =>
    a.provider === "groq" ? 0 : a.provider === "google" ? 1 : a.provider === "openai" ? 2 : a.free ? 3 : 4
  attempts.sort((x, y) => tier(x) - tier(y))

  // The chain now carries free models of its own, and the block above appends the
  // full free list, so the same model can appear twice. Retrying an identical
  // provider+model pair can only fail the same way it just did.
  const seenAttempt = new Set<string>()
  const ordered = attempts.filter((a) => {
    const k = `${a.provider}\u0000${a.model}`
    if (seenAttempt.has(k)) return false
    seenAttempt.add(k)
    return true
  })

  const { text } = await callLlm(prompt, ordered, {
    maxTokens: 200,
    applicationId,
    purpose: "option choice",
  })
  return text
}

// ─── fillFieldWithHandler: dispatch to the right widget handler ───
// Replaces the two ~300-line VM monoliths (fillFieldSmartInVM + fillTypeaheadInVM)
// that grew by patching and could not be tested. Handler selection is now pure
// and unit-tested in lib/field-handlers; only the chosen handler's code runs.
//
// Two phases, one VM round-trip each:
//   1. describe — read the element's attributes and tag it
//   2. drive    — run the selected handler's code against the tagged node
async function fillFieldWithHandler(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  fieldKey: string,
  label: string,
  value: string,
  portalType: string,
  applicationId?: string,
  /** The label this answer was planned for. Checked against what we resolve. */
  expectedLabel?: string
): Promise<HandlerResult> {
  const TARGET_ATTR = "data-nq-field"

  try {
    // ── Phase 1: describe the control ──
    const descRes = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
const KEY = ${JSON.stringify(fieldKey)};
const TAG = ${JSON.stringify(TARGET_ATTR)};

return await page.evaluate((args) => {
${VM_DOM_HELPERS}
  const el = nqResolveKey(args.key);
  if (!el) return { ok: false, reason: 'element-not-found' };

  document.querySelectorAll('[' + args.tag + ']').forEach(n => n.removeAttribute(args.tag));
  el.setAttribute(args.tag, '1');

  const attr = (n) => el.getAttribute(n);
  const isButtonGroup = args.key.indexOf('btn:') === 0;
  const isCheckboxGroup = args.key.indexOf('group:') === 0;
  return {
    ok: true,
    // Read the label back off the element we ACTUALLY resolved. The caller
    // compares it to the label it planned an answer for and refuses to write on
    // a mismatch — the last guard against a value landing in the wrong box.
    resolvedLabel: (isButtonGroup
      ? nqTextWithoutOptions(el.querySelector('label,legend,[class*="label"]'))
      : nqLabelOf(el)).slice(0, 160),
    groupSize: isCheckboxGroup && el.name
      ? document.querySelectorAll('[name="' + nqEsc(el.name) + '"]').length
      : 0,
    d: {
      tag: (el.tagName || '').toLowerCase(),
      type: attr('type'),
      // A button-group container is not a control, so it gets a synthetic role
      // that only its own handler claims.
      role: isButtonGroup ? 'nq-buttongroup' : isCheckboxGroup ? 'nq-checkboxgroup' : attr('role'),
      id: el.id || null,
      name: el.name || null,
      className: typeof el.className === 'string' ? el.className : null,
      autocomplete: attr('autocomplete'),
      placeholder: attr('placeholder'),
      ariaLabel: attr('aria-label'),
      ariaAutocomplete: attr('aria-autocomplete'),
      ariaHasPopup: attr('aria-haspopup'),
      ariaControls: attr('aria-controls'),
      dataAutomationId: attr('data-automation-id'),
      multiple: !!el.multiple,
      label: null,
      inDateContainer: !!el.closest('[class*="date"],[class*="calendar"],[class*="datepicker"]'),
    },
  };
}, { key: KEY, tag: TAG });
`,
      timeout_sec: 30,
    })

    const desc = (descRes.result as any) || {}
    if (!desc.ok) {
      return { handled: false, filled: false, handler: "none", reason: desc.reason || "describe-failed" }
    }

    // ─── Wrong-field guard ───
    //
    // Refuse to write when the control we resolved is not the one we planned an
    // answer for. Comparison is deliberately loose — a label legitimately gains
    // or loses an asterisk, a "(required)" suffix, or surrounding whitespace
    // between the scan and the write — so only a genuine change in identity
    // trips it, not cosmetic drift.
    const resolvedLabel: string = String(desc.resolvedLabel || "")
    if (expectedLabel && resolvedLabel) {
      const canon = (s: string) => s.replace(/[*✱＊]+/g, " ").replace(/\(optional\)|\(required\)/gi, " ").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase()
      const want = canon(expectedLabel)
      const got = canon(resolvedLabel)
      const compatible =
        !want || !got ||
        want === got ||
        want.startsWith(got) || got.startsWith(want) ||
        want.includes(got) || got.includes(want)
      if (!compatible) {
        return {
          handled: false, filled: false, handler: "none",
          reason: `label-mismatch: planned for "${expectedLabel.slice(0, 40)}" but ${fieldKey} is now "${resolvedLabel.slice(0, 40)}"`,
          resolvedLabel, labelMismatch: true,
        }
      }
    }

    const descriptor: ElementDescriptor = { ...desc.d, label }
    const handler = selectHandler(descriptor)
    if (!handler) {
      return { handled: false, filled: false, handler: "none", reason: `no-handler-for-${descriptor.tag}/${descriptor.type ?? "?"}` }
    }

    // ── Phase 2: run the chosen handler ──
    const program = buildHandlerProgram(handler, {
      fieldKey,
      label,
      value,
      optionSelector: optionSelectorFor(portalType),
      targetAttr: TARGET_ATTR,
    })
    const runRes = await kernelClient.browsers.playwright.execute(sessionId, {
      code: program,
      timeout_sec: 60,
    })

    // ─── A thrown handler must not report as "unknown" ───
    //
    // playwright.execute reports a VM-side throw on `error`, with `result` left
    // undefined — and only `result` was ever read. Every such failure therefore
    // arrived as reason "unknown" with no options and no message, which is
    // exactly the shape of a widget that ran fine and simply matched nothing.
    // The two need completely different fixes, and the log could not tell them
    // apart: a live run showed 13 "FAILED (unknown)" lines and not one of them
    // said what actually went wrong.
    const r = (runRes.result as any) || {}
    const vmError = !runRes.success && runRes.error ? String(runRes.error) : ""
    const result: HandlerResult = {
      handled: r.handled !== false,
      filled: !!r.filled,
      handler: r.handler || handler.name,
      reason: r.reason || (vmError ? `threw: ${vmError.slice(0, 200)}` : "unknown"),
      picked: r.picked,
      options: Array.isArray(r.options) ? r.options : undefined,
      needsModelChoice: !!r.needsModelChoice,
      resolvedLabel,
    }

    if (applicationId) {
      await persistLog(
        applicationId,
        result.filled ? "info" : "warn",
        `[${result.handler}] "${label.slice(0, 45)}" ← "${String(value).slice(0, 35)}": ${result.filled ? "filled" : "FAILED"} (${result.reason})` +
          (runRes.stderr ? ` | stderr: ${String(runRes.stderr).slice(0, 200)}` : "") +
          (result.picked ? ` → "${String(result.picked).slice(0, 50)}"` : "") +
          // The options the widget actually offered are THE diagnostic on a
          // mismatch — without them a failure is unactionable.
          (result.options?.length ? ` | options: ${JSON.stringify(result.options.slice(0, 12))}` : "")
      )
    }
    return result
  } catch (err) {
    return {
      handled: false,
      filled: false,
      handler: "none",
      reason: `threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Is this specific control actually holding a value now?
 *
 * `act()` reports "ok" whenever it managed to run a plan, not when the field
 * ended up filled — it resolved the Greenhouse location combobox to
 * `selectOptionFromDropdown`, claimed success, and left the field empty. Every
 * optimistic mark based on that self-report was a lie the audit gate later had
 * to catch. Reading the DOM is the only trustworthy confirmation.
 *
 * Understands the same rendered-state rules as `auditForm`: ARIA state, native
 * checked, react-select's `singleValue` node, and hidden companion inputs.
 */
async function verifyFieldFilled(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  fieldKey: string
): Promise<boolean> {
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
const KEY = ${JSON.stringify(fieldKey)};
return await page.evaluate((key) => {
${VM_DOM_HELPERS}
  const el = nqResolveKey(key);
  if (!el) return false;

  // A checkbox / radio group is answered when ANY member is checked.
  if (key.indexOf('group:') === 0) {
    const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
    return !!document.querySelector('[name="' + esc(key.slice(6)) + '"]:checked');
  }
  // A button-group question is answered when one of its buttons reads selected.
  if (key.indexOf('btn:') === 0) {
    return !!el.querySelector('[aria-pressed="true"],[aria-checked="true"],[aria-selected="true"],input:checked');
  }

  const tag = el.tagName;
  const role = el.getAttribute('role');
  const type = (el.getAttribute('type') || '').toLowerCase();

  if (tag === 'FIELDSET' || role === 'radiogroup' || role === 'group') {
    return !!el.querySelector('[aria-checked="true"],input:checked,[aria-pressed="true"],[aria-selected="true"]');
  }
  if (type === 'checkbox' || type === 'radio') return !!el.checked;
  const ariaState = el.getAttribute('aria-checked') || el.getAttribute('aria-selected');
  if (ariaState !== null) return ariaState === 'true';
  if (tag === 'SELECT') return !!(el.value || '').trim() && el.selectedIndex > 0;

  const v = (el.value || '').trim();
  if (v && ['select...', 'select', '--', '-'].indexOf(v.toLowerCase()) === -1) return true;

  const wrap = el.closest('[class*="select"],[class*="combobox"],[class*="autocomplete"],[class*="control"],[class*="field"],[class*="question"]');
  if (wrap) {
    const chosen = wrap.querySelector('[class*="singleValue"],[class*="single-value"],[class*="multiValue"],[class*="multi-value"],[class*="chip"],[class*="tag"],[class*="selectedValue"],[aria-selected="true"]');
    if (chosen && (chosen.textContent || '').trim()) return true;
    const hidden = wrap.querySelector('input[type="hidden"]');
    if (hidden && (hidden.value || '').trim()) return true;
  }
  return false;
}, KEY);
`,
      timeout_sec: 15,
    })
    return !!res.result
  } catch {
    return false
  }
}

/**
 * The OTP Manager admin panel, read directly from the DOM.
 *
 * The third tier of OTP retrieval, and until now the one Kernel was missing.
 * browser-use and browserbase both fall back to it; Kernel went straight from
 * "the API did not have it" to "wait for a human", which meant a code that HAD
 * arrived — and was sitting in the panel — went unused for three minutes and
 * then failed the run.
 *
 * Deliberately deterministic rather than agent-driven. The two existing
 * implementations ask an LLM to read a table and report `OTP_CODE=…`, which
 * costs several model calls and can hallucinate a code from an adjacent row.
 * The table has a fixed column layout; parsing it is exact, free, and cannot
 * invent a value.
 */
async function fetchOtpFromAdminPanel(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  applicationId: string,
  proxyEmail: string,
  applicationId_log?: string,
  attempts = 5
): Promise<string | null> {
  const OTP_MANAGER_URL = "https://admin.nextquark.in/otp-manager"
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
const APP_ID = ${JSON.stringify(applicationId)};
const PROXY = ${JSON.stringify(proxyEmail || "")};
const ATTEMPTS = ${attempts};

const ctx = page.context();
const tab = await ctx.newPage();
try {
  await tab.goto(${JSON.stringify(OTP_MANAGER_URL)}, { waitUntil: 'domcontentloaded', timeout: 30000 });
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // The panel loads its rows asynchronously and ships a Refresh button; the
    // empty-state text lies while the fetch is in flight, so never trust it.
    try {
      const refresh = tab.locator('button:has-text("Refresh")').first();
      if (await refresh.count() > 0) { await refresh.click(); }
    } catch {}
    await tab.waitForTimeout(2500);

    const hit = await tab.evaluate((args) => {
      const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const rows = Array.from(document.querySelectorAll('table tbody tr, [role="row"]'));
      const readRow = (r) => Array.from(r.querySelectorAll('td,[role="cell"]')).map(c => clean(c.textContent));
      // Header order tells us which column holds what, rather than assuming.
      const headers = Array.from(document.querySelectorAll('table thead th, [role="columnheader"]')).map(h => clean(h.textContent).toLowerCase());
      const col = (needle) => headers.findIndex(h => h.includes(needle));
      const iQueue = col('queue');
      const iProxy = col('proxy');
      const iOtp = col('extracted');
      const iBody = col('body text');

      const looksLikeCode = (s) => /^[A-Za-z0-9]{4,10}$/.test(s || '');
      const fromBody = (s) => {
        if (!s) return null;
        const m = s.match(/(?:code|otp|pin|token|verification|verify|security code)\\s*(?:is|:|=)?\\s*([A-Za-z0-9]{4,10})/i)
              || s.match(/\\b(\\d{6})\\b/) || s.match(/\\b(\\d{4,8})\\b/);
        return m ? m[1] : null;
      };

      const candidates = [];
      for (const r of rows) {
        const cells = readRow(r);
        if (!cells.length) continue;
        const byQueue = iQueue >= 0 && cells[iQueue] === args.appId;
        const byProxy = args.proxy && iProxy >= 0 && (cells[iProxy] || '').toLowerCase() === args.proxy.toLowerCase();
        if (!byQueue && !byProxy) continue;
        const extracted = iOtp >= 0 ? cells[iOtp] : '';
        const code = looksLikeCode(extracted) ? extracted : fromBody(iBody >= 0 ? cells[iBody] : cells.join(' '));
        if (code) candidates.push({ code, exact: byQueue });
      }
      // A queue-id match is authoritative; a proxy-address match is a guess and
      // is only used when nothing matched exactly.
      const exact = candidates.find(c => c.exact);
      return (exact || candidates[0] || null);
    }, { appId: APP_ID, proxy: PROXY });

    if (hit && hit.code) return { otp: hit.code, exact: !!hit.exact, attempt: attempt + 1 };
    await tab.waitForTimeout(5000);
  }
  return { otp: null };
} finally {
  try { await tab.close(); } catch {}
  try { await ctx.pages()[0].bringToFront(); } catch {}
}
`,
      timeout_sec: 120,
    })
    const r = (res.result as any) || {}
    if (applicationId_log) {
      await persistLog(
        applicationId_log,
        r.otp ? "info" : "warn",
        r.otp
          ? `OTP read from the admin panel on attempt ${r.attempt} (${r.exact ? "matched by queue id" : "matched by proxy address"})`
          : "OTP Manager had no matching row"
      )
    }
    return r.otp || null
  } catch (err) {
    if (applicationId_log) {
      await persistLog(applicationId_log, "warn", `OTP Manager read failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    return null
  }
}

// ─── readValidationErrors: extract specific field labels Workday/React portals flag after a failed submit ───
// Returns human-readable field names so the next fill round targets exactly what failed.
async function readValidationErrors(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string
): Promise<string[]> {
  const res = await kernelClient.browsers.playwright.execute(sessionId, {
    code: `
const errors = await page.evaluate(() => {
  const clean = s => s.replace(/\\s+/g,' ').replace(/\\s*[*\\u2731\\uff0a\\u2217\\u066d]\\s*$/,'').replace(/^error[:\\s-]*/i,'').trim().slice(0,80);
  const groupLabel = el => {
    const group = el.closest('[data-automation-id^="formField-"]');
    const lab = group?.querySelector('label,legend,[id$="-label"]');
    return lab?.textContent ? clean(lab.textContent) : '';
  };
  const out = new Set();
  // Workday error message nodes
  document.querySelectorAll('[data-automation-id="errorMessage"],[role="alert"]').forEach(e => {
    const label = groupLabel(e) || clean(e.textContent || '');
    if (label && !/^errors?\\b/i.test(label)) out.add(label);
  });
  // aria-invalid controls (React portals: Greenhouse/Lever/Ashby)
  document.querySelectorAll('[aria-invalid="true"]').forEach(f => {
    const label = groupLabel(f) || clean(f.getAttribute('aria-label') || '');
    if (label) out.add(label);
  });
  // Labels with error class siblings
  document.querySelectorAll('.error-message,.field-error,[class*="errorText"],[class*="error-text"]').forEach(e => {
    const wrapper = e.closest('[class*="field"],[class*="question"],[class*="form-group"]');
    const lab = wrapper?.querySelector('label,legend')?.textContent?.trim();
    if (lab) out.add(clean(lab));
  });
  return Array.from(out).slice(0, 8);
});
return errors;
`,
    timeout_sec: 10,
  })
  return (res.result as any) || []
}

// ─── clickSubmitButton: the ONLY thing that clicks Submit — agent never does ───
async function clickSubmitButton(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  applicationId?: string
): Promise<{ clicked: boolean; url: string; bodyText: string }> {
  // ── Dry run: report the button, do not press it ──
  // Everything upstream has already happened for real — the form is filled and
  // the audit has passed. This stops at the single step that cannot be undone.
  if (DRY_RUN) {
    const probe = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
return await page.evaluate(() => {
  const sels = ['[data-qa="btn-submit"]','#btn-submit','button[data-automation-id="submitButton"]','button[type="submit"]','input[type="submit"]'];
  const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
  const byText = Array.from(document.querySelectorAll('button,input[type="submit"],[role="button"]')).filter(isVisible)
    .filter(el => /submit|send application|apply now/i.test(el.innerText || el.value || el.getAttribute('aria-label') || ''));
  const bySel = sels.map(s => document.querySelector(s)).filter(Boolean).filter(isVisible);
  const target = bySel[0] || byText[0] || null;
  return {
    found: !!target,
    label: target ? (target.innerText || target.value || target.getAttribute('aria-label') || '').replace(/\\s+/g,' ').trim() : '',
    disabled: target ? (!!target.disabled || target.getAttribute('aria-disabled') === 'true') : false,
    url: location.href,
    bodyText: document.body.innerText.slice(0, 500),
  };
});
`,
      timeout_sec: 20,
    }).catch(() => null)
    const p = (probe?.result as any) || {}
    if (applicationId) {
      await persistLog(applicationId, "warn",
        `DRY RUN — not clicking submit. Target: ${p.found ? `"${p.label}"${p.disabled ? " (DISABLED)" : " (enabled)"}` : "no submit button found"}`
      )
    }
    return { clicked: false, url: p.url || "", bodyText: `[DRY RUN] submit not clicked; target="${p.label || "none"}" disabled=${!!p.disabled}` }
  }

  const res = await kernelClient.browsers.playwright.execute(sessionId, {
    code: `
// Read-before-submit. Previously this jumped to the bottom and clicked within
// ~400ms of the last field being filled — nobody submits an application that
// fast, and Ashby flagged a run as spam. Scroll through the form the way a
// person re-reads it, then pause before committing.
const rnd = (min, max) => min + Math.random() * (max - min);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const height = await page.evaluate(() => document.body.scrollHeight);
const steps = 4 + Math.floor(Math.random() * 3);
for (let i = 1; i <= steps; i++) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), Math.round((height / steps) * i));
  await sleep(rnd(220, 620));
}
// The review beat before clicking.
await sleep(rnd(1400, 3200));

// ─── Selector order matters ───
//
// On Lever the REAL submit is <button id="btn-submit" type="button">Submit
// application</button>, and the only button[type="submit"] on the page is
// <button id="hcaptchaSubmitBtn" type="submit" class="hidden">. Trying
// button[type="submit"] first meant reaching the right control only because the
// visibility check happened to reject the decoy. Named, portal-specific hooks
// go first; the generic type selector is the last resort, not the first guess.
const submitSels = [
  '[data-qa="btn-submit"]',
  '#btn-submit',
  'button[data-automation-id="submitButton"]',
  'button:has-text("Submit Application")',
  'button:has-text("Submit application")',
  'button:has-text("Send Application")',
  'button:has-text("Submit")',
  'button:has-text("Apply Now")',
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Apply")',
];
let clicked = false;
for (const sel of submitSels) {
  try {
    const btn = page.locator(sel).first();
    if (await btn.count() === 0) continue;
    // A disabled control is not a submit path — clicking it does nothing and
    // reports success.
    const isDisabled = await btn.evaluate(el =>
      !!el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled')
    ).catch(() => false);
    if (isDisabled) continue;
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(rnd(350, 900));
      // hover before click: real pointer input precedes a real click
      await btn.hover().catch(() => {});
      await sleep(rnd(120, 380));
      await btn.click();
      clicked = true;
      break;
    }
  } catch {}
}
await page.waitForTimeout(4000);
const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
return { clicked, url: page.url(), bodyText };
`,
    timeout_sec: 30,
  })
  const result = (res.result as any) || { clicked: false, url: '', bodyText: '' }
  if (applicationId) {
    await persistLog(applicationId, result.clicked ? 'info' : 'warn',
      `clickSubmitButton: clicked=${result.clicked} | url=${(result.url || '').substring(0, 80)}`
    )
  }
  return result
}

// ─── actWithFallback: observe-then-act escalation (v3 Stagehand) ───
//
// observe() is side-effect-free and safe to retry across models.
// act() is called exactly once on the first successful plan — never retried.
async function actWithFallback(
  stagehand: any,
  models: ModelChoice[],
  instruction: string,
  applicationId: string | undefined
): Promise<{ ok: boolean; modelUsed: string; message: string }> {
  if (!stagehand) return { ok: false, modelUsed: "none", message: "Stagehand is not available" }
  if (models.length === 0) return { ok: false, modelUsed: "none", message: "No LLM model configured" }

  for (let mi = 0; mi < models.length; mi++) {
    const { stagehandModel, label } = models[mi]
    try {
      const observed = await stagehand.observe(instruction, { model: stagehandModel as any }) as any
      const actions: any[] = Array.isArray(observed) ? observed : (observed?.data ?? [])
      if (!actions.length) {
        if (applicationId) await persistLog(applicationId, "warn", `observe via ${label}: no actions found for "${instruction.slice(0, 60)}"`)
        continue
      }
      const res = await stagehand.act(actions[0], { model: stagehandModel as any }) as any
      const data = res?.data ?? res
      if (data?.success === false) throw new Error(data?.message || "act returned success=false")
      const detail = [data?.actionDescription, data?.message].filter(Boolean).join(" | ")
      return { ok: true, modelUsed: label, message: detail || "" }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isQuota = /402|payment required|quota|rate.?limit|429/i.test(msg)
      if (applicationId) await persistLog(applicationId, "warn", `observe/act via ${label} failed${isQuota ? " (quota/rate limit)" : ""}: ${msg.substring(0, 300)}`)
      if (isQuota || mi < models.length - 1) continue
      return { ok: false, modelUsed: label, message: msg }
    }
  }
  return { ok: false, modelUsed: "none", message: "all models exhausted" }
}

// ─── Main entry point ───
// ─── AX-tree form scan: cheaper and more exact than a vision pass ───
// Widgets with no backing <input> — Workday div-radios, Ashby aria-pressed
// toggles — are invisible to DOM traversal but are required to expose a correct
// role and name to assistive technology. Reading the accessibility tree gets
// them for the cost of one CDP call instead of a vision model call.
async function axScanForm(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  domInventory: InventoryItem[],
  applicationId?: string
): Promise<InventoryItem[]> {
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, {
      code: AX_SCAN_CODE,
      timeout_sec: 45,
    })
    const raw = (res.result as any) || {}
    const nodes = (raw.fields ?? []) as RawAxNode[]
    const merged = mergeAxFields(nodes, domInventory)
    if (applicationId) {
      await persistLog(
        applicationId,
        "info",
        `AX scan: ${nodes.length} interactive node(s) in the accessibility tree, ${merged.length} not already in the DOM inventory${
          merged.length ? `: ${merged.map((f) => f.label.slice(0, 30)).join(" | ")}` : ""
        }`
      )
    }
    return merged.map((f) => ({
      key: f.key,
      label: f.label,
      kind: f.kind,
      required: f.required,
      options: f.options,
      value: f.value,
      checked: f.checked,
    }))
  } catch (err) {
    // The AX pass is an optimisation. A failure here falls through to vision.
    if (applicationId) {
      await persistLog(applicationId, "warn", `AX scan failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
    }
    return []
  }
}

// ─── CAPTCHA: detect structurally, solve independently ───
// Keyword-matching agent chatter cannot see reCAPTCHA v3 or Turnstile, which
// render nothing and silently reject the POST — previously read as "submit
// clicked but not confirmed", sending the retry loop hunting for a field that
// was never missing.
async function detectCaptchaOnPage(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  applicationId?: string
): Promise<CaptchaDetection | null> {
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, {
      code: CAPTCHA_DETECT_CODE,
      timeout_sec: 20,
    })
    const d = (res.result as any) as CaptchaDetection | null
    if (!d?.type) return null
    // The Turnstile script can load before its widget mounts; one short retry
    // resolves the sitekey rather than reporting an unsolvable challenge.
    if (d.type === "turnstile_script_only") {
      await new Promise((r) => setTimeout(r, 3000))
      const again = await kernelClient.browsers.playwright.execute(sessionId, {
        code: CAPTCHA_DETECT_CODE,
        timeout_sec: 20,
      })
      const d2 = (again.result as any) as CaptchaDetection | null
      if (!d2?.type || d2.type === "turnstile_script_only") return null
      if (applicationId) await persistLog(applicationId, "info", `CAPTCHA detected on re-check: ${d2.type} (sitekey ${String(d2.sitekey).slice(0, 12)}…)`)
      return d2
    }
    if (applicationId) {
      await persistLog(applicationId, "info", `CAPTCHA detected: ${d.type}${d.sitekey ? ` (sitekey ${String(d.sitekey).slice(0, 12)}…)` : " — no sitekey found"}`)
    }
    return d
  } catch {
    return null
  }
}

// Solve via the external solver, then inject the token and let the page's own
// callback fire. Returns whether the challenge is believed cleared.
async function resolveCaptcha(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  detection: CaptchaDetection,
  solverKey: string,
  applicationId?: string
): Promise<{ cleared: boolean; reason: string }> {
  if (!isSolvable(detection)) {
    return { cleared: false, reason: `No solver path for ${detection.type}` }
  }
  if (!solverKey) {
    return { cleared: false, reason: "No CAPTCHA solver key configured — falling back to the vendor solver or a human" }
  }

  if (applicationId) await persistLog(applicationId, "info", `Submitting ${detection.type} to the solver...`)
  const solved = await solveCaptcha(solverKey, detection)
  if (!solved.solved || !solved.token) {
    if (applicationId) await persistLog(applicationId, "warn", `Solver did not return a token: ${solved.reason}`)
    return { cleared: false, reason: solved.reason }
  }

  try {
    await kernelClient.browsers.playwright.execute(sessionId, {
      code: buildInjectCode(detection.type, solved.token),
      timeout_sec: 20,
    })
  } catch (err) {
    return { cleared: false, reason: `Token injection failed: ${err instanceof Error ? err.message : String(err)}` }
  }

  // Injection is not proof. Re-detect: a cleared challenge stops advertising
  // itself, and a still-present one means the token was rejected or expired.
  await new Promise((r) => setTimeout(r, 2000))
  const still = await detectCaptchaOnPage(kernelClient, sessionId)
  const cleared = !still || still.type !== detection.type
  if (applicationId) {
    await persistLog(applicationId, cleared ? "info" : "warn",
      cleared ? `CAPTCHA cleared via solver (${detection.type})` : `Token injected but ${detection.type} is still present — likely expired or rejected`)
  }
  return { cleared, reason: cleared ? "Solved and injected" : "Challenge still present after injection" }
}

// ─── Page controls: the buttons a wizard step offers ───
// The wizard loop needs to know whether this page advances or submits, which
// means reading the actionable buttons rather than guessing from the portal.
async function readPageControls(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string
): Promise<{
  url: string
  controls: string[]
  /** Every actionable control, INCLUDING disabled ones. */
  allControls: Array<{ label: string; disabled: boolean }>
  bodyText: string
  hasForm: boolean
  tabCount: number
}> {
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
const info = await page.evaluate(() => {
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  // ─── Disabled controls are reported, not discarded ───
  // Greenhouse and Ashby grey out Submit until the form validates. Filtering
  // disabled buttons out here meant the wizard concluded "there is no final
  // action on this page" and stopped — one click short of submitting, with a
  // log line that read as though we were on the wrong page entirely. Reporting
  // them lets the caller say "Submit is there but disabled: keep fixing fields".
  const nodes = Array.from(document.querySelectorAll('button,input[type="submit"],input[type="button"],a[role="button"],[role="button"]'))
    .filter(isVisible);
  const seen = new Map();
  for (const el of nodes) {
    const label = (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
    if (!label || label.length > 60) continue;
    const disabled = !!el.disabled
      || el.getAttribute('aria-disabled') === 'true'
      || el.classList.contains('disabled');
    // An enabled instance of a label wins over a disabled one — some portals
    // render both a mobile and a desktop copy of the same button.
    if (!seen.has(label) || (seen.get(label) && !disabled)) seen.set(label, disabled);
  }
  const allControls = [...seen.entries()].map(([label, disabled]) => ({ label, disabled }));
  const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]),select,textarea'))
    .filter(isVisible).length;
  return {
    allControls,
    controls: allControls.filter(c => !c.disabled).map(c => c.label),
    bodyText: document.body.innerText.slice(0, 6000),
    hasForm: inputs > 0,
  };
});
const tabCount = page.context().pages().length;
return { url: page.url(), tabCount, ...info };
`,
      timeout_sec: 25,
    })
    const r = (res.result as any) || {}
    return {
      url: r.url || "",
      controls: r.controls || [],
      allControls: r.allControls || [],
      bodyText: r.bodyText || "",
      hasForm: !!r.hasForm,
      tabCount: r.tabCount ?? 1,
    }
  } catch {
    return { url: "", controls: [], allControls: [], bodyText: "", hasForm: false, tabCount: 1 }
  }
}

// Click a named advance control ("Next", "Save and Continue"). Never clicks a
// final action — that path goes through clickSubmitButton and its audit gate.
async function clickAdvanceControl(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  label: string,
  applicationId?: string
): Promise<boolean> {
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
const WANT = ${JSON.stringify(label)};
const clicked = await page.evaluate((want) => {
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  };
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const target = norm(want);
  const buttons = Array.from(document.querySelectorAll('button,input[type="submit"],input[type="button"],a[role="button"],[role="button"]'))
    .filter(isVisible)
    .filter(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true');
  const hit = buttons.find(el => norm(el.innerText || el.value || el.getAttribute('aria-label')) === target);
  if (!hit) return false;
  hit.scrollIntoView({ block: 'center' });
  hit.click();
  return true;
}, WANT);
await page.waitForTimeout(2500);
return { clicked };
`,
      timeout_sec: 30,
    })
    const ok = !!(res.result as any)?.clicked
    if (applicationId) {
      await persistLog(applicationId, ok ? "info" : "warn", `Wizard advance via "${label}": ${ok ? "clicked" : "control not found"}`)
    }
    return ok
  } catch {
    return false
  }
}

// ─── Popups and new tabs ───
// A login or apply click frequently opens a second tab, which the run — bound
// to pages()[0] — never sees. Switching to the newest page is what keeps the
// rest of the pipeline pointed at the form the user is actually filling.
async function switchToNewestTab(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  knownTabCount: number,
  applicationId?: string
): Promise<{ switched: boolean; url: string; tabCount: number }> {
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
const pages = page.context().pages();
if (pages.length <= ${knownTabCount}) {
  return { switched: false, url: page.url(), tabCount: pages.length };
}
const newest = pages[pages.length - 1];
await newest.bringToFront().catch(() => {});
try { await newest.waitForLoadState('domcontentloaded', { timeout: 8000 }); } catch {}
// Close the tabs we left behind so later scans can't pick the wrong one.
for (const p of pages.slice(0, -1)) {
  if (p !== newest) { try { await p.close(); } catch {} }
}
return { switched: true, url: newest.url(), tabCount: page.context().pages().length };
`,
      timeout_sec: 30,
    })
    const r = (res.result as any) || { switched: false, url: "", tabCount: knownTabCount }
    if (r.switched && applicationId) {
      await persistLog(applicationId, "info", `A new tab opened — switched to it: ${String(r.url).slice(0, 120)}`)
    }
    return r
  } catch {
    return { switched: false, url: "", tabCount: knownTabCount }
  }
}

/**
 * Two or three sentences for an email-only application.
 *
 * Kept deliberately short and factual. An email application is read by a person,
 * and the padded cover-letter register a model reaches for by default reads
 * worse than three direct sentences. Falls back to a plain, honest summary when
 * no model is reachable — an application that sends is worth more than one that
 * waits for a better opening line.
 */
async function buildEmailPitch(
  userData: any,
  chain: ModelChoice[],
  applicationId?: string
): Promise<string> {
  const skills = Array.isArray(userData.skills) ? userData.skills.slice(0, 8).join(", ") : (userData.skills || "")
  const fallback = [
    userData.experience ? String(userData.experience).slice(0, 300) : "",
    skills ? `Core skills: ${skills}.` : "",
    userData.location ? `Based in ${userData.location}.` : "",
  ].filter(Boolean).join(" ") || "My résumé is attached and covers my background in detail."

  try {
    const prompt = `Write 2-3 sentences of an email applying for "${userData.jobTitle || "this role"}"${
      userData.companyName ? ` at ${userData.companyName}` : ""
    }.

Background (use ONLY this — invent nothing):
- Experience: ${userData.experience || "not stated"}
- Skills: ${skills || "not stated"}
- Location: ${userData.location || "not stated"}

Rules: first person, specific, no filler openers, no "I am passionate about", no restating the job title back. Return the sentences only, no greeting and no sign-off.`
    const reply = await askModel(prompt, chain, applicationId)
    const text = (reply || "").replace(/\s+/g, " ").trim()
    if (text.length > 40 && text.length < 900) return text
  } catch {
    // Fall through to the deterministic summary.
  }
  return fallback
}

// ─── resolveEmbeddedForm: handle an ATS form embedded in a careers page ───
//
// A company careers page frequently renders the real Greenhouse/Lever/Ashby
// form inside an iframe. The old handling read the iframe's `src` and navigated
// the top-level page straight to it, which works but throws away the parent
// document — and with it any session or referrer state the embed was relying on.
// Worse, when the embed used a same-origin iframe with no `src` (Ashby and some
// Workday embeds build the frame's content in JS), there was nothing to read and
// the run stalled on a page it believed had no form.
//
// The VM has real Playwright, so the right move is to look at actual frames
// rather than parse attributes: if a child frame already contains the form
// fields, we drive it in place; only when it doesn't do we fall back to
// navigating to the frame URL.
async function resolveEmbeddedForm(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  applicationId?: string
): Promise<{ found: boolean; navigated: boolean; url: string }> {
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
const NOISE = /googleapis|google\\.com\\/recaptcha|doubleclick|googletagmanager|hotjar|segment|intercom|youtube|vimeo/i;
const ATS = /greenhouse|lever|ashby|boards\\.|grnhse|myworkdayjobs|icims|smartrecruiters|workable|jobvite|bamboohr/i;

// Does the top-level document already show a form? Then there is nothing to do.
const topFields = await page.evaluate(() => document.querySelectorAll(
  'input[type="text"],input[type="email"],input[type="tel"],textarea,select'
).length);
if (topFields >= 3) return { found: true, navigated: false, url: page.url(), where: 'top' };

// Real frame objects, not iframe attributes — this sees frames with no src.
const frames = page.frames().filter(f => f !== page.mainFrame());
let best = null;
for (const f of frames) {
  const url = f.url() || '';
  if (NOISE.test(url)) continue;
  let count = 0;
  try {
    count = await f.evaluate(() => document.querySelectorAll(
      'input[type="text"],input[type="email"],input[type="tel"],textarea,select'
    ).length);
  } catch { continue; }   // cross-origin frames refuse evaluate; handled below
  if (count >= 3 && (!best || count > best.count)) best = { url, count };
}

if (best) {
  // The frame is same-origin and already holds the form. Nothing to navigate:
  // the VM's selectors reach into it, and so does Stagehand's iframe-aware
  // observe. Report it so the caller can log which frame we are working in.
  return { found: true, navigated: false, url: best.url, where: 'frame', fields: best.count };
}

// No same-origin frame with fields. Fall back to the old behaviour: find an ATS
// iframe by URL and navigate the top-level page to it.
const src = await page.evaluate(() => {
  const noise = /googleapis|google\\.com\\/recaptcha|doubleclick|googletagmanager|hotjar|segment|intercom/i;
  const ats = /greenhouse|lever|ashby|boards\\.|grnhse|myworkdayjobs|icims|smartrecruiters|workable|jobvite|bamboohr/i;
  for (const el of document.querySelectorAll('iframe')) {
    const s = el.getAttribute('src') || '';
    if (!s || noise.test(s)) continue;
    if (ats.test(s)) return s;
  }
  return null;
});

if (!src) return { found: false, navigated: false, url: page.url(), where: 'none' };

const full = src.startsWith('http') ? src : (src.startsWith('//') ? 'https:' + src : new URL(src, page.url()).href);
await page.goto(full, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
return { found: true, navigated: true, url: full, where: 'navigated' };
`,
      timeout_sec: 60,
    })
    const r = (res.result as any) || { found: false, navigated: false, url: "" }
    if (applicationId) {
      await persistLog(
        applicationId,
        r.found ? "info" : "warn",
        r.where === "top"
          ? "Application form is on the top-level page — no embed to resolve"
          : r.where === "frame"
            ? `Application form is inside a same-origin frame (${r.fields} fields) — driving it in place: ${String(r.url).slice(0, 100)}`
            : r.where === "navigated"
              ? `Followed an embedded ATS iframe: ${String(r.url).slice(0, 100)}`
              : "No embedded application form found on this page"
      )
    }
    return { found: !!r.found, navigated: !!r.navigated, url: String(r.url || "") }
  } catch (err) {
    if (applicationId) {
      await persistLog(applicationId, "warn", `Embedded-form resolution failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    return { found: false, navigated: false, url: "" }
  }
}

// ─── runCodeMode: last-resort, model-authored driver for one control ───
//
// Reached only when the typed handler AND the option-choice retry have both
// failed on the same field. Everything about it is defensive: the program is
// screened before it runs, executed against one element rather than the
// document, and the page is fingerprinted either side so an accidental submit
// is detected rather than discovered later at the confirmation step.
//
// A dirty verdict is deliberately fatal to the run. If model code moved us off
// the page or collapsed the form, we do not know what was sent — and the only
// safe thing to do with an application in that state is stop and tell someone.
async function runCodeMode(
  kernelClient: InstanceType<typeof Kernel>,
  sessionId: string,
  fieldKey: string,
  label: string,
  value: string,
  kind: string,
  failureReason: string,
  models: ModelChoice[],
  applicationId?: string
): Promise<{ filled: boolean; reason: string; compromised: boolean }> {
  if (!CODE_MODE_ENABLED) {
    return { filled: false, reason: "code mode is disabled", compromised: false }
  }

  // 1. Mark the page and grab the control's markup for the prompt.
  const markCode = (attr: string) => `
const KEY = ${JSON.stringify(fieldKey)};
const mark = await page.evaluate((key) => {
  const pick = () => {
    if (key.startsWith('id:')) return document.getElementById(key.slice(3));
    if (key.startsWith('name:')) return document.querySelector('[name="' + CSS.escape(key.slice(5)) + '"]');
    if (key.startsWith('idx:')) {
      const all = Array.from(document.querySelectorAll('input,select,textarea,fieldset,[role="combobox"],[role="radiogroup"],[role="group"]'));
      return all[parseInt(key.slice(4), 10)] || null;
    }
    return null;
  };
  const el = pick();
  if (el) el.setAttribute(${JSON.stringify(attr)}, '1');
  const container = el ? (el.closest('[class*="field"],[class*="question"],fieldset,[role="group"]') || el.parentElement || el) : null;
  return {
    found: !!el,
    html: container ? container.outerHTML.slice(0, 4000) : '',
    formCount: document.querySelectorAll('form').length,
    fieldCount: document.querySelectorAll('input:not([type="hidden"]),select,textarea').length,
  };
}, KEY);
return { ...mark, url: page.url() };
`
  const TARGET_ATTR = "data-nq-code-target"
  let before: { url: string; formCount: number; fieldCount: number }
  let html = ""
  try {
    const res = await kernelClient.browsers.playwright.execute(sessionId, { code: markCode(TARGET_ATTR), timeout_sec: 30 })
    const r = (res.result as any) || {}
    if (!r.found) return { filled: false, reason: "control could not be located for code mode", compromised: false }
    html = r.html || ""
    before = { url: r.url || "", formCount: r.formCount ?? 0, fieldCount: r.fieldCount ?? 0 }
  } catch (err) {
    return { filled: false, reason: `code mode setup failed: ${err instanceof Error ? err.message : String(err)}`, compromised: false }
  }

  // 2. Ask for a program, and screen it before it goes anywhere near the page.
  const prompt = buildCodeModePrompt({ label, value, kind, failureReason, html })
  const reply = await askModel(prompt, models, applicationId)
  const program = parseCodeReply(reply)
  if (!program) {
    if (applicationId) await persistLog(applicationId, "warn", `Code mode: model returned no usable program for "${label.slice(0, 40)}"`)
    return { filled: false, reason: "model returned no usable program", compromised: false }
  }

  const screened = screenCode(program)
  if (!screened.allowed) {
    if (applicationId) {
      await persistLog(applicationId, "warn", `Code mode REFUSED for "${label.slice(0, 40)}": ${screened.reason}. Program was not executed.`)
    }
    return { filled: false, reason: `refused by the screen: ${screened.reason}`, compromised: false }
  }

  // 3. Run it against the marked element only, then re-read the page.
  try {
    const runRes = await kernelClient.browsers.playwright.execute(sessionId, {
      code: `
const out = await page.evaluate(async (src) => {
  const el = document.querySelector('[${TARGET_ATTR}="1"]');
  if (!el) return { filled: false, reason: 'target vanished' };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  try {
    const fn = new Function('el', 'sleep', 'return (async () => {' + src + '})()');
    const result = await fn(el, sleep);
    return result && typeof result === 'object' ? result : { filled: false, reason: 'program returned nothing' };
  } catch (e) {
    return { filled: false, reason: 'threw: ' + String(e && e.message || e) };
  }
}, ${JSON.stringify(program)});

const after = await page.evaluate(() => ({
  formCount: document.querySelectorAll('form').length,
  fieldCount: document.querySelectorAll('input:not([type="hidden"]),select,textarea').length,
}));
await page.evaluate((attr) => {
  document.querySelectorAll('[' + attr + ']').forEach(n => n.removeAttribute(attr));
}, ${JSON.stringify(TARGET_ATTR)});
return { out, after, url: page.url() };
`,
      timeout_sec: 45,
    })
    const r = (runRes.result as any) || {}
    const after = { url: r.url || "", formCount: r.after?.formCount ?? 0, fieldCount: r.after?.fieldCount ?? 0 }

    const verdict = verifyNoSideEffects(before, after)
    if (!verdict.clean) {
      if (applicationId) {
        await persistLog(applicationId, "error",
          `Code mode caused a side effect on "${label.slice(0, 40)}": ${verdict.reason}. Stopping the run — the application state is no longer known.`
        )
      }
      return { filled: false, reason: `unsafe side effect: ${verdict.reason}`, compromised: true }
    }

    const filled = !!r.out?.filled
    if (applicationId) {
      await persistLog(applicationId, filled ? "info" : "warn",
        `Code mode ${filled ? "filled" : "failed"} "${label.slice(0, 40)}"${r.out?.reason ? `: ${r.out.reason}` : ""}`
      )
    }
    return { filled, reason: String(r.out?.reason || (filled ? "filled by model-authored code" : "program reported failure")), compromised: false }
  } catch (err) {
    return { filled: false, reason: `code mode execution failed: ${err instanceof Error ? err.message : String(err)}`, compromised: false }
  }
}

export async function fillJobApplicationWithKernel(
  portalUrl: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string,
  userId?: string
): Promise<AutomationResponse> {
  const startTime = Date.now()

  cachedKernelApiKey = null
  cachedGeminiApiKey = null
  cachedOpenAiApiKey = null
  cachedOpenRouterApiKey = null
  cachedGroqApiKey = null
  cachedCaptchaSolverKey = null
  const rawKeys = await getKeys()
  const { apiKey, captchaSolverKey } = rawKeys

  if (!apiKey) return { success: false, error: "Kernel API key is not configured. Set it in Settings." }
  if (!rawKeys.openRouterKey && !rawKeys.geminiKey && !rawKeys.openAiKey && !rawKeys.groqKey) {
    return { success: false, error: "At least one LLM API key (Groq, OpenRouter, Gemini, or OpenAI) is required. Set it in Settings." }
  }

  // ── Validate the keys BEFORE spending a browser session on them ──
  //
  // A rejected key used to be discovered once per field, mid-run, as a silent
  // fall-through. Now it is one probe, up front, and a dead provider never
  // enters the chain — so no field pays for it and the reason is stated plainly
  // instead of being inferred from forty identical warnings.
  const { openRouterKey, geminiKey, openAiKey, groqKey, report: llmReport } = await healthyKeys(rawKeys, applicationId)
  // Load the free-tier catalogue once, so every later call already has its
  // fallbacks available without paying for a lookup mid-fill.
  if (openRouterKey) await ensureFreeModels(applicationId)
  if (!openRouterKey && !geminiKey && !openAiKey) {
    const msg = `Every configured LLM key was rejected — ${llmReport}. Custom questions and dropdown choices cannot be answered.`
    // KERNEL_ALLOW_NO_LLM lets a run proceed on its deterministic path alone —
    // profile fields, the shape-gated banks, consent boxes and schema-driven
    // choices all work without a model. Useful for verifying widget handling
    // while the keys are being sorted out; the questions that genuinely need a
    // model become visible blockers rather than silent blanks.
    if (process.env.KERNEL_ALLOW_NO_LLM !== "1") {
      if (applicationId) await persistLog(applicationId, "error", msg)
      return { success: false, error: msg }
    }
    if (applicationId) {
      await persistLog(applicationId, "warn", `${msg} Continuing on the deterministic path only (KERNEL_ALLOW_NO_LLM=1).`)
    }
  }

  const portal = detectPortal(portalUrl)
  const portalType = portal?.name || "Unknown"
  const targetUrl = portal?.getApplyUrl(portalUrl) || portalUrl
  const portalConfig = getPortalConfig(portalType)
  const WIZARD_MAX_STEPS = wizardStepsFor(portalType)

  console.log(`[Kernel] Starting for: ${userData.name} | Portal: ${portalType} | URL: ${targetUrl}`)
  if (applicationId) await persistLog(applicationId, "info", `Starting for ${userData.name || userData.firstName} | ${portalType} | URL: ${targetUrl}`)
  if (onStep) onStep({ status: "session_created", log: `Creating Kernel browser session for ${portalType}...` })

  let sessionId: string | undefined
  let replayId: string | undefined
  let profileSlot: ProfileSlot | null = null
  let pooled: PooledBrowser | null = null
  /** Set when we navigated ourselves rather than relying on the session start_url. */
  let alreadyNavigated = false
  // Evidence collected across the run, fed to diagnose() when it fails.
  const runErrors: string[] = []
  let lastBodyText = ""
  let lastValidationErrors: string[] = []
  let unsafeReason: string | null = null
  // Learned site knowledge injected into this run, scored by its outcome.
  let skillDomainName: string | null = null
  let usedSkillIds: string[] = []
  let loadedSkills: Array<{ content: string }> = []
  let skillGuidance = ""
  let stagehand: any = null
  let liveUrl: string | null = null
  let telemetryLogger: { stop: () => void } | null = null
  const kernelClient = new Kernel({ apiKey })

  // Structured run record. Null when there's no application row to write it to
  // (ad-hoc invocations); every call site below is therefore optional-chained.
  const run = applicationId ? makeRunTracker(applicationId) : null

  try {
    // ─── Persistent profile ───
    // A pool rather than one lock per user. The old single lock meant a second
    // concurrent run for the same candidate silently proceeded with
    // save_changes:false, throwing away every cookie and session it
    // established. Each pooled slot is independently locked and fully
    // writable, so parallel runs no longer degrade each other.
    run?.begin("session")
    let profileName: string | null = null
    let safeToWrite = false

    // Try the pool first. Greenhouse, Lever and Ashby serve a public form at a
    // direct URL and never ask the candidate to sign in, so nothing this
    // session learns needs to survive it — which is exactly the case a
    // read-only pooled browser fits.
    if (isPoolable(portalType)) {
      const poolLimit = await fetchConcurrencyLimit(kernelClient, PROFILE_POOL_SIZE_OVERRIDE)
      pooled = await acquirePooledBrowser(
        kernelClient,
        portalType,
        { size: poolLimit.limit, stealth: true, timeoutSeconds: portalConfig.timeout },
        applicationId ? (level, message) => persistLog(applicationId, level, message) : undefined
      )
    }

    // A pooled browser loads its profile read-only, so claiming a writable slot
    // for one would reserve capacity nothing can use. But when the pool was
    // unavailable we are back to a normal dedicated session, and that session
    // should get a profile like any other — silently running unprofiled here
    // would be an invisible downgrade.
    if (userId && !pooled) {
      // Pool size comes from the Kernel plan, not from a number we guessed.
      // Too high and sessions past the limit are rejected mid-dispatch; too low
      // and paid-for capacity sits idle. Neither failure is visible from the UI.
      const concurrency = await fetchConcurrencyLimit(kernelClient, PROFILE_POOL_SIZE_OVERRIDE)
      if (applicationId) await persistLog(applicationId, "info", `Concurrency: ${concurrency.reason}`)
      profileSlot = await acquireProfileSlot(
        supabase,
        userId,
        userData.name || userData.firstName || "user",
        concurrency.limit
      )
      if (profileSlot) {
        try {
          await kernelClient.profiles.create({ name: profileSlot.profileName })
        } catch (err) {
          if (!(err instanceof ConflictError)) throw err
        }
        profileName = profileSlot.profileName
        safeToWrite = profileSlot.safeToWrite
        if (applicationId) await persistLog(applicationId, "info", `Using profile slot ${profileSlot.slot}: ${profileName} | save_changes: ${safeToWrite}`)
      } else {
        // Whole pool busy. Running unprofiled loses logged-in state that some
        // portals need, so this is worth saying plainly rather than hiding.
        const legacy = await getOrCreateKernelProfile(userId, userData.name || userData.firstName || "user", kernelClient)
        if (legacy) {
          profileName = legacy.profileName
          safeToWrite = legacy.safeToWrite
        }
        if (applicationId) {
          await persistLog(applicationId, "warn", `Every profile slot is busy for this user — falling back to the shared profile with save_changes: ${safeToWrite}`)
        }
      }
    }

    // ─── Create browser session ───
    // start_url navigates during startup — saves one page.goto() round-trip after connect
    // save_changes: true only when profile is safe to write (no concurrent sessions on same profile)
    // Q2: captcha category added explicitly — required to receive captcha_solve_result events
    // Q3: residential only for LinkedIn (behavioral fingerprinting); Workday/iCIMS use ISP (better for reCAPTCHA)
    // Q10: gpu:true for Workday/LinkedIn — real GPU rendering defeats canvas/WebGL fingerprinting
    const sessionParams: any = {
      stealth: true,
      timeout_seconds: portalConfig.timeout,
      start_url: targetUrl,
      // Full micro-visibility: interaction (clicks/keystrokes), console, network, page, and
      // (opt-in) screenshot — a base64 PNG of what the agent sees. See CAPTURE_SCREENSHOTS.
      telemetry: {
        enabled: true,
        categories: ["captcha", "page", "console", "system", "connection", "interaction", "network", ...(CAPTURE_SCREENSHOTS ? ["screenshot"] : [])],
        browser: {
          page: { enabled: true },
          console: { enabled: true },
          network: { enabled: true },
          interaction: { enabled: true },
          ...(CAPTURE_SCREENSHOTS ? { screenshot: { enabled: true } } : {}),
        },
      },
    }
    if (profileName) {
      sessionParams.profile = { name: profileName, save_changes: safeToWrite }
    }
    if (portalConfig.residential) {
      sessionParams.proxy = { type: "residential", config: { country: "US" } }
    }
    if (portalConfig.gpu) {
      sessionParams.gpu = true
    }

    // ─── Get a browser: warm from the pool, or cold and dedicated ───
    //
    // Greenhouse, Lever and Ashby serve a public form at a direct URL and never
    // ask the candidate to sign in, so nothing this session learns needs to
    // survive it — which is exactly the case a read-only pooled browser fits.
    // Everything else keeps a dedicated session with a writable profile.
    let cdpWsUrl: string
    if (pooled) {
      sessionId = pooled.sessionId
      cdpWsUrl = pooled.cdpWsUrl
      liveUrl = pooled.liveViewUrl
      // A warm browser is wherever the last run left it, so unlike a dedicated
      // session created with start_url, this one has to be navigated.
      await kernelClient.browsers.playwright.execute(sessionId, {
        code: `await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: 'domcontentloaded' }); return { url: page.url() };`,
        timeout_sec: 60,
      })
      // We awaited the navigation, so there is nothing for the telemetry-based
      // settle wait below to wait for.
      alreadyNavigated = true
    } else {
      const kernelBrowser = await kernelClient.browsers.create(sessionParams)
      sessionId = kernelBrowser.session_id
      cdpWsUrl = kernelBrowser.cdp_ws_url
      liveUrl = kernelBrowser.browser_live_view_url || null
    }

    console.log(`[Kernel] Session: ${sessionId} | Live: ${liveUrl} | Pooled: ${!!pooled} | Proxy: ${portalConfig.residential ? "residential" : "ISP/stealth"} | GPU: ${portalConfig.gpu}`)
    if (applicationId) {
      await persistLog(applicationId, "info", `Session ${sessionId}${pooled ? " (warm, from pool)" : ""}. Live: ${liveUrl}. Proxy: ${portalConfig.residential ? "residential" : "ISP/stealth"}. GPU: ${portalConfig.gpu}. save_changes: ${safeToWrite}`)
      if (liveUrl) await supabase.from("live_application_queue").update({ live_url: liveUrl }).eq("id", applicationId)
    }
    if (onStep) onStep({ status: "in_progress", log: `Session live: ${liveUrl}`, liveUrl })
    run?.succeed(
      "session",
      pooled
        ? "Warm browser from the pool — no cold start"
        : `${portalConfig.residential ? "Residential" : "ISP/stealth"} proxy${portalConfig.gpu ? " · GPU" : ""}${profileName ? " · persistent profile" : ""}`
    )

    // ─── Start replay ───
    try {
      const replay = await kernelClient.browsers.replays.start(sessionId)
      replayId = replay.replay_id
    } catch {}

    // ─── Start background telemetry stream logger ───
    // Runs non-blocking. Logs every click, navigation, error, CAPTCHA event to DB.
    // Q9: onFatalError aborts the session immediately on service_crashed / system_oom_kill.
    // Q6: onNavigationSettled resolves the start_url wait promise (replaces waitForTimeout).
    let captchaSolvedResolve: (() => void) | null = null
    let fatalErrorReject: ((reason: Error) => void) | null = null
    let navigationSettledResolve: (() => void) | null = null
    const captchaSolvedPromise = new Promise<void>(resolve => { captchaSolvedResolve = resolve })
    const fatalErrorPromise = new Promise<never>((_, reject) => { fatalErrorReject = reject })
    const navigationSettledPromise = new Promise<void>(resolve => { navigationSettledResolve = resolve })
    if (applicationId) {
      telemetryLogger = startTelemetryLogger(
        kernelClient, sessionId, applicationId,
        () => { captchaSolvedResolve?.() },
        (reason) => { fatalErrorReject?.(new Error(`[Kernel] Fatal browser event: ${reason}`)) },
        () => { navigationSettledResolve?.() },
        (url) => { run?.screenshot(url) }
      )
    } else {
      // No applicationId — still need to resolve navigation promise after a fallback timeout
      setTimeout(() => navigationSettledResolve?.(), 3000)
    }

    // ─── Init Stagehand v3 (LOCAL mode, CDP to the live Kernel session) ───
    // v3 injects helpers via Page.addScriptToEvaluateOnNewDocument (inline JS),
    // which works over any remote CDP connection. v4 requires loading a Chrome
    // extension from the local filesystem — incompatible with Kernel's remote sessions.
    const _shChain = buildModelChain(false, { openRouterKey, geminiKey, openAiKey, groqKey })
    const captchaOtpChoice = openRouterKey ? _shChain[0] : (_shChain.find(c => !c.label.startsWith("openrouter/")) ?? _shChain[0])
    if (captchaOtpChoice) {
      const { Stagehand } = await import("@browserbasehq/stagehand")
      stagehand = new Stagehand({
        env: "LOCAL",
        localBrowserLaunchOptions: { cdpUrl: cdpWsUrl } as any,
        model: captchaOtpChoice.stagehandModel as any,
        apiKey: captchaOtpChoice.apiKey,
        verbose: MICRO_LOGS ? 2 : 1,
        domSettleTimeout: 30_000,
        logger: (line: any) => {
          if (!MICRO_LOGS || !applicationId) return
          if ((line?.level ?? 1) >= 2) return
          try {
            const aux = line?.auxiliary
              ? " " + Object.entries(line.auxiliary).map(([k, v]: any) => `${k}=${String(v?.value ?? "").slice(0, 140)}`).join(" ")
              : ""
            void persistLog(applicationId, line?.level === 0 ? "warn" : "info", `[SH:${line?.category || "?"}] ${line?.message || ""}${aux}`.slice(0, 900))
          } catch {}
        },
      } as any)
      await stagehand.init()
      if (applicationId) await persistLog(applicationId, "info", `Stagehand v3 connected · model chain: ${_shChain.map(m => m.label).join(" → ")}`)
    }

    // Q6: Wait for page_navigation_settled telemetry event instead of a fixed timeout.
    // Falls back to 5s timeout if the event never fires (e.g. start_url failed silently).
    if (onStep) onStep({ step: 1, status: "in_progress", log: `Waiting for ${targetUrl} to settle...`, liveUrl })
    run?.begin("navigate")
    if (!alreadyNavigated) {
      await Promise.race([
        navigationSettledPromise,
        new Promise<void>(r => setTimeout(r, 5000)),
        fatalErrorPromise,
      ])
    }
    if (applicationId) await persistLog(applicationId, "info", `start_url navigation settled: ${targetUrl}`)
    if (onStep) onStep({ step: 1, status: "in_progress", log: `Page settled: ${targetUrl}`, liveUrl })
    run?.succeed("navigate", `${portalType} · ${targetUrl.slice(0, 90)}`)

    // ─── iframe handling ───
    const isDirectBoardUrl = /boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com/.test(targetUrl)
    if (isDirectBoardUrl) {
      // Already on a dedicated apply URL? Then there's no Apply button to click.
      const isOnApplyUrl = /jobs\.lever\.co.*\/apply/.test(targetUrl) || /ashbyhq\.com.*\/application/i.test(targetUrl)
      if (!isOnApplyUrl) {
        await ensureApplyFormOpen(kernelClient, sessionId, applicationId)
      }
      // Confirm a form actually materialized. Landing on a description page with
      // no fields previously sailed through as "0 unfilled → all required fields
      // filled", which then read as success right up to the submit gate.
      const formCheck = await waitForApplicationForm(kernelClient, sessionId, applicationId)
      if (!formCheck.hasForm) {
        // One more attempt via the Apply button, in case the first pass was too early.
        await ensureApplyFormOpen(kernelClient, sessionId, applicationId)
        await waitForApplicationForm(kernelClient, sessionId, applicationId)
      }
    } else {
      // A company careers page that embeds an ATS. Click Apply, then deal with
      // the iframe.
      await ensureApplyFormOpen(kernelClient, sessionId, applicationId)
      const embed = await resolveEmbeddedForm(kernelClient, sessionId, applicationId)
      if (embed.navigated && applicationId) {
        await persistLog(applicationId, "info", `Followed the embedded application form to ${embed.url}`)
      }
      await waitForApplicationForm(kernelClient, sessionId, applicationId)
    }

    const modelChain = buildModelChain(portalConfig.cua, { openRouterKey, geminiKey, openAiKey, groqKey })
    if (applicationId) await persistLog(applicationId, 'info', `LLM model chain: ${modelChain.map(m => m.label).join(' → ') || 'NONE'}`)

    // ─── Gate the landed page before anything is filled ───
    //
    // `waitForApplicationForm` proves a form EXISTS. It cannot tell an
    // application form from a contractor-marketplace onboarding, a talent-
    // network signup, or a flow demanding a selfie and a government ID — those
    // all render inputs, so they all used to sail straight through and get
    // filled in a real person's name.
    //
    // Runs post-navigation and pre-fill: the session is already paid for, but
    // the inventory scan, the LLM plan, the fill loop and the submit are all
    // still ahead, and that is what this saves.
    {
      // A popup opened during the Apply click would otherwise be invisible —
      // the run is bound to pages()[0].
      const landed = await readPageControls(kernelClient, sessionId)
      if (landed.tabCount > 1) {
        await switchToNewestTab(kernelClient, sessionId, 1, applicationId)
      }
      const current = landed.tabCount > 1 ? await readPageControls(kernelClient, sessionId) : landed
      lastBodyText = current.bodyText

      const verdict = evaluateUnsafePage(current.url || targetUrl, current.bodyText)
      if (verdict.blocked) {
        unsafeReason = verdict.reason
        if (applicationId) {
          await persistLog(applicationId, "error", `Pre-fill gate [${verdict.kind}]: ${verdict.reason} (${verdict.signal})`)
        }
        if (onStep) onStep({ status: "error", log: verdict.reason!, liveUrl })
        run?.fail("navigate", verdict.reason!)
        run?.skip("prefill", "Blocked before any field was touched")
        run?.skip("submit", "Blocked before any field was touched")
        const d = diagnose({ unsafePage: verdict.reason, finalUrl: current.url })
        if (applicationId) {
          try {
            await supabase.from("live_application_queue").update({
              failure_class: d.failureClass,
              failure_cause: d.rootCause,
              failure_action: d.suggestedAction,
              failure_permanent: d.permanent,
              failure_portal_fault: d.portalFault,
            }).eq("id", applicationId)
          } catch {}
        }
        return { success: false, error: verdict.reason!, steps: 0, recordingUrl: liveUrl, taskId: sessionId, failure: d }
      }

      // ── Email-only postings ──
      // A posting with no form that directs applications to an address is a
      // different shape, not a broken one. It used to reach the submit gate,
      // find nothing to submit, and be recorded as a failure.
      const emailTarget = detectEmailApply(current.bodyText, current.hasForm)
      if (emailTarget) {
        if (applicationId) {
          await persistLog(applicationId, "info", `No application form — the posting directs applications to ${emailTarget.address} ("${emailTarget.evidence}")`)
        }
        if (onStep) onStep({ status: "in_progress", log: `Email-only posting — sending the application to ${emailTarget.address}`, liveUrl })
        const pitch = await buildEmailPitch(userData, modelChain, applicationId)
        const sent = await sendApplicationEmail({
          to: emailTarget.address,
          candidateName: userData.name || `${userData.firstName || ""} ${userData.lastName || ""}`.trim(),
          candidateEmail: userData.email || "",
          jobTitle: userData.jobTitle || "the role",
          companyName: userData.companyName || "",
          pitch,
          resumeUrl: userData.resume || null,
        })
        if (applicationId) await persistLog(applicationId, sent.sent ? "info" : "error", sent.reason)
        run?.succeed("navigate", "Email-only posting")
        if (sent.sent) {
          run?.succeed("submit", `Emailed to ${sent.address}`)
          return { success: true, result: `Application emailed to ${sent.address}`, steps: 1, recordingUrl: liveUrl, taskId: sessionId }
        }
        run?.fail("submit", sent.reason)
        return { success: false, error: sent.reason, steps: 0, recordingUrl: liveUrl, taskId: sessionId }
      }
    }

    // ─── Learned site knowledge ───
    // What previous runs discovered about THIS domain, scored and injected as
    // hints. Retired skills (score ≤ -3) are excluded — a site that changed
    // should stop being described by what it used to do.
    skillDomainName = skillDomain(targetUrl)
    if (skillDomainName) {
      const loaded = await loadSkillGuidance(supabase, skillDomainName)
      skillGuidance = loaded.guidance
      usedSkillIds = loaded.usedIds
      loadedSkills = loaded.skills
      if (applicationId && loaded.skills.length) {
        await persistLog(applicationId, "info",
          `${loaded.skills.length} learned hint(s) for ${skillDomainName}: ${loaded.skills.map(sk => sk.content.slice(0, 90)).join(" | ")}`
        )
      }
    }

    // ─── Download resume (kept in memory; uploaded to the form via the Stagehand page) ───
    // Each step is validated + logged so a failure is diagnosable from application_logs:
    //   1. resume URL present?  2. download returned real bytes?  3. (later) attached to input?
    let resumeFileName: string | null = null
    let resumeBuffer: Buffer | null = null
    let resumeMimeType = "application/pdf"
    if (!userData.resume) {
      if (applicationId) await persistLog(applicationId, "warn", "No resume URL provided on this application — resume upload will be skipped and submit blocked if the form requires one.")
      run?.skip("resume_download", "No résumé URL on this application")
      run?.skip("resume_upload", "No résumé to attach")
    } else {
      run?.begin("resume_download")
      if (applicationId) await persistLog(applicationId, "info", `Downloading resume: ${String(userData.resume).substring(0, 120)}`)
      try {
        const dl = await axios.get(userData.resume, { responseType: "arraybuffer", timeout: 30000 })
        const buf = Buffer.from(dl.data)
        const contentType = String(dl.headers?.["content-type"] || "")

        // Validate: an HTML/JSON body or a tiny buffer means the URL 404'd or returned an error page.
        if (buf.length < 1024 || /text\/html|application\/json/i.test(contentType)) {
          if (applicationId) await persistLog(applicationId, "error", `Resume download looks invalid: ${buf.length} bytes, content-type="${contentType}". Check the resume URL (likely 404 / wrong storage path).`)
          run?.fail("resume_download", `Invalid file: ${buf.length} bytes, content-type "${contentType || "unknown"}" — the résumé URL likely 404'd`)
        } else {
          resumeBuffer = buf
          resumeFileName = (userData.resume.split("/").pop() || "resume.pdf").split("?")[0]
          if (contentType) resumeMimeType = contentType
          if (applicationId) await persistLog(applicationId, "info", `Resume downloaded: ${buf.length} bytes, ${contentType || "unknown type"} → will attach via page`)
          run?.succeed("resume_download", `${resumeFileName} · ${Math.round(buf.length / 1024)} KB`)
        }
      } catch (err) {
        console.log("[Kernel] Resume download failed:", err instanceof Error ? err.message : "")
        if (applicationId) await persistLog(applicationId, "error", `Resume download failed: ${err instanceof Error ? err.message : String(err)}`)
        run?.fail("resume_download", err instanceof Error ? err.message : String(err))
      }
    }

    // ─── PHASE 1: In-VM Playwright pre-fill (no AI, no CDP overhead) ───
    if (onStep) onStep({ step: 2, status: "in_progress", log: "Phase 1: Pre-filling deterministic fields in-VM...", liveUrl })
    if (applicationId) await persistLog(applicationId, "info", "Phase 1: In-VM pre-fill started")
    run?.begin("prefill")

    let preFillResults: any = {}
    try {
      const preFillRes = await kernelClient.browsers.playwright.execute(sessionId, {
        code: buildPreFillCode(userData, resumeFileName, portalType),
        timeout_sec: 120,
      })
      preFillResults = (preFillRes.result as any) || {}
      const filled = Object.entries(preFillResults).filter(([, v]) => v).map(([k]) => k).join(", ")
      console.log("[Kernel] Pre-fill results:", preFillResults)
      if (applicationId) {
        await persistLog(applicationId, "info", `Phase 1 done: ${filled || "nothing filled"}`)
        if (preFillRes.stdout) await persistLog(applicationId, "info", `[playwright.execute stdout] ${preFillRes.stdout.substring(0, 500)}`)
        if (preFillRes.stderr) await persistLog(applicationId, "warn", `[playwright.execute stderr] ${preFillRes.stderr.substring(0, 500)}`)
        if (!preFillRes.success && preFillRes.error) await persistLog(applicationId, "error", `[playwright.execute error] ${preFillRes.error}`)
      }
      if (onStep) onStep({ step: 2, status: "in_progress", log: `Phase 1 done: filled ${filled || "nothing"}`, liveUrl })
      const filledCount = Object.values(preFillResults).filter(Boolean).length
      run?.succeed(
        "prefill",
        filledCount > 0
          ? `${filledCount} field${filledCount === 1 ? "" : "s"} filled without AI: ${filled}`
          : "No fields matched deterministically — all deferred to AI"
      )
    } catch (err) {
      const { level, message } = classifyError(err)
      console.log("[Kernel] Phase 1 failed (non-fatal):", message)
      if (applicationId) await persistLog(applicationId, level, `Phase 1 failed: ${message}`)
      run?.fail("prefill", message)
    }

    // ─── Phase 1b: Country code hard gate + resume upload with 3-method fallback ───
    // Claude: phone digits filled but flag not clicked is the #1 silent failure.
    // Run selectCountryCodeInPage AFTER pre-fill regardless of whether pre-fill reported phone success.
    if (userData.phone) {
      const phoneCountry = resolvePhoneCountry(userData)
      const ccResult = await selectCountryCodeInPage(kernelClient, sessionId, phoneCountry, applicationId)
      if (ccResult.selected) {
        preFillResults.phone = true
      } else {
        // ── No separate country control on this form ──
        //
        // The pre-fill strips the dial code unconditionally, on the assumption
        // that a country picker will supply it. When there is no picker (Lever
        // renders a plain `<input name="phone">`), that assumption silently
        // removes the +91 and the employer receives a 10-digit number with no
        // country. Put it back.
        const intl = phoneCountry.dial + " " + String(userData.phone).replace(/\D/g, "").replace(new RegExp("^" + phoneCountry.dial.replace(/\D/g, "")), "")
        const restored = await kernelClient.browsers.playwright.execute(sessionId, {
          code: `
const WANT = ${JSON.stringify(intl)};
return await page.evaluate((want) => {
  const el = document.querySelector('input[type="tel"],input[name*="phone" i],input[id*="phone" i],input[autocomplete="tel"]');
  if (!el) return { done: false, reason: 'no-phone-input' };
  const cur = (el.value || '').trim();
  if (!cur || cur === want) return { done: cur === want, reason: cur ? 'already-international' : 'empty' };
  // Only restore when what is there looks like a bare national number.
  if (/^\\+/.test(cur)) return { done: true, reason: 'already-has-dial-code' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(el, want); else el.value = want;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { done: (el.value || '').trim() === want, reason: 'restored-dial-code' };
}, WANT);
`,
          timeout_sec: 15,
        }).catch(() => null)
        const r = (restored?.result as any) || {}
        if (applicationId) {
          await persistLog(
            applicationId,
            "info",
            `No country selector on this form — phone left as ${r.done ? intl : "the pre-filled value"} (${r.reason || "no phone input found"})`
          )
        }
        if (r.done) preFillResults.phone = true
      }
    }

    // Resume upload (page-side buffer over CDP — Kernel-recommended). Verifies it registered.
    if (resumeBuffer && resumeFileName) {
      if (onStep) onStep({ step: 2, status: "in_progress", log: "Uploading resume to the form...", liveUrl })
      run?.begin("resume_upload")
      // One attach path, in the VM, from the bytes we already downloaded and
      // validated. The old two-tier arrangement re-fetched the résumé URL from
      // inside the VM first — which could 404 or rate-limit independently of the
      // copy we were holding, and whose only fallback was a CDP page proxy that
      // lacked half the Playwright API it was calling.
      const uploadResult = await uploadResumeFromBuffer(kernelClient, sessionId, resumeBuffer, resumeFileName, resumeMimeType, applicationId)
      preFillResults.resume = uploadResult.uploaded
      if (uploadResult.uploaded) {
        if (onStep) onStep({ step: 2, status: "in_progress", log: `Resume confirmed via ${uploadResult.method}`, liveUrl })
        run?.succeed("resume_upload", `Attached via ${uploadResult.method}`)
      } else {
        if (applicationId) await persistLog(applicationId, "warn", "Resume upload failed. Agent will attempt upload during gap-fill.")
        // Not terminal: the submit gate retries the upload before giving up.
        run?.fail("resume_upload", "Attach did not register — will retry before submit")
      }
    }

    // ─── PHASE 1c: Form inventory scan, per wizard step ───
    // Scans ALL visible form controls — required AND optional — to build a fixed
    // checklist for the CURRENT page. The fill loop works against this list;
    // nothing is re-discovered mid-page.
    //
    // Three scans, cheapest first, each only paying for what the last missed:
    //   1. DOM traversal            — free, catches standard controls
    //   2. accessibility tree       — one CDP call, catches div-radios and
    //                                 aria toggles with no backing <input>
    //   3. vision                   — a model call, and now only a fallback for
    //                                 forms that expose almost no semantics
    let formInventory: InventoryItem[] = []

    // ─── The ATS's own description of its form ───
    //
    // Greenhouse publishes every question, its exact type, its exact `required`
    // flag and its exact allowed options as public JSON. Scanning the DOM to
    // rediscover that is guesswork: labels get truncated at 120 characters, a
    // closed dropdown exposes no options at all, and `required` is inferred from
    // a red asterisk that several portals draw in CSS. One free HTTP call
    // replaces all of it, and the join is on the provider's own field name
    // (`question_62720861` is both the API name and the DOM id) so no fuzzy text
    // matching is involved.
    //
    // Best-effort throughout: any failure leaves the DOM scan exactly as it was.
    let atsSchema: AtsSchema | null = null
    try {
      atsSchema = await fetchAtsSchema(portalType, targetUrl)
      if (atsSchema?.jobClosed) {
        if (applicationId) await persistLog(applicationId, "error", "The ATS reports this posting no longer exists.")
      } else if (atsSchema && applicationId) {
        const req = atsSchema.fields.filter(f => f.required).length
        await persistLog(applicationId, "info",
          `${portalType} schema: ${atsSchema.fields.length} questions (${req} required) fetched from the ATS API — labels, types and options are authoritative`
        )
      }
    } catch {
      // A schema is an optimisation, never a dependency.
    }

    const scanCurrentPage = async (stepLabel: string): Promise<InventoryItem[]> => {
      if (onStep) onStep({ step: 2, status: "in_progress", log: `Scanning form inventory (${stepLabel})...`, liveUrl })
      const dom = await scanFormInventory(kernelClient, sessionId as string, applicationId)

      const axFields = await axScanForm(kernelClient, sessionId as string, dom, applicationId)
      let combined: InventoryItem[] = [...dom, ...axFields]

      // Overlay the schema BEFORE deciding whether vision is needed — a form the
      // ATS has fully described never needs a vision pass.
      if (atsSchema && !atsSchema.jobClosed && atsSchema.fields.length > 0) {
        const { items, unmatchedRequired } = applySchema(combined as any, atsSchema)
        combined = items as InventoryItem[]
        const enriched = combined.filter((i: any) => i.schemaName).length
        if (applicationId) {
          await persistLog(applicationId, "info",
            `Schema applied (${stepLabel}): ${enriched}/${combined.length} controls matched an ATS question` +
            (unmatchedRequired.length ? ` | ${unmatchedRequired.length} required question(s) not on this page: ${unmatchedRequired.map(f => f.label.slice(0, 35)).join(" | ")}` : "")
          )
        }
      }

      const requiredCount = combined.filter((i) => i.required).length
      const schemaCovered = combined.filter((i: any) => i.schemaName).length > 0
      if (!schemaCovered && needsVisionFallback(dom.length, axFields.length, requiredCount)) {
        // Tier 3: vision. Only when everything cheaper still leaves the form
        // unexplained — a canvas-drawn or fully custom widget set.
        const stillThin = needsVisionFallback(combined.length, 0, combined.filter(i => i.required).length)
        if (stillThin) {
          const visionFields = await visionScanForm(
            kernelClient, sessionId as string, combined,
            openRouterKey, geminiKey, openAiKey, applicationId
          )
          if (visionFields.length > 0) {
            combined.push(...visionFields)
            if (applicationId) {
              await persistLog(applicationId, "info",
                `Vision added ${visionFields.length} field(s) nothing else found: ${visionFields.map(f => f.label.slice(0, 30)).join(" | ")}`
              )
            }
          }
        }
      }

      if (applicationId) {
        await persistLog(applicationId, "info",
          `Combined inventory (${stepLabel}): ${combined.length} fields (${combined.filter(i => i.required).length} required, ${combined.filter(i => !i.required).length} optional)`
        )
      }
      return combined
    }

    /**
     * Settle the fields Phase 1's deterministic pre-fill already handled.
     *
     * Crucially this VERIFIES rather than assumes. The old version matched the
     * label against a regex and marked the field done because Phase 1 had
     * *reported* filling something of that shape — so a pre-fill that silently
     * failed left a field marked complete and empty, which the submit gate then
     * rejected for reasons nothing explained. Each candidate is now read back
     * off the DOM before it is settled.
     *
     * Only meaningful on the first page: Phase 1 runs once, against whatever
     * form was on screen at the time.
     */
    const preMarkPhase1 = async (inventory: InventoryItem[]) => {
      const candidates = inventory.filter((item) => {
        const l = item.label.toLowerCase()
        return (
          (preFillResults.firstName && /first.?name|given name/i.test(l)) ||
          (preFillResults.lastName && /last.?name|surname|family name/i.test(l)) ||
          (preFillResults.fullName && /^full name$|^name$|legal name/i.test(l)) ||
          (preFillResults.email && /e-?mail/i.test(l)) ||
          (preFillResults.phone && /phone|mobile|contact number/i.test(l)) ||
          (preFillResults.linkedin && /linkedin/i.test(l)) ||
          (preFillResults.portfolio && /portfolio|github|personal site/i.test(l)) ||
          (preFillResults.resume && /resume|cv/i.test(l)) ||
          (preFillResults.consent && /agree|consent|terms|certif/i.test(l)) ||
          (preFillResults.workAuth && /legally authori|authori[sz]ed to work/i.test(l)) ||
          (preFillResults.sponsorship && /sponsor|require.*visa/i.test(l)) ||
          (preFillResults.source && /how did you hear|source|referral/i.test(l)) ||
          (preFillResults.disabilityStatus && /disab/i.test(l)) ||
          (preFillResults.veteranStatus && /veteran|military/i.test(l))
        )
      })

      let settled = 0
      for (const item of candidates) {
        if (await verifyFieldFilled(kernelClient, sessionId as string, item.key)) {
          ledger.settle(item.key)
          settled++
        }
      }
      if (applicationId) {
        await persistLog(applicationId, "info",
          `Phase 1 verification: ${settled}/${candidates.length} pre-filled field(s) confirmed on the page` +
          (settled < candidates.length ? ` — ${candidates.length - settled} reported filled but read back empty, so they stay on the work list` : "")
        )
      }
    }

    // ─── PHASE 2: Build fill plan then execute it ───
    // All answer resolution happens here, before the browser is touched again.
    // The fill loop below is pure execution — no reasoning, no LLM calls mid-fill.
    if (onStep) onStep({ step: 3, status: 'in_progress', log: 'Building fill plan...', liveUrl })
    if (applicationId) await persistLog(applicationId, 'info', `Phase 2: building fill plan | ${portalType}`)
    run?.begin('ai_fill')

    let totalSteps = 0
    let allAgentText = ''
    /** Set when model-authored code did something we cannot account for. */
    let codeModeCompromised: string | null = null

    const bank = userId ? await loadAnswerBank(supabase, userId, userData as any) : []

    /**
     * A compact factual summary of the candidate, handed to the model with every
     * option choice.
     *
     * Without it the model was choosing blind. "Have you professionally used SQL
     * to query large datasets?" is answerable only from the candidate's actual
     * skills and history, and with no background in the prompt the model was
     * guessing — which is unreliable, and on a skills question it is a claim
     * made in someone's name that nothing supports.
     */
    const candidateBackground = [
      userData.headline ? `Headline: ${userData.headline}` : "",
      userData.experienceLevel || userData.yearsOfExperience
        ? `Experience level: ${userData.experienceLevel || userData.yearsOfExperience}`
        : "",
      Array.isArray(userData.skills) && userData.skills.length
        ? `Skills: ${userData.skills.join(", ")}`
        : userData.skills ? `Skills: ${userData.skills}` : "",
      userData.experience ? `Work history:\n${userData.experience}` : "",
      userData.education ? `Education:\n${userData.education}` : "",
      userData.certifications ? `Certifications: ${userData.certifications}` : "",
      userData.location ? `Located in: ${userData.location}` : "",
      userData.bio ? `About: ${userData.bio}` : "",
    ].filter(Boolean).join("\n")

    // Scope context for bank recall: an employer-scoped answer ("why do you
    // want to work here?") must never be reused for a different company.
    const scopeContext = {
      employer: userData.companyName || null,
      ats: portalType || null,
    }

    // Accumulated across every wizard step, so the DB row reflects the whole
    // application rather than only its last page.
    const sensitiveAcrossSteps = new Set<string>()
    const reviewAcrossSteps = new Set<string>()
    let llmAnsweredTotal = 0

    // ─── The ledger: one answer per question, one settle per field ───
    //
    // Replaces four loose Maps and Sets that used to track progress
    // independently and disagree with each other. It guarantees three things
    // the old arrangement could not:
    //
    //   · an answer is computed ONCE per question and reused verbatim wherever
    //     that question appears again, so a re-ask after a validation bounce
    //     cannot produce different text than what we already submitted
    //   · a field is settled exactly once and is never re-queued, so the loop
    //     cannot clear and retype a field that was already correct
    //   · "we gave up on this" is a distinct, visible state from "this is done"
    const ledger = new AnswerLedger(3)

    /**
     * Resolve every answer for the current page, before the browser is touched
     * again. The fill loop below stays pure execution.
     */
    const planCurrentPage = async (inventory: InventoryItem[]): Promise<FieldPlan[]> => {
      const plan = await buildFillPlan(
        inventory, userData, bank,
        geminiKey || '', openAiKey || '', openRouterKey || '',
        applicationId, scopeContext, ledger
      )

      llmAnsweredTotal += plan.filter(p => p.method === 'llm' && p.value).length
      for (const p of plan) {
        if (p.method === 'sensitive') sensitiveAcrossSteps.add(p.label)
        if (p.needsReview && p.value) reviewAcrossSteps.add(p.label)
      }

      // Fix every answer in the ledger now. From this point the fill loop only
      // ever READS answers — it never computes one — which is what makes the
      // output stable across rounds, pages and retries.
      for (const p of plan) {
        if (p.value) ledger.record(p.key, p.label, p.value, p.method as any)
        if (p.blocker) {
          ledger.block({
            key: p.key, label: p.label, kind: p.blocker.kind,
            detail: p.blocker.detail, required: p.required,
          })
        }
      }

      const humanQs = ledger.humanRequired().map(b => b.label)
      const unanswerable = ledger.allBlockers().filter(b => b.kind === 'unanswerable')
      if (applicationId && (humanQs.length > 0 || unanswerable.length > 0)) {
        if (humanQs.length) {
          await persistLog(applicationId, 'warn', `Questions needing a human: ${humanQs.join(' | ')}`)
        }
        if (unanswerable.length) {
          await persistLog(applicationId, 'error', `Could not answer: ${unanswerable.map(b => `"${b.label.slice(0, 50)}" — ${b.detail}`).join(' | ')}`)
        }
        await supabase.from('live_application_queue').update({
          // Both kinds surface on the queue card. Previously an unanswerable
          // question showed up nowhere at all.
          questions_needing_human: [...new Set([...humanQs, ...unanswerable.map(b => b.label)])],
          llm_answered_count: llmAnsweredTotal,
        }).eq('id', applicationId)
      }

      // Remember the gaps so they show up before the NEXT run, when someone can
      // still do something about them.
      if (userId) {
        for (const p of plan) {
          if (p.method === 'sensitive' || p.method === 'unanswerable') {
            await recordMissingAnswer(supabase, userId, p.label, scopeContext)
          }
        }
      }
      return plan
    }

    const norm = (s: string) => s.replace(/[*✱＊]+/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

    /**
     * The answer for a field, read from the ledger.
     *
     * Pure lookup by design. A field that appeared after the plan was built (a
     * follow-up question revealed by answering "Yes" to sponsorship) is routed
     * through the same policy, recorded, and then resolved from the ledger like
     * everything else — so even a dynamically-added field gets exactly one
     * answer for the rest of the run.
     */
    const answerFor = async (rawLabel: string, fieldKey: string, item?: { kind: string; required: boolean; options: string[] }): Promise<{ value: string; blocked?: Blocker }> => {
      const existing = ledger.get(fieldKey, rawLabel)
      if (existing !== undefined) return { value: existing }

      const field = {
        label: rawLabel,
        kind: item?.kind || 'unknown',
        required: item?.required ?? true,
        options: item?.options || [],
        key: fieldKey,
      }
      const route = routeField(field, userData)

      if (route.route === 'sensitive') {
        const b: Blocker = { key: fieldKey, label: rawLabel, kind: 'human-required', detail: route.why, required: field.required }
        ledger.block(b)
        return { value: '', blocked: b }
      }
      if (route.route === 'file') return { value: '' }

      if (route.route === 'llm') {
        const bankHit = recallAnswer(bank, rawLabel, scopeContext)
        if (bankHit) return { value: ledger.record(fieldKey, rawLabel, bankHit.answer, 'bank') }
        const gen = await generateCustomAnswers(
          [{ label: rawLabel, type: field.kind === 'textarea' ? 'textarea' : 'text' }],
          userData, userData.jobTitle || '', userData.companyName || '',
          geminiKey || '', openAiKey || '', openRouterKey || '', applicationId
        )
        const value = gen.answers[0] || ''
        if (!value) {
          const detail = gen.failed ? `the model could not be reached (${gen.reason})` : 'the model returned no answer'
          const b: Blocker = { key: fieldKey, label: rawLabel, kind: 'unanswerable', detail, required: field.required }
          ledger.block(b)
          return { value: '', blocked: b }
        }
        return { value: ledger.record(fieldKey, rawLabel, value, 'llm') }
      }

      const preferred = (route as any).value || ''
      if (!preferred) {
        // A choice control with no preferred answer is not a failure — the
        // handler will offer the model its real options.
        if (CHOICE_KINDS.includes(field.kind)) return { value: '' }
        const b: Blocker = { key: fieldKey, label: rawLabel, kind: 'unanswerable', detail: route.why, required: field.required }
        ledger.block(b)
        return { value: '', blocked: b }
      }
      return { value: ledger.record(fieldKey, rawLabel, preferred, route.route as any) }
    }

    /**
     * The fill loop.
     *
     * One pass over the work list per round, and a field is touched at most
     * `ledger.maxAttempts` times across the WHOLE run — not per round, not per
     * page. Everything the loop needs to decide is already in the ledger, so it
     * performs no reasoning: it reads an answer, drives a widget, and records
     * the outcome.
     */
    const runFillLoop = async (maxRounds: number, knownValidationErrors: string[] = []) => {
      const sid = sessionId as string

      // The ONLY thing that reopens a settled field: the portal itself naming it.
      if (knownValidationErrors.length > 0) {
        const reopened = ledger.unsettleFromErrors(knownValidationErrors)
        if (reopened.length && applicationId) {
          await persistLog(applicationId, 'info', `Reopened ${reopened.length} field(s) the portal rejected: ${reopened.join(', ')}`)
        }
      }

      let prevPending: string[] = []
      let stuckCount = 0

      for (let round = 0; round < maxRounds; round++) {
        // Dynamic fields — a follow-up question revealed by an earlier answer —
        // are the only reason to re-audit mid-fill.
        const audit = await auditForm(kernelClient, sid, applicationId)
        const inventoryKeys = new Set(formInventory.map(i => i.key))
        for (const f of (audit.fields ?? [])) {
          if (inventoryKeys.has(f.key)) continue
          if (UNIDENTIFIED_FIELD.test(f.label)) continue
          formInventory.push({ key: f.key, label: f.label, kind: 'unknown', required: true, options: [] })
          inventoryKeys.add(f.key)
          if (applicationId) await persistLog(applicationId, 'info', `New field appeared mid-fill: "${f.label.slice(0, 50)}"`)
        }

        // Work list = everything not already settled and not knowingly blocked.
        const workFields = formInventory.filter(i => !ledger.isResolved(i.key))
        if (workFields.length === 0) break

        // Stuck guard: identical work list twice with no progress means nothing
        // here can be driven, and more rounds will not change that.
        const pendingKey = workFields.map(f => f.key).slice().sort().join('|')
        if (pendingKey === prevPending.slice().sort().join('|') && round > 0) {
          if (++stuckCount >= 2) {
            if (applicationId) {
              await persistLog(applicationId, 'warn', `Fill loop made no progress on ${workFields.length} field(s) — stopping: ${workFields.map(f => f.label.slice(0, 30)).join(', ')}`)
            }
            break
          }
        } else stuckCount = 0
        prevPending = workFields.map(f => f.key)

        if (onStep) {
          onStep({ step: 3, status: 'in_progress', log: `Checklist: ${ledger.settledCount}/${formInventory.length} done, ${workFields.length} remaining: ${workFields.slice(0, 4).map(f => f.label.slice(0, 28)).join(', ')}${workFields.length > 4 ? '…' : ''}`, liveUrl })
        }
        if (applicationId) {
          await persistLog(applicationId, 'info', `Fill round ${round + 1}: ${ledger.settledCount}/${formInventory.length} settled, ${workFields.length} remaining`)
        }

        let progressed = false

        for (const field of workFields) {
          const label = field.label.replace(/[*✱＊]+$/, '').trim()

          if (UNIDENTIFIED_FIELD.test(label)) {
            ledger.block({ key: field.key, label: field.label, kind: 'undrivable', detail: 'no label, aria-label, name, id or placeholder to act on', required: field.required })
            continue
          }

          // ── File inputs belong to the résumé path, not to this loop ──
          //
          // There is no answer to resolve and no handler that can drive one, so
          // routing it here would record it as "unanswerable" and block the
          // submit gate on a field that was already attached correctly by
          // uploadResumeFromBuffer. Whether the CV actually landed is checked
          // once, properly, at the submit gate.
          if (field.kind === 'file') {
            if (await verifyFieldFilled(kernelClient, sid, field.key)) ledger.settle(field.key)
            else ledger.block({ key: field.key, label: field.label, kind: 'undrivable', detail: 'file input — handled by the résumé upload path', required: false })
            continue
          }

          const { value, blocked } = await answerFor(field.label, field.key, field)
          if (blocked) continue

          // A choice control with no preferred answer still gets driven; the
          // handler returns its real options for the model to choose from.
          const isChoice = CHOICE_KINDS.includes(field.kind)
          if (!value && !isChoice) {
            ledger.block({ key: field.key, label: field.label, kind: 'unanswerable', detail: 'no answer could be resolved for this field', required: field.required })
            continue
          }

          const { exhausted } = ledger.countAttempt(field.key)

          const widget = await fillFieldWithHandler(kernelClient, sid, field.key, label, value, portalType, applicationId, field.label)

          // ─── Wrong-field guard ───
          // The handler re-reads the label off the element it actually resolved
          // and reports a mismatch instead of writing. A stale `idx:` key after
          // a re-render is exactly how a phone number ends up in a name box.
          if (widget.labelMismatch) {
            if (applicationId) {
              await persistLog(applicationId, 'warn', `Refused to fill "${label.slice(0, 40)}" — the element at ${field.key} is now "${String(widget.resolvedLabel).slice(0, 40)}". Re-scanning.`)
            }
            continue
          }

          if (widget.filled) {
            progressed = true
            ledger.settle(field.key)
            totalSteps++
            await persistLog(applicationId || "", "info",
              `FILLED "${label.slice(0, 60)}" via ${widget.handler} (${widget.reason})` +
              (widget.picked ? ` → selected "${String(widget.picked).slice(0, 60)}"` : ` ← "${String(value).slice(0, 60)}"`)
            )
            continue
          }
          if (applicationId) {
            await persistLog(applicationId, "warn",
              `NOT FILLED "${label.slice(0, 60)}" via ${widget.handler}: ${widget.reason}` +
              (widget.options?.length ? ` | widget offered: ${widget.options.slice(0, 8).map(o => o.slice(0, 24)).join(" / ")}` : "")
            )
          }

          // The widget offered real options and none matched — let the model
          // pick from what the page actually shows.
          if (widget.needsModelChoice && widget.options?.length) {
            const rejected = knownValidationErrors.find(e => norm(e).includes(norm(label)) || norm(label).includes(norm(e)))
            const ctx = {
              candidateName: userData.name,
              jobTitle: userData.jobTitle,
              companyName: userData.companyName,
              background: candidateBackground,
            }
            const prompt = rejected
              ? buildOptionRetryPrompt(label, widget.options, value, rejected, ctx)
              : buildOptionPrompt(label, widget.options, ctx, value)

            if (applicationId) {
              await persistLog(applicationId, "info",
                `Asking the model to choose for "${label.slice(0, 55)}" — our preference was "${String(value).slice(0, 40) || "(none)"}", widget offers: ${widget.options.map(o => o.slice(0, 28)).join(" / ").slice(0, 400)}`
              )
            }
            const reply = await askModel(prompt, modelChain, applicationId)
            if (applicationId) {
              await persistLog(applicationId, "info", `Model replied: "${String(reply).slice(0, 200)}"`)
            }
            const idx = reply ? matchReplyToOption(reply, widget.options) : -1
            if (idx >= 0) {
              const chosen = widget.options[idx]
              if (applicationId) {
                await persistLog(applicationId, 'info', `Model chose option ${idx + 1}/${widget.options.length}: "${chosen}" for "${label.slice(0, 45)}"`)
              }
              // Fixed in the ledger so a later page asking the same question
              // gets the identical choice without another model call.
              ledger.record(field.key, field.label, chosen, 'model-choice')
              const retry = await fillFieldWithHandler(kernelClient, sid, field.key, label, chosen, portalType, applicationId, field.label)
              totalSteps++
              if (retry.filled) {
                progressed = true
                ledger.settle(field.key)
                continue
              }
            } else if (applicationId) {
              await persistLog(applicationId, 'warn', `Model reply did not match any offered option for "${label.slice(0, 45)}" — reply: "${String(reply).slice(0, 80)}"`)
            }

            // ─── A required choice must not be left blank ───
            //
            // An unanswered required dropdown blocks the entire application, so
            // when the model cannot settle one, pick the least-committal real
            // option rather than abandon the form. Deliberately limited to
            // REQUIRED fields and logged loudly, because this is a guess:
            // "Prefer not to say" and friends first, then the first option that
            // is neither a placeholder nor the "Other" escape hatch.
            if (idx < 0 && field.required) {
              const neutral = widget.options.findIndex(o =>
                /^(prefer not|decline|i (do not|don't) wish|no answer|not applicable|n\/a)\b/i.test(o.trim())
              )
              const firstReal = widget.options.findIndex(o =>
                o.trim() && !/^([-–—\s]*(please\s+)?(select|choose|pick)\b|other\b)/i.test(o.trim())
              )
              const fallbackIdx = neutral >= 0 ? neutral : firstReal
              if (fallbackIdx >= 0) {
                const chosen = widget.options[fallbackIdx]
                if (applicationId) {
                  await persistLog(applicationId, 'warn',
                    `GUESSED "${chosen}" for required field "${label.slice(0, 50)}" — the model could not choose. Verify this answer.`
                  )
                }
                ledger.record(field.key, field.label, chosen, 'model-choice')
                const guess = await fillFieldWithHandler(kernelClient, sid, field.key, label, chosen, portalType, applicationId, field.label)
                totalSteps++
                if (guess.filled) {
                  progressed = true
                  ledger.settle(field.key)
                  reviewAcrossSteps.add(field.label)
                  continue
                }
              }
            }
          }

          // Model-authored driver code, off unless KERNEL_CODE_MODE=1.
          if (CODE_MODE_ENABLED && value) {
            const cm = await runCodeMode(
              kernelClient, sid, field.key, label, value,
              formInventory.find(i => i.key === field.key)?.kind || 'unknown',
              widget.reason || 'the typed handler could not drive this control',
              modelChain, applicationId
            )
            totalSteps++
            if (cm.compromised) { codeModeCompromised = cm.reason; return }
            if (cm.filled) { progressed = true; ledger.settle(field.key); continue }
          }

          // Last resort: the AI agent.
          if (value) {
            const validationHint = knownValidationErrors.length > 0
              ? ` NOTE: The form previously rejected these fields: ${knownValidationErrors.join(', ')}. Fix them first.`
              : ''
            const instruction = `In this job application form, find the field labeled "${label}" and set it to "${value}". If it is a text box, clear it and type the value. If it is a dropdown, listbox, radio group, or set of option buttons, choose the option that best matches "${value}". If the field already contains this exact value, leave it unchanged and do nothing. Do NOT click any Submit or Apply button.${validationHint}${skillGuidance}`
            const r = await actWithFallback(stagehand, modelChain, instruction, applicationId)
            totalSteps++
            allAgentText += ' ' + (r.message || '')
            if (applicationId) {
              await persistLog(applicationId, r.ok ? 'info' : 'warn', `act "${label.slice(0, 50)}" ← "${String(value).slice(0, 40)}" [${r.modelUsed}] ${r.ok ? 'ok' : 'FAIL: ' + r.message.slice(0, 150)}`)
            }
            if (!r.ok) runErrors.push(`act "${label.slice(0, 40)}": ${r.message.slice(0, 160)}`)
            if (r.ok) {
              // act() self-reports success even when nothing was set, so this is
              // VERIFIED against the DOM rather than trusted.
              const verified = await verifyFieldFilled(kernelClient, sid, field.key)
              if (verified) { progressed = true; ledger.settle(field.key) }
              else if (applicationId) {
                await persistLog(applicationId, 'warn', `act() reported success for "${label.slice(0, 40)}" but the field is still empty`)
              }
            }
            if (detectCaptcha(allAgentText) || detectOtp(allAgentText)) return
          }

          // ─── Out of attempts ───
          // Marked blocked, NOT filled. The old code marked an exhausted
          // OPTIONAL field as filled and left a REQUIRED one in limbo, where it
          // silently guaranteed the submit gate would fail with no indication
          // of which field was at fault.
          if (exhausted && !ledger.isSettled(field.key)) {
            ledger.block({
              key: field.key, label: field.label, kind: 'undrivable',
              detail: `could not be driven after ${ledger.maxAttempts} attempts (${widget.reason || 'unknown'})`,
              required: field.required,
            })
            if (applicationId) {
              await persistLog(applicationId, field.required ? 'error' : 'warn', `Giving up on "${label.slice(0, 45)}" after ${ledger.maxAttempts} attempts: ${widget.reason || 'unknown'}`)
            }
          }
        }

        if (!progressed) {
          if (applicationId) await persistLog(applicationId, 'warn', `Fill round ${round + 1}: no field could be filled — stopping loop`)
          break
        }
      }

      if (applicationId) {
        const pending = formInventory.filter(i => i.required && !ledger.isSettled(i.key))
        await persistLog(applicationId, pending.length ? 'warn' : 'info',
          `Fill complete: ${ledger.settledCount}/${formInventory.length} settled | ${pending.length} required still open: ${pending.map(i => i.label.slice(0, 30)).join(' | ') || 'none'}`
        )
      }
    }


    // ─── The wizard loop ───
    //
    // Workday, Taleo and iCIMS spread one application over several pages. This
    // used to be a sentence in the agent instruction, which meant the inventory
    // scan, the fill plan, the coverage tracking and the audit gate all applied
    // to page 1 and nothing afterwards.
    //
    // Now each step is a full cycle: scan → plan → fill → read the controls →
    // decide. The decision is made by `decideNextStep`, which distinguishes an
    // advance control ("Next", "Save and Continue") from a final action
    // ("Submit Application") — because clicking the wrong one either submits a
    // half-filled form or leaves the run hanging on a page that never confirms.
    //
    // Progress is verified, not assumed. Each page is fingerprinted from its
    // URL plus its actual control keys, so an advance click that changed
    // nothing is detected at the top of the next pass instead of quietly
    // re-filling the same page until the round budget runs out.
    const tracker = new StepTracker(WIZARD_MAX_STEPS)
    let reachedFinalPage = false
    /** Set when a real OTP challenge was seen on the page itself. */
    let otpOnPage = false
    let wizardStopReason: string | null = null
    let loopDetected = false
    let lastPageControls: string[] = []
    let currentFingerprint = ""

    while (true) {
      const stepNo = tracker.count + 1
      const stepLabel = `step ${stepNo}`

      // A step boundary is exactly where a portal likes to open a popup, so
      // check for a new tab before deciding what is on screen. Following one
      // changes the page, so the identity has to be re-read afterwards — using
      // the pre-switch URL would fingerprint the tab we just left.
      let preScan = await readPageControls(kernelClient, sessionId)
      if (preScan.tabCount > 1) {
        const sw = await switchToNewestTab(kernelClient, sessionId, 1, applicationId)
        if (sw.switched) {
          run?.detail("navigate", `Followed a popup to ${sw.url.slice(0, 80)}`)
          preScan = await readPageControls(kernelClient, sessionId)
        }
      }

      // ── Scan and plan this page ──
      formInventory = await scanCurrentPage(stepLabel)
      // The ledger is NOT reset between steps. A field settled on page 2 stays
      // settled; an answer fixed on page 1 is reused verbatim if page 4 asks the
      // same question. Resetting per page is what used to let one question get
      // two different model-written answers in a single application.
      if (stepNo === 1) await preMarkPhase1(formInventory)

      const pageFields = formInventory.map(i => i.key)
      currentFingerprint = fingerprintPage(preScan.url, pageFields)

      // A fingerprint we have already recorded means we did not move forward.
      // Two distinct failures, and the distinction is what an operator needs:
      //
      //   same as the step we just finished → the advance click did nothing,
      //     almost always an unread validation error or a disabled button
      //   an earlier step → the wizard bounced us backwards, which Workday does
      //     when a field on step 2 fails validation raised from step 4
      //
      // Either way, filling the page again would loop forever.
      if (tracker.hasSeen(currentFingerprint)) {
        loopDetected = true
        const seenAt = tracker.firstSeenAt(currentFingerprint)
        wizardStopReason =
          seenAt === tracker.count
            ? "The advance control was clicked but the page did not change — most likely a validation error we did not read."
            : `The wizard returned to a page already completed (step ${seenAt}) — cycling rather than progressing.`
        if (applicationId) await persistLog(applicationId, "warn", wizardStopReason)
        break
      }

      if (formInventory.length > 0) {
        if (onStep) onStep({ step: 3, status: "in_progress", log: `Building fill plan (${stepLabel})...`, liveUrl })
        const stepPlan = await planCurrentPage(formInventory)
        if (onStep) onStep({ step: 3, status: "in_progress", log: `Plan ready: ${stepPlan.length} fields on ${stepLabel}. Filling...`, liveUrl })

        // Fields the plan says already hold the right value never need an
        // action — settling them here is what stops the loop clearing and
        // retyping something that was already correct.
        for (const p of stepPlan) {
          if (p.method === "keep") ledger.settle(p.key)
        }

        await runFillLoop(6)
      } else if (applicationId) {
        await persistLog(applicationId, "info", `${stepLabel}: no fillable controls — treating as a transition or review page`)
      }

      tracker.record({
        fingerprint: currentFingerprint,
        url: preScan.url,
        fieldCount: formInventory.length,
        filledCount: formInventory.filter(i => ledger.isSettled(i.key)).length,
      })

      // Model-authored code did something unaccounted for. Stop before the
      // submit gate: we cannot audit a form we may no longer be looking at.
      if (codeModeCompromised) {
        wizardStopReason = `Code mode caused an unsafe side effect (${codeModeCompromised}) — stopped without submitting.`
        if (applicationId) await persistLog(applicationId, "error", wizardStopReason)
        break
      }

      // A challenge that appeared mid-page must be cleared before we advance,
      // or the advance click is silently rejected. Checked against the PAGE as
      // well as the agent transcript — the transcript is nearly always empty
      // now that typed handlers do the filling, which is why the OTP path below
      // used to be unreachable.
      const pageOtp = await detectOtpOnPage(kernelClient, sessionId)
      if (pageOtp.present) otpOnPage = true
      if (detectCaptcha(allAgentText) || detectOtp(allAgentText) || pageOtp.present) {
        if (applicationId) {
          await persistLog(applicationId, "info",
            `${stepLabel}: verification challenge detected${pageOtp.present ? ` on the page (${pageOtp.evidence})` : ""} — leaving the wizard loop to resolve it`
          )
        }
        break
      }

      // ── Decide what happens next ──
      const after = await readPageControls(kernelClient, sessionId)
      lastPageControls = after.controls
      const decision = decideNextStep({
        tracker,
        currentFingerprint,
        nextFingerprint: null,
        visibleControls: after.controls,
        // Disabled buttons are passed through so a greyed-out Submit reads as
        // "the form is incomplete" instead of "there is no Submit here".
        allControls: after.allControls,
      })

      if (applicationId) {
        await persistLog(applicationId, "info",
          `${stepLabel} decision: ${decision.action} — ${decision.detail} | controls: ${after.controls.slice(0, 8).join(" / ") || "none"}`
        )
      }

      if (decision.action === "submit") {
        reachedFinalPage = true
        break
      }
      if (decision.action === "stop") {
        // ─── A disabled final control is a fixable state ───
        //
        // Greenhouse and Ashby grey out Submit until their own client-side
        // validation passes. Stopping here was the single biggest cause of
        // "filled everything, then quit without submitting". Read what the form
        // is actually complaining about, fix exactly that, and look again.
        if (decision.reason === "blocked_final") {
          const errs = await readValidationErrors(kernelClient, sessionId)
          if (applicationId) {
            await persistLog(applicationId, "warn",
              `${decision.detail}${errs.length ? ` Portal is flagging: ${errs.join(", ")}` : " No validation message was shown."}`
            )
          }
          if (errs.length) run?.validationErrors(errs)
          await runFillLoop(3, errs)

          const recheck = await readPageControls(kernelClient, sessionId)
          lastPageControls = recheck.controls
          const enabledFinal = recheck.controls.find(c => classifyControl(c) === "final")
          if (enabledFinal) {
            if (applicationId) await persistLog(applicationId, "info", `"${enabledFinal}" is enabled now — proceeding to the submit gate.`)
            reachedFinalPage = true
            break
          }
          const enabledAdvance = recheck.controls.find(c => classifyControl(c) === "advance")
          if (enabledAdvance) {
            await clickAdvanceControl(kernelClient, sessionId, enabledAdvance, applicationId)
            if (tracker.exhausted) {
              wizardStopReason = `Reached the ${WIZARD_MAX_STEPS}-step ceiling without finding a final action.`
              break
            }
            continue
          }
          wizardStopReason = decision.detail
          break
        }
        wizardStopReason = decision.detail
        if (decision.reason === "stuck" || decision.reason === "cycle") loopDetected = true
        break
      }

      // ── Advance, then prove the page actually changed ──
      const advanceLabel = after.controls.find(c => classifyControl(c) === "advance")!
      if (onStep) onStep({ step: 3, status: "in_progress", log: `Advancing to the next step via "${advanceLabel}"...`, liveUrl })
      const clicked = await clickAdvanceControl(kernelClient, sessionId, advanceLabel, applicationId)
      if (!clicked) {
        wizardStopReason = `Could not click the "${advanceLabel}" control.`
        break
      }

      // Some portals validate on Next rather than on Submit. Reading those
      // errors here means they get fixed on the page that owns them, instead of
      // surfacing pages later with no way to get back.
      const stepErrors = await readValidationErrors(kernelClient, sessionId)
      if (stepErrors.length > 0) {
        if (applicationId) await persistLog(applicationId, "warn", `${stepLabel} rejected on advance: ${stepErrors.join(", ")} — retrying those fields`)
        run?.validationErrors(stepErrors)
        await runFillLoop(3, stepErrors)
        await clickAdvanceControl(kernelClient, sessionId, advanceLabel, applicationId)
      }

      // Whether the page actually changed is decided at the top of the next
      // iteration, against the real control keys. A URL comparison here would
      // report every single-page-app wizard as stuck, because Workday and iCIMS
      // swap the whole form without ever navigating.

      if (tracker.exhausted) {
        wizardStopReason = `Reached the ${WIZARD_MAX_STEPS}-step ceiling without finding a final action.`
        if (applicationId) await persistLog(applicationId, "warn", wizardStopReason)
        break
      }
    }

    if (applicationId) {
      await persistLog(applicationId, "info",
        `Wizard finished after ${tracker.count} step(s): ${tracker.summary()}${reachedFinalPage ? " — final action reached" : wizardStopReason ? ` — stopped: ${wizardStopReason}` : ""}`
      )
      if (!reachedFinalPage && lastPageControls.length) {
        // The buttons that WERE on screen are the most useful clue about why we
        // never found a final action.
        await persistLog(applicationId, "warn", `Controls visible when the wizard stopped: ${lastPageControls.slice(0, 10).join(" / ")}`)
      }
    }

    run?.succeed(
      "ai_fill",
      `${tracker.count} page${tracker.count === 1 ? "" : "s"} · ${totalSteps} action${totalSteps === 1 ? "" : "s"} · ${llmAnsweredTotal} LLM-answered · ${sensitiveAcrossSteps.size} human-required`
    )

    // ─── CAPTCHA handling ───
    // Two detectors, because they see different things. The keyword scan reads
    // what the agent said; the structural scan reads the DOM and is the only
    // one that can see an INVISIBLE challenge — reCAPTCHA v3 and Turnstile
    // render no widget and produce no text, they just silently reject the POST.
    // A run blocked by one of those used to look like "submit clicked but not
    // confirmed", sending the retry loop hunting for a field that was never
    // missing.
    const structuralCaptcha = await detectCaptchaOnPage(kernelClient, sessionId, applicationId)
    const needsVerification = detectCaptcha(allAgentText) || detectOtp(allAgentText) || otpOnPage || !!structuralCaptcha
    let captchaUnresolved = false
    if (needsVerification) run?.begin("verification")
    else run?.skip("verification", "No CAPTCHA or OTP challenge")

    // Our own solve path runs FIRST when the challenge is structurally
    // identified: it covers the invisible types the vendor solver is weakest
    // on, and it removes the single point of failure of waiting on one vendor.
    if (structuralCaptcha && isSolvable(structuralCaptcha)) {
      if (onStep) onStep({ status: "in_progress", log: `${structuralCaptcha.type} detected — solving...`, liveUrl })
      const solved = await resolveCaptcha(kernelClient, sessionId, structuralCaptcha, captchaSolverKey, applicationId)
      if (solved.cleared) {
        run?.detail("verification", `${structuralCaptcha.type} solved via the independent solver`)
        allAgentText = ""
        await runFillLoop(3)
      } else if (applicationId) {
        await persistLog(applicationId, "warn", `Independent solve did not clear it (${solved.reason}) — falling back to the vendor solver / a human`)
      }
    }

    if (applicationId && (detectCaptcha(allAgentText) || (structuralCaptcha && !isSolvable(structuralCaptcha)))) {
      await persistLog(applicationId, "info", "CAPTCHA still present. Waiting for Kernel auto-solve via telemetry event...")
      if (onStep) onStep({ status: "in_progress", log: "CAPTCHA detected — waiting for Kernel auto-solve...", liveUrl })
      const autoSolved = await Promise.race([
        captchaSolvedPromise.then(() => true),
        new Promise<boolean>(r => setTimeout(() => r(false), 60000)),
        fatalErrorPromise.catch(() => false),
      ])
      if (!autoSolved) {
        captchaUnresolved = true
        await supabase.from("live_application_queue").update({ status: "awaiting_captcha", live_url: liveUrl }).eq("id", applicationId)
        if (onStep) onStep({ status: "awaiting_captcha", log: "CAPTCHA auto-solve failed. Human operator needed via live view.", liveUrl })
        // A dry run has no operator watching a queue card, so waiting for one
        // would hang forever. Report the challenge and carry on to the gate.
        if (DRY_RUN) {
          await persistLog(applicationId, "warn", "DRY RUN — a CAPTCHA needs a human; not waiting for one.")
        } else {
          while (true) {
            await new Promise(r => setTimeout(r, 10000))
            const { data: row } = await supabase.from("live_application_queue").select("status").eq("id", applicationId).single()
            if (row?.status === "processing") break
          }
        }
      }
      captchaUnresolved = false
      await persistLog(applicationId, "info", "CAPTCHA solved. Resuming fill...")
      if (onStep) onStep({ status: "in_progress", log: "CAPTCHA solved. Resuming...", liveUrl })
      run?.detail("verification", autoSolved ? "CAPTCHA auto-solved by Kernel" : "CAPTCHA cleared by a human operator")
      allAgentText = ""   // reset so a stale captcha keyword doesn't block submit
      await runFillLoop(4)
    }

    // ─── OTP handling ───
    // One more look before the submit gate: a challenge can appear on the final
    // page without the wizard loop ever having seen it.
    if (!otpOnPage && sessionId) {
      const finalOtp = await detectOtpOnPage(kernelClient, sessionId)
      if (finalOtp.present) {
        otpOnPage = true
        if (applicationId) await persistLog(applicationId, "info", `OTP challenge found before the submit gate (${finalOtp.evidence})`)
      }
    }

    if (applicationId && (detectOtp(allAgentText) || otpOnPage)) {
      await supabase.from("live_application_queue").update({ status: "awaiting_otp" }).eq("id", applicationId)
      await persistLog(applicationId, "info", "OTP required. Attempting API-based fetch...")
      if (onStep) onStep({ status: "awaiting_otp", log: "OTP required. Fetching via API...", liveUrl })

      // ─── Three tiers, same as browser-use and browserbase ───
      //
      // 1. API: the Resend inbound webhook writes the code into the queue row;
      //    failing that, the Resend list API is scanned for the recipient.
      // 2. The OTP Manager admin panel, read from the DOM in this same browser.
      // 3. A human, via the queue row.
      //
      // Kernel previously had only 1 and 3. A code that arrived slightly late —
      // after the 45s API poll but well before the 3-minute human timeout — was
      // sitting in the panel the whole time and never used.
      //
      // The proxy address is what the portal actually emails, and it is what the
      // webhook matches on; userData.email is the candidate's own inbox, which
      // Resend never sees.
      const otpAddress = userData.proxyEmail || userData.proxy_email || userData.email || ""
      let otp = await fetchOtpViaApi(applicationId, otpAddress, 45000)

      if (!otp) {
        await persistLog(applicationId, "info", "API OTP fetch found nothing — reading the OTP Manager panel...")
        if (onStep) onStep({ status: "awaiting_otp", log: "Checking the OTP Manager panel...", liveUrl })
        otp = await fetchOtpFromAdminPanel(kernelClient, sessionId, applicationId, otpAddress, applicationId)
      }

      if (!otp) {
        // Human fallback: wait for an operator to write the OTP into the queue row.
        if (onStep) onStep({ status: "awaiting_otp", log: "No OTP found automatically. Waiting for one to be provided...", liveUrl })
        for (let i = 0; i < (DRY_RUN ? 0 : 18); i++) { // ~3 min
          await new Promise(r => setTimeout(r, 10000))
          const { data: row } = await supabase.from("live_application_queue").select("verification_otp").eq("id", applicationId).single()
          if (row?.verification_otp) { otp = row.verification_otp; break }
        }
      }

      if (otp) {
        await persistLog(applicationId, "info", `OTP obtained: ${otp}`)
        if (onStep) onStep({ status: "in_progress", log: `OTP: ${otp}. Entering...`, liveUrl })
        await supabase.from("live_application_queue").update({ status: "processing" }).eq("id", applicationId)
        await actWithFallback(stagehand, modelChain, `Enter "${otp}" into the verification code / OTP input field, then click the Verify or Submit button.`, applicationId)
        await supabase.from("live_application_queue").update({ verification_otp: null }).eq("id", applicationId)
        allAgentText = ""
        // Confirm against the page rather than assuming the entry worked — the
        // submit gate reads this flag, so a stale `true` would block a run whose
        // challenge is already cleared, and a stale `false` would submit into one
        // that is not.
        const afterOtp = await detectOtpOnPage(kernelClient, sessionId)
        otpOnPage = afterOtp.present
        await persistLog(
          applicationId,
          otpOnPage ? "warn" : "info",
          otpOnPage ? `OTP entered but the challenge is still on screen (${afterOtp.evidence})` : "OTP challenge cleared."
        )
        await runFillLoop(4)
      } else {
        await persistLog(applicationId, "error", "OTP not obtained via API or human fallback.")
        if (onStep) onStep({ status: "error", log: "OTP extraction failed.", liveUrl })
        // No explicit end() — the finally block closes and flushes the run on every path.
        run?.fail("verification", "OTP required but never arrived — no API fetch and no operator entry within ~3 min")
        return { success: false, error: "OTP required but not provided.", steps: totalSteps, recordingUrl: liveUrl }
      }
    }

    // ─── Submit gate: final audit + resume gate → click Submit only when truly complete ───
    let submitClicked = false
    // Set when the portal rejects the submit as automated. Suppresses the
    // validation-retry path and produces a distinct, non-retryable failure.
    let antiBotBlocked = false
    const verificationClear =
      !detectCaptcha(allAgentText) && !detectOtp(allAgentText) && !otpOnPage && !captchaUnresolved && !codeModeCompromised

    // The wizard is the authority on whether we are allowed to submit. Reaching
    // a page that offers a final action is the only thing that means "this is
    // the end of the application" — a run that stopped because it was stuck or
    // cycling has not finished the form, and clicking Submit there would send a
    // half-completed application.
    if (!reachedFinalPage && verificationClear) {
      // Say WHY, in terms of the form rather than of our own control flow.
      // "No final-action control was ever reached" sent operators looking for
      // the wrong page when the real answer was almost always "three fields are
      // still open, so the portal has Submit greyed out".
      const openRequired = formInventory.filter(i => i.required && !ledger.isSettled(i.key))
      const reqBlockers = ledger.requiredBlockers()
      const parts: string[] = []
      if (wizardStopReason) parts.push(wizardStopReason)
      if (reqBlockers.length) {
        parts.push(`${reqBlockers.length} required field(s) could not be completed: ${reqBlockers.map(b => `"${b.label.slice(0, 40)}" (${b.detail})`).join("; ")}`)
      } else if (openRequired.length) {
        parts.push(`${openRequired.length} required field(s) still open: ${openRequired.map(i => i.label.slice(0, 40)).join("; ")}`)
      }
      const detail = parts.join(" | ") || "No final-action control was ever reached."
      if (applicationId) await persistLog(applicationId, "error", `Not submitting — ${detail}`)
      if (onStep) onStep({ step: 5, status: "in_progress", log: `Not submitting — ${detail}`, liveUrl })
      run?.fail("audit", detail)
      run?.skip("submit", "The wizard never reached a final action")
    }

    if (verificationClear && reachedFinalPage) {
      if (needsVerification) run?.succeed("verification", "Challenge cleared")

      // ─── The résumé is not optional ───
      //
      // An application without the CV attached is worthless even when every
      // other field is perfect, so this gets its own retry budget rather than
      // the single attempt it had before. Each retry re-reads the DOM to confirm
      // the file input actually registered, because a `.files` assignment that
      // React never saw looks exactly like a successful attach from the outside.
      if (resumeBuffer && resumeFileName && !preFillResults.resume) {
        for (let attempt = 1; attempt <= 3 && !preFillResults.resume; attempt++) {
          const retryUpload = await uploadResumeFromBuffer(kernelClient, sessionId, resumeBuffer, resumeFileName, resumeMimeType, applicationId)
          preFillResults.resume = retryUpload.uploaded
          if (retryUpload.uploaded) {
            run?.succeed("resume_upload", `Attached on retry ${attempt} via ${retryUpload.method}`)
            if (applicationId) await persistLog(applicationId, "info", `Résumé attached on retry ${attempt} (${retryUpload.method})`)
          } else if (applicationId) {
            await persistLog(applicationId, "warn", `Résumé attach attempt ${attempt}/3 did not register`)
          }
        }
        if (!preFillResults.resume && applicationId) {
          await persistLog(applicationId, "error", "Résumé could not be attached after 3 attempts — refusing to submit an application with no CV.")
        }
      }

      run?.begin("audit")
      const finalAudit = await auditForm(kernelClient, sessionId, applicationId)

      // ─── Three separate completeness questions ───
      //
      //  · ledger:      did WE finish every required field?
      //  · finalAudit:  does the PAGE still show a required field as empty?
      //  · blockers:    is there anything we knowingly could not do?
      //
      // The third used to be invisible. An unanswerable question was recorded as
      // filled, so a run with a question nobody answered looked identical to a
      // perfect one right up to the moment the audit failed for a reason the
      // logs could not explain.
      const inventoryBlockers = formInventory.filter(i => i.required && !ledger.isSettled(i.key))
      const knownBlockers = ledger.requiredBlockers()
      // Missing because the attach failed, OR because there was never a résumé
      // to attach and the form is asking for one. The second case used to sail
      // straight through: with no `resumeFileName` this expression was false and
      // we submitted a CV-less application.
      const formWantsResume = formInventory.some(i => i.kind === "file" || /resume|cv\b|curriculum/i.test(i.label))
      const resumeMissing = resumeFileName ? !preFillResults.resume : formWantsResume
      if (knownBlockers.length > 0 && applicationId) {
        await persistLog(applicationId, "error",
          `Submit gate: ${knownBlockers.length} required field(s) were never completed — ${knownBlockers.map(b => `"${b.label.slice(0, 45)}" [${b.kind}] ${b.detail}`).join(" | ")}`
        )
      }
      if (inventoryBlockers.length === 0 && knownBlockers.length === 0 && finalAudit.unfilledFields.length === 0 && !resumeMissing) {
        run?.succeed("audit", "All required fields filled")
        run?.begin("submit")
        if (onStep) onStep({ step: 5, status: "in_progress", log: "All required fields filled — submitting...", liveUrl })
        const clickRes = await clickSubmitButton(kernelClient, sessionId, applicationId)
        submitClicked = clickRes.clicked

        // Post-submit validation error check: React portals (Greenhouse/Lever/Ashby) validate
        // in JS and don't set [required] on DOM elements, so auditForm can miss them.
        // If submit was clicked but confirmation fails, extract the specific fields that failed
        // and run one more targeted fill round before giving up.
        if (submitClicked) {
          await new Promise(r => setTimeout(r, 2000))
          // An anti-bot rejection is terminal for this run. Retrying the fill
          // loop can't fix it and re-submitting deepens the block.
          const postSubmitText = [clickRes.bodyText, ...(await readValidationErrors(kernelClient, sessionId))].join(" ")
          if (detectAntiBotBlock(postSubmitText)) {
            const msg = "Portal rejected the submission as automated/spam. Not retrying — a resubmit would reinforce the block."
            if (applicationId) await persistLog(applicationId, "error", `${msg} | portal said: ${String(clickRes.bodyText || "").slice(0, 200)}`)
            if (onStep) onStep({ status: "error", log: msg, liveUrl })
            run?.fail("submit", msg)
            run?.validationErrors([String(clickRes.bodyText || "").replace(/\s+/g, " ").trim().slice(0, 300)])
            antiBotBlocked = true
            submitClicked = false
          }

          const validationErrors = antiBotBlocked ? [] : await readValidationErrors(kernelClient, sessionId)
          lastValidationErrors = validationErrors
          lastBodyText = clickRes.bodyText || lastBodyText
          if (validationErrors.length > 0) {
            if (applicationId) await persistLog(applicationId, "warn", `Post-submit validation errors: ${validationErrors.join(', ')} — running targeted retry`)
            if (onStep) onStep({ step: 5, status: "in_progress", log: `Validation errors after submit: ${validationErrors.join(', ')} — fixing...`, liveUrl })
            // Surfaced verbatim in the UI: what the form itself said is the most
            // actionable thing an operator can see about a bounced submit.
            run?.validationErrors(validationErrors)
            run?.fail("submit", `Form rejected the submit: ${validationErrors.join("; ")}`)
            submitClicked = false
            run?.begin("ai_fill")
            await runFillLoop(3, validationErrors)
            run?.succeed("ai_fill", `Targeted retry on ${validationErrors.length} rejected field(s)`)
            // Re-attempt submit after fixing validation errors
            if (!detectCaptcha(allAgentText) && !detectOtp(allAgentText)) {
              run?.begin("audit")
              const retryAudit = await auditForm(kernelClient, sessionId, applicationId)
              const retryInventoryBlockers = formInventory.filter(i => i.required && !ledger.isSettled(i.key))
              if (retryInventoryBlockers.length === 0 && retryAudit.unfilledFields.length === 0) {
                run?.succeed("audit", "All required fields filled after retry")
                run?.begin("submit")
                const retryClick = await clickSubmitButton(kernelClient, sessionId, applicationId)
                submitClicked = retryClick.clicked
                if (submitClicked) run?.succeed("submit", "Submit clicked on retry")
                else run?.fail("submit", "Submit button could not be clicked on retry")
              } else {
                run?.fail("audit", `Still unfilled after retry: ${[...retryInventoryBlockers.map(i => i.label), ...retryAudit.unfilledFields].join(", ")}`)
              }
            }
          } else {
            run?.succeed("submit", "Submit clicked, no validation errors returned")
          }
        } else {
          run?.fail("submit", "Submit button could not be found or clicked")
        }
      } else {
        const reasons: string[] = []
        if (inventoryBlockers.length > 0) reasons.push(`${inventoryBlockers.length} required inventory item(s) unfilled: ${inventoryBlockers.map(i => i.label).join(", ")}`)
        if (finalAudit.unfilledFields.length > 0) reasons.push(`${finalAudit.unfilledFields.length} unfilled required field(s): ${finalAudit.unfilledFields.join(", ")}`)
        if (knownBlockers.length > 0) {
          reasons.push(`${knownBlockers.length} field(s) we could not complete: ${knownBlockers.map(b => `"${b.label.slice(0, 40)}" (${b.detail})`).join("; ")}`)
        }
        if (resumeMissing) {
          reasons.push(resumeFileName ? "résumé could not be attached" : "this form requires a résumé and none is on file for this candidate")
        }
        if (applicationId) await persistLog(applicationId, "error", `Not submitting — ${reasons.join(" | ")}`)
        if (onStep) onStep({ step: 5, status: "in_progress", log: `Not submitting — ${reasons.join(" | ")}`, liveUrl })
        run?.fail("audit", reasons.join(" | "))
        run?.skip("submit", "Blocked by the audit gate")
      }
    }
    if (!verificationClear && needsVerification) {
      run?.fail("verification", "Run reached the submit gate with an unresolved CAPTCHA/OTP challenge")
      run?.skip("audit", "Blocked by unresolved verification")
      run?.skip("submit", "Blocked by unresolved verification")
    }

    // ─── Final submission confirmation ───
    const processingTime = Date.now() - startTime
    run?.begin("confirm")
    const confirmation = await confirmSubmission(kernelClient, sessionId, portalType, targetUrl, submitClicked, applicationId)

    // ── Receipt fallback: ask the page for the reference the regex missed ──
    //
    // `extractConfirmationId` is deliberately conservative — it only accepts an
    // ID introduced by a recognised label, because a wrong reference shown to a
    // candidate as proof is worse than no reference. That conservatism costs us
    // real receipts on portals that phrase it unusually or in another language.
    //
    // So when we believe the application landed but have no reference, ask.
    // The answer is then held to the SAME `looksLikeId` scrutiny the regex
    // output is: a model asked for a string will happily return a date, an
    // order number from the footer, or the job requisition ID.
    // confirmation ID recovery via regex already handled above; no extract fallback needed

    // ── Independent judge over the rules verdict ──
    //
    // `confirmSubmission` is a rules engine keyed on URL shapes and phrases like
    // "thank you" — which appear on plenty of pages that did NOT accept an
    // application, and are absent from plenty that did. Its own `medium` bucket
    // is the honest admission of that, and until now those runs were reported as
    // successes with a note asking a human to spot-check.
    //
    // The judge audits exactly that bucket. It never sees our verdict, so it
    // cannot simply agree with it, and it abstains below a confidence floor
    // rather than flip-flopping on weak signals.
    let judgeNote: string | null = null
    let judgedNotSubmitted = false
    if (confirmation.submitted && confirmation.confidence === "medium") {
      try {
        const post = await readPageControls(kernelClient, sessionId)
        const evidence: SubmissionEvidence = {
          portal: portalType,
          finalUrl: post.url,
          startUrl: targetUrl,
          bodyText: post.bodyText,
          submitClicked,
          visibleInputs: post.hasForm ? 1 : 0,
          submitStillVisible: post.controls.some(c => classifyControl(c) === "final"),
          validationErrors: await readValidationErrors(kernelClient, sessionId),
          confirmationId: confirmation.confirmationId ?? null,
          timeline: tracker.steps.map(st => `step ${st.step}: ${st.filledCount}/${st.fieldCount} filled`),
        }
        const reply = await askModel(buildJudgePrompt(evidence), modelChain, applicationId)
        const verdict = parseJudgeReply(reply)
        const outcome = reconcile(true, verdict)
        judgeNote = `${verdict.verdict} @ ${Math.round(verdict.confidence * 100)}% — ${verdict.reason}`
        if (applicationId) {
          await persistLog(applicationId, outcome === "downgrade" ? "warn" : "info", `Submission judge: ${judgeNote} → ${outcome}`)
        }
        if (outcome === "upgrade") {
          confirmation.confidence = "high"
          confirmation.reason = `${confirmation.reason} (independently confirmed: ${verdict.reason})`
        } else if (outcome === "downgrade") {
          judgedNotSubmitted = true
          confirmation.submitted = false
          confirmation.reason = `An independent check disagreed that this submitted: ${verdict.reason}`
        }
      } catch (err) {
        // The judge is an auditor, not a dependency. Its failure leaves the
        // rules verdict exactly as it was.
        if (applicationId) await persistLog(applicationId, "warn", `Submission judge unavailable: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    run?.confirmation(confirmation.confirmationId ?? null, confirmation.confidence)
    if (confirmation.submitted) {
      run?.succeed(
        "confirm",
        confirmation.confirmationId
          ? `${confirmation.confirmationLabel ?? "Reference"}: ${confirmation.confirmationId}`
          : `${confirmation.confidence} confidence — ${confirmation.reason}`
      )
    } else {
      run?.fail("confirm", confirmation.reason)
    }

    if (applicationId) {
      await persistLog(applicationId, confirmation.submitted ? "info" : "error",
        `Final confirmation: submitted=${confirmation.submitted} confidence=${confirmation.confidence} | ${confirmation.reason} | ${Math.round(processingTime / 1000)}s, ${totalSteps} actions`
      )
      // The label lives outside the timeline document, so write it here.
      if (confirmation.confirmationLabel) {
        await supabase
          .from("live_application_queue")
          .update({ confirmation_label: confirmation.confirmationLabel })
          .eq("id", applicationId)
      }
    }

    // Check for FIELD_NEEDS_HUMAN_INPUT signals from agent
    const humanInputFields = allAgentText.match(/FIELD_NEEDS_HUMAN_INPUT:\s*([^\n]+)/g) || []
    if (humanInputFields.length > 0 && applicationId) {
      await persistLog(applicationId, "warn", `Agent flagged fields needing human input: ${humanInputFields.join(", ")}`)
    }

    // ─── Learn from the run, then close it out ───
    //
    // Two feedback loops, both best-effort and both scoped so a failure here can
    // never change the run's outcome:
    //
    //  1. score the site knowledge this run actually used, retiring anything
    //     that has started predicting the site wrongly
    //  2. distil something new about the site, PII-gated before storage
    if (skillDomainName) {
      await recordSkillFeedback(supabase, usedSkillIds, confirmation.submitted)
      try {
        const { prompt, system } = buildDistilPrompt({
          domain: skillDomainName,
          portal: portalType,
          succeeded: confirmation.submitted,
          timeline: tracker.steps.map(st => `step ${st.step}: ${st.filledCount}/${st.fieldCount} fields`),
          fieldSummary: formInventory.map(i => `${i.label.slice(0, 50)} [${i.kind}${i.required ? "*" : ""}]`),
          failures: [
            ...(wizardStopReason ? [wizardStopReason] : []),
            ...(antiBotBlocked ? ["portal rejected the submission as automated"] : []),
          ],
          existing: loadedSkills.map(sk => sk.content),
        })
        const reply = await askModel(`${system}\n\n${prompt}`, modelChain, applicationId)
        const distilled = parseDistilReply(reply)
        if (distilled.worthSaving) {
          const stored = await recordSkill(supabase, skillDomainName, distilled.content)
          if (stored && applicationId) {
            await persistLog(applicationId, "info", `Learned about ${skillDomainName} (v${stored.version}): ${distilled.content.slice(0, 160)}`)
          }
        } else if (distilled.rejectedReason && applicationId) {
          await persistLog(applicationId, "info", `Nothing stored about ${skillDomainName} — ${distilled.rejectedReason}`)
        }
      } catch {
        // Distillation is an optimisation for future runs, never this one.
      }
    }

    // ─── Diagnose a failure into something actionable ───
    //
    // Two consequences that free-text errors could not support: a PERMANENT
    // failure (a closed posting, an SSO wall) must never re-enter the retry
    // queue, and a failure that is not the portal's fault must not move its
    // circuit breaker. Three expired postings in a row used to trip Greenhouse
    // open for every candidate, even though Greenhouse worked perfectly.
    let diagnosis: Diagnosis | null = null
    if (!confirmation.submitted) {
      const signals: RunSignals = {
        pageText: lastBodyText,
        finalUrl: targetUrl,
        unfilledRequired: formInventory.filter(i => i.required && !ledger.isSettled(i.key)).map(i => i.label),
        validationErrors: lastValidationErrors,
        loopDetected,
        captchaUnresolved,
        antiBotBlocked,
        unsafePage: unsafeReason,
        errors: codeModeCompromised ? [...runErrors, `code mode side effect: ${codeModeCompromised}`] : runErrors,
      }
      diagnosis = diagnose(signals)
      if (applicationId) {
        await persistLog(applicationId, "error",
          `Diagnosis [${diagnosis.failureClass}${diagnosis.permanent ? " · permanent" : " · retryable"}${diagnosis.portalFault ? " · portal fault" : ""}]: ${diagnosis.rootCause} → ${diagnosis.suggestedAction}`
        )
        try {
          await supabase.from("live_application_queue").update({
            failure_class: diagnosis.failureClass,
            failure_cause: diagnosis.rootCause,
            failure_action: diagnosis.suggestedAction,
            failure_permanent: diagnosis.permanent,
            failure_portal_fault: diagnosis.portalFault,
          }).eq("id", applicationId)
        } catch {
          // The columns may not exist yet; the log line above still carries it.
        }
      }
    }

    // A captured reference is the strongest thing we can show the operator, so it
    // leads the result string when we have one.
    const receiptText = confirmation.confirmationId
      ? `Application submitted — ${confirmation.confirmationLabel ?? "reference"} ${confirmation.confirmationId}`
      : null

    if (confirmation.submitted && confirmation.confidence === 'high') {
      return { success: true, result: receiptText || confirmation.confirmationText || "Application submitted", steps: totalSteps, recordingUrl: liveUrl, taskId: sessionId }
    }
    if (confirmation.submitted && confirmation.confidence === 'medium') {
      // Medium confidence — log for spot-check but treat as success
      if (applicationId) await persistLog(applicationId, "warn", "Medium-confidence submission — flagged for spot-check")
      return { success: true, result: `${receiptText || "Application submitted"} (medium confidence — flagged for review)`, steps: totalSteps, recordingUrl: liveUrl, taskId: sessionId }
    }

    // An anti-bot block is a distinct failure from an incomplete form. Reporting
    // it as "Submit button was never clicked (form was incomplete)" sent the
    // operator hunting for a missing field that didn't exist.
    if (antiBotBlocked) {
      return {
        success: false,
        error: "Portal rejected the submission as automated/spam. The form was filled and submitted, but the ATS blocked it. Retrying from the same IP is likely to be blocked again.",
        steps: totalSteps,
        recordingUrl: liveUrl,
        taskId: sessionId,
        failure: diagnosis ?? undefined,
      }
    }

    // Not confirmed — return false with a specific reason. A judge-driven
    // downgrade is called out explicitly: the form WAS submitted as far as our
    // rules could tell, and an independent check disagreed, which is a very
    // different thing for an operator to look into than a form that stalled.
    const failureSuffix = diagnosis ? ` | ${diagnosis.failureClass}: ${diagnosis.suggestedAction}` : ""
    const failure = diagnosis ?? undefined
    if (judgedNotSubmitted) {
      return {
        success: false,
        error: `Submit was clicked, but an independent check could not confirm the application landed: ${judgeNote ?? confirmation.reason}. Verify by hand before retrying — a retry may duplicate it.${failureSuffix}`,
        steps: totalSteps,
        recordingUrl: liveUrl,
        taskId: sessionId,
        failure,
      }
    }
    return {
      success: false,
      error: `Submission not confirmed: ${confirmation.reason}${humanInputFields.length > 0 ? ` | Human input needed: ${humanInputFields.join(", ")}` : ""}${failureSuffix}`,
      steps: totalSteps,
      recordingUrl: liveUrl,
      taskId: sessionId,
      failure,
    }
  } catch (error) {
    const { level, message } = classifyError(error)
    runErrors.push(message)
    console.error("[Kernel] Error:", error)
    if (applicationId) await persistLog(applicationId, level, `Fatal error: ${message}`)
    if (onStep) onStep({ status: "error", error: message })
    // Even a crash gets classified, so the queue can tell "our browser died"
    // (retry) from "the posting is gone" (don't).
    const d = diagnose({ errors: [message], pageText: lastBodyText, finalUrl: targetUrl })
    if (applicationId) {
      await persistLog(applicationId, "error", `Diagnosis [${d.failureClass}${d.permanent ? " · permanent" : " · retryable"}]: ${d.rootCause} → ${d.suggestedAction}`)
    }
    return { success: false, error: message, failure: d }
  } finally {
    // Close the timeline on every exit path — success, early return, or throw —
    // so a crashed run still leaves a readable record of where it got to.
    await run?.end()
    telemetryLogger?.stop()
    // Drain the log queue before the process can exit, so the tail of a run —
    // the audit verdict, the diagnosis, the confirmation — is never lost.
    await flushLogs()
    if (stagehand) { try { await stagehand.close() } catch {} }
    if (sessionId) {
      if (replayId) {
        try {
          await kernelClient.browsers.replays.stop(replayId, { id: sessionId })
          const replays = await kernelClient.browsers.replays.list(sessionId)
          const replayUrl = (replays as any)?.[0]?.replay_view_url
          if (replayUrl && applicationId) await persistLog(applicationId, "info", `Replay: ${replayUrl}`)
        } catch {}
      }
      if (pooled) {
        // Give the warm browser back, recreated. It is holding this candidate's
        // name, email and résumé in form state and history, so it must never be
        // handed to the next run as-is.
        await releasePooledBrowser(
          kernelClient,
          pooled,
          applicationId ? (level, message) => persistLog(applicationId, level, message) : undefined
        )
      } else {
        // deleteByID also persists profile state (save_changes:true) — must come after replay stop
        try { await kernelClient.browsers.deleteByID(sessionId) } catch {}
      }
      // Release the profile slot (or the legacy single lock) so the next run
      // for this user can write.
      if (profileSlot) await releaseProfileSlot(supabase, profileSlot)
      else if (userId) await releaseProfileLock(userId)
    }
  }
}
