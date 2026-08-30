/**
 * The ordered list of models a run will try, and the rules for giving up on one.
 *
 * Two failures motivated this. First, a dead key at the front of the chain cost
 * three doomed round-trips on EVERY field, because nothing distinguished "this
 * key is invalid" from "this request failed". Second, the chain was three paid
 * models deep: when the Gemini free tier hit its daily quota mid-run, every
 * remaining question went unanswered even though a dozen free models were sitting
 * there unused.
 *
 * So the chain is long, ordered by capability, and failures are CLASSIFIED:
 *
 *   auth      (401/403) — the credential is bad. Skip every attempt that shares
 *                         it, for the rest of the process. Retrying is pure waste.
 *   quota     (402/429) — this model is rate-limited or out of credit. Move to
 *                         the next model, but keep the key.
 *   transient (5xx, timeouts) — try the next model; this one may come back.
 *   bad-reply — the call succeeded but returned nothing usable.
 */

export type LlmProvider = "groq" | "openrouter" | "google" | "openai"

export interface LlmAttempt {
  /** Stable label for logs. */
  label: string
  provider: LlmProvider
  /** Provider-side model id. */
  model: string
  apiKey: string
  /** True for OpenRouter's zero-cost tier — used only as a fallback. */
  free?: boolean
  /** Whether the model advertises structured-output support. */
  json?: boolean
}

/**
 * OpenRouter's free tier, ordered by how well each model follows a strict JSON
 * instruction and how much context it has.
 *
 * Sourced from the live catalogue (`GET /api/v1/models`, filtered to zero
 * prompt+completion price) and ordered by hand: the ones advertising
 * `response_format` come first, because every call this codebase makes to a
 * fallback model asks for JSON keyed by question number, and a model that
 * cannot honour that returns prose we then have to discard.
 *
 * `refreshFreeModels()` re-reads the catalogue at run time; this list is the
 * offline default and the ordering preference.
 */
export const FREE_OPENROUTER_MODELS: string[] = [
  // JSON + tools, largest context first.
  "minimax/minimax-m3:free",
  "dots-studio/dots-3-note-preview:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "z-ai/glm-5.2:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "minimax/minimax-m2.7:free",
  // OpenRouter's own auto-router over the free tier — a good last resort
  // because it picks whatever is currently up.
  "openrouter/free",
  "liquid/lfm-2.5-2.6b:free",
  // Tool-capable but no declared JSON mode; still worth trying before failing.
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "thinkingmachines/inkling:free",
  "poolside/laguna-s-2.1:free",
  "inclusionai/ling-3.0-flash-fin:free",
]

/**
 * Gemini text models, ordered by capability.
 *
 * The free tier meters *per model* — a 429 reads
 * "limit: 20, model: gemini-2.5-flash" — so moving to the next model here gets a
 * fresh bucket immediately, where retrying the same one means waiting out the
 * minute. With a 20-requests-per-minute ceiling and a form that can need a dozen
 * model calls, a single-model chain hits the wall on almost every run; this list
 * is what keeps a run answering instead of stalling.
 *
 * Image, TTS and embedding variants are deliberately absent.
 */
export const GEMINI_TEXT_MODELS: string[] = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemma-4-31b-it",
  "gemma-4-26b-a4b-it",
  "gemini-2.5-pro",
]

/** How many newly-discovered free models to append beyond the curated list. */
const MAX_DISCOVERED_FREE_MODELS = 6

/** Hard ceiling on the whole attempt list, whatever the catalogue reports. */
export const MAX_CHAIN_LENGTH = 24

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

/**
 * Re-read OpenRouter's catalogue and return the currently-free model ids,
 * preferring the ordering above and appending anything new it finds.
 *
 * Best-effort: on any failure the static list is returned unchanged. The
 * catalogue endpoint needs no credentials, so this works even when the key is
 * the thing that is broken.
 */
