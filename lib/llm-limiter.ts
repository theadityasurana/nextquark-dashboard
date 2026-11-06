/**
 * Shared LLM rate limiting across every application running in this process.
 *
 * Each run used to learn about a rate limit on its own, so five parallel forms
 * all walked into the same 429 on every field, and each 429 through Stagehand
 * cost about 7 seconds of its internal retries. This keeps one view per model:
 *
 *   - Budget: stop before a free tier's per-minute limit is reached.
 *   - Concurrency: cap in-flight calls so a burst cannot spend the budget at once.
 *   - Cooldown: one run's 429 takes the model out of rotation for all of them.
 *
 * A model without capacity is skipped rather than waited on, because the next
 * one in the chain usually has room. Callers wait only when none do.
 */

export type LlmProviderName = "groq" | "google" | "openrouter" | "openai"

interface ProviderLimit {
  concurrent: number
  requestsPerMinute: number
  tokensPerMinute: number
}

const PROVIDER_LIMITS: Record<LlmProviderName, ProviderLimit> = {
  // Read from Groq's x-ratelimit headers: 8000 tokens per minute, per model.
  groq: { concurrent: 3, requestsPerMinute: 30, tokensPerMinute: 8000 },
  google: { concurrent: 3, requestsPerMinute: 10, tokensPerMinute: Infinity },
  // OpenRouter's free-tier request limit applies across all of its free models.
  openrouter: { concurrent: 4, requestsPerMinute: 18, tokensPerMinute: Infinity },
  openai: { concurrent: 5, requestsPerMinute: 60, tokensPerMinute: Infinity },
}

const WINDOW_MS = 60_000
const DEFAULT_COOLDOWN_SECONDS = 30
const DAILY_COOLDOWN_SECONDS = 3600

/** Seconds to rest a model, from the text of its rate-limit or credit error. */
export function cooldownSeconds(message: string): number {
  if (/per ?day|perday|daily|requests per day|\brpd\b|more credits|insufficient|\b402\b/i.test(message)) {
    return DAILY_COOLDOWN_SECONDS
  }
  const seconds = message.match(/(?:retry|try again)(?: in)?[^0-9]{0,12}(?:(\d+)m)?\s*(\d+(?:\.\d+)?)\s*s/i)
  if (seconds) return Math.ceil(Number(seconds[1] || 0) * 60 + Number(seconds[2])) + 1
  return DEFAULT_COOLDOWN_SECONDS
}

interface Bucket {
  active: number
  calls: Array<{ at: number; tokens: number }>
}

export class LlmLimiter {
  private buckets = new Map<string, Bucket>()
  private coolingUntil = new Map<string, number>()

  constructor(private now: () => number = Date.now) {}

  /** OpenRouter's limit is account-wide, so all of its free models share one bucket. */
  private bucketFor(model: string, provider: LlmProviderName): Bucket {
    const key = provider === "openrouter" ? "openrouter" : model
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = { active: 0, calls: [] }
      this.buckets.set(key, bucket)
    }
    const cutoff = this.now() - WINDOW_MS
    bucket.calls = bucket.calls.filter((c) => c.at > cutoff)
    return bucket
  }

  /** Claim capacity for one call. Returns its release function, or null to skip this model. */
  tryStart(model: string, provider: LlmProviderName, estimatedTokens: number): (() => void) | null {
    if ((this.coolingUntil.get(model) ?? 0) > this.now()) return null
    const limit = PROVIDER_LIMITS[provider]
    const bucket = this.bucketFor(model, provider)
    if (bucket.active >= limit.concurrent) return null
    if (bucket.calls.length >= limit.requestsPerMinute) return null
    const used = bucket.calls.reduce((sum, c) => sum + c.tokens, 0)
    // An idle model always gets a turn, even for a prompt larger than its budget.
    if (bucket.calls.length > 0 && used + estimatedTokens > limit.tokensPerMinute) return null

    bucket.active++
    bucket.calls.push({ at: this.now(), tokens: estimatedTokens })
    let released = false
    return () => {
      if (!released) bucket.active--
      released = true
    }
  }

  noteRateLimited(model: string, message: string): void {
    const until = this.now() + cooldownSeconds(message) * 1000
    this.coolingUntil.set(model, Math.max(until, this.coolingUntil.get(model) ?? 0))
  }

  /** Milliseconds until any of these models might have capacity. */
  msUntilAvailable(models: Array<{ model: string; provider: LlmProviderName }>): number {
    const now = this.now()
    let best = Infinity
    for (const { model, provider } of models) {
      const cooling = Math.max(0, (this.coolingUntil.get(model) ?? 0) - now)
      const bucket = this.bucketFor(model, provider)
      const windowClears = bucket.calls.length ? bucket.calls[0].at + WINDOW_MS - now : 0
      const atCapacity = bucket.calls.length >= PROVIDER_LIMITS[provider].requestsPerMinute
      const busy = bucket.active >= PROVIDER_LIMITS[provider].concurrent
      best = Math.min(best, Math.max(cooling, atCapacity ? windowClears : 0, busy ? 1000 : 0))
    }
    return best
  }
}

/** One limiter per process, so all concurrent runs in a worker share it. */
export const llmLimiter = new LlmLimiter()

/** The longest a call waits for capacity before reporting that no model answered. */
export const MAX_LLM_WAIT_MS = 60_000
/** Stagehand re-sends the page's accessibility tree, so its calls are the expensive ones. */
export const STAGEHAND_CALL_TOKENS = 3000
export const estimateTokens = (text: string, maxOutput: number) => Math.ceil(text.length / 4) + maxOutput