export async function refreshFreeModels(timeoutMs = 6000): Promise<string[]> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/models`, { signal: ctl.signal })
    if (!res.ok) return FREE_OPENROUTER_MODELS
    const data = await res.json()
    const isFree = (m: any) =>
      String(m?.id || "").endsWith(":free") ||
      (["0", "0.0"].includes(String(m?.pricing?.prompt)) && ["0", "0.0"].includes(String(m?.pricing?.completion)))
    const live: string[] = (data?.data ?? []).filter(isFree).map((m: any) => String(m.id))
    if (live.length === 0) return FREE_OPENROUTER_MODELS
    const liveSet = new Set(live)
    // Keep our preferred order for models that still exist, then append the rest
    // sorted by context length so a newly-added large model is reachable.
    const preferred = FREE_OPENROUTER_MODELS.filter((m) => liveSet.has(m))
    const known = new Set(preferred)
    // Capped deliberately. `callLlm` walks the whole chain on every transient
    // failure, for every field — an uncapped catalogue (currently dozens of free
    // models, and growing) turns one unanswerable question into 70+ sequential
    // HTTP round trips and can outlast the browser session itself.
    const extras = (data.data as any[])
      .filter((m) => isFree(m) && !known.has(String(m.id)))
      .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
      .map((m) => String(m.id))
      .slice(0, MAX_DISCOVERED_FREE_MODELS)
    return [...preferred, ...extras]
  } catch {
    return FREE_OPENROUTER_MODELS
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Build the full ordered attempt list.
 *
 * Paid/primary models first, then the free tier. A key that has already been
 * proven dead is not included at all — that check belongs upstream, in the
 * health probe, so it happens once per run rather than once per field.
 */
export function buildLlmChain(keys: {
  openRouterKey?: string
  geminiKey?: string
  openAiKey?: string
  freeModels?: string[]
  geminiModels?: string[]
}): LlmAttempt[] {
  const out: LlmAttempt[] = []
  const { openRouterKey, geminiKey, openAiKey } = keys

  if (openRouterKey) {
    for (const m of ["openai/gpt-4o-mini", "openai/gpt-4.1-mini", "google/gemini-2.5-flash"]) {
      out.push({ label: `openrouter/${m}`, provider: "openrouter", model: m, apiKey: openRouterKey, json: true })
    }
  }
  if (geminiKey) {
    for (const m of keys.geminiModels ?? GEMINI_TEXT_MODELS) {
      out.push({ label: `google/${m}`, provider: "google", model: m, apiKey: geminiKey, json: true })
    }
  }
  if (openAiKey) {
    out.push({ label: "openai/gpt-4o-mini", provider: "openai", model: "gpt-4o-mini", apiKey: openAiKey, json: true })
  }
  // The free tier last: slower and less reliable, but it is the difference
  // between a question being answered and being left blank.
  if (openRouterKey) {
    for (const m of keys.freeModels ?? FREE_OPENROUTER_MODELS) {
      out.push({ label: `openrouter-free/${m}`, provider: "openrouter", model: m, apiKey: openRouterKey, free: true, json: true })
    }
  }
  // A chain longer than this is not resilience, it is a stall: every entry is
  // tried in order on each failure, and the tail is the least capable.
  return out.slice(0, MAX_CHAIN_LENGTH)
}

export type LlmFailure = "auth" | "quota" | "transient" | "bad-reply"

/** What an HTTP status means for whether the chain should keep using this key. */
export function classifyLlmStatus(status: number): LlmFailure {
  if (status === 401 || status === 403) return "auth"
  if (status === 402 || status === 429) return "quota"
  return "transient"
}

/**
 * Seconds Google says to wait, read out of a 429 body.
 *
 * Gemini returns a RetryInfo detail with a value like "59.9s". Honouring it is
 * what makes a final retry worth attempting instead of guessing at a backoff.
 * Returns null when the body says nothing useful.
 */
export function parseRetryDelaySeconds(body: unknown): number | null {
  try {
    const details = (body as any)?.error?.details
    if (Array.isArray(details)) {
      for (const d of details) {
        const v = d?.retryDelay
        if (typeof v === "string") {
          const n = parseFloat(v.replace(/s$/, ""))
          if (Number.isFinite(n)) return n
        }
      }
    }
    const msg = String((body as any)?.error?.message ?? "")
    const m = msg.match(/retry in ([\d.]+)\s*s/i)
    if (m) return parseFloat(m[1])
  } catch {}
  return null
}
