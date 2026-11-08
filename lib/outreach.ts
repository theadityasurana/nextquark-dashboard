/**
 * Sales & Outreach: founder-voice WhatsApp drafts for recent signups.
 *
 * The message never pitches or mentions price. It introduces Aditya as the
 * founder, references what the person did in the app, asks for short feedback,
 * and asks what they are after (exploring, laid off, fresher, switching).
 */

export const MAX_WORDS = 100

export interface OutreachProfile {
  userId: string
  firstName: string
  headline?: string | null
  desiredRoles?: string[]
  experienceLevel?: string | null
  userType?: string | null
  location?: string | null
  topSkills?: string[]
  jobsApplied: number
  jobsSwiped: number
  companies: string[]
}

export interface FormattedPhone {
  display: string
  /** Digits only, with country code, as wa.me expects. */
  waDigits: string
  countryCode: string
  national: string
  /** True when the country code was not stored and +91 was inferred. */
  assumedCountryCode: boolean
}

export function formatPhone(rawPhone: string | null | undefined, rawCountryCode: string | null | undefined): FormattedPhone | null {
  const raw = (rawPhone || "").trim()
  if (!raw) return null
  let digits = raw.replace(/\D/g, "")
  if (digits.length < 7) return null
  const ccDigits = (rawCountryCode || "").replace(/\D/g, "")

  let cc = ""
  let national = digits
  let assumed = false
  if (raw.startsWith("+") || raw.startsWith("00")) {
    if (raw.startsWith("00")) digits = digits.slice(2)
    // Stored with its own country code; split using the stored code when it matches.
    if (ccDigits && digits.startsWith(ccDigits)) {
      cc = ccDigits
      national = digits.slice(ccDigits.length)
    } else if (digits.startsWith("91") && digits.length === 12) {
      cc = "91"
      national = digits.slice(2)
    } else if (digits.startsWith("1") && digits.length === 11) {
      cc = "1"
      national = digits.slice(1)
    } else {
      cc = ""
      national = digits
    }
  } else if (ccDigits) {
    cc = ccDigits
    // Some rows store the code inside the number as well.
    national = digits.length > 10 && digits.startsWith(ccDigits) ? digits.slice(ccDigits.length) : digits
    if (national.startsWith("0")) national = national.replace(/^0+/, "")
  } else if (digits.length === 12 && digits.startsWith("91")) {
    cc = "91"
    national = digits.slice(2)
  } else if (digits.length === 10 && /^[6-9]/.test(digits)) {
    cc = "91"
    national = digits
    assumed = true
  } else if (digits.length === 11 && digits.startsWith("0")) {
    cc = "91"
    national = digits.slice(1)
    assumed = true
  } else {
    national = digits
  }

  const waDigits = `${cc}${national}`
  const grouped = national.length === 10 ? `${national.slice(0, 5)} ${national.slice(5)}` : national
  return {
    display: cc ? `+${cc} ${grouped}` : grouped,
    waDigits,
    countryCode: cc ? `+${cc}` : "",
    national,
    assumedCountryCode: assumed,
  }
}

export function whatsappLink(phone: FormattedPhone | null, message?: string | null): string | null {
  if (!phone || !phone.countryCode) return null
  const text = message ? `?text=${encodeURIComponent(message)}` : ""
  return `https://wa.me/${phone.waDigits}${text}`
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Hard cap, in case a model ignores the limit. Cuts at the last sentence that fits. */
export function capWords(text: string, max = MAX_WORDS): string {
  const clean = text.trim()
  if (countWords(clean) <= max) return clean
  const words = clean.split(/\s+/).slice(0, max).join(" ")
  const lastStop = Math.max(words.lastIndexOf(". "), words.lastIndexOf("? "), words.lastIndexOf("! "))
  return lastStop > words.length * 0.5 ? words.slice(0, lastStop + 1) : `${words}…`
}

function activityLine(p: OutreachProfile): string {
  if (p.jobsApplied > 0) {
    const where = p.companies.length ? ` (including ${p.companies.slice(0, 2).join(" and ")})` : ""
    return `I see you've applied to ${p.jobsApplied} job${p.jobsApplied === 1 ? "" : "s"} on Iris${where}`
  }
  if (p.jobsSwiped > 0) return `I see you've swiped through ${p.jobsSwiped} job${p.jobsSwiped === 1 ? "" : "s"} on Iris`
  return "I see you signed up for Iris recently"
}

/** Used when every model fails, so a row always has something sendable. */
export function fallbackMessage(p: OutreachProfile): string {
  return capWords(
    `Hi ${p.firstName}, I'm Aditya, the founder of Iris. ${activityLine(p)}, thanks for trying it out! ` +
      `Would love your quick, honest feedback: what worked and what felt off? ` +
      `Also curious what brings you here: just exploring, recently laid off, a fresher looking for your first role, or switching jobs?`
  )
}

function describe(p: OutreachProfile): Record<string, unknown> {
  return {
    id: p.userId,
    first_name: p.firstName,
    jobs_applied: p.jobsApplied,
    jobs_swiped: p.jobsSwiped,
    companies_applied: p.companies.slice(0, 3),
    headline: p.headline || undefined,
    desired_roles: p.desiredRoles?.slice(0, 3),
    experience_level: p.experienceLevel || undefined,
    user_type: p.userType || undefined,
    location: p.location || undefined,
    top_skills: p.topSkills?.slice(0, 4),
  }
}

export function buildPrompt(profiles: OutreachProfile[]): string {
  return `You write short WhatsApp messages from Aditya, the founder of Iris, a job app where people swipe right on jobs and an AI agent applies for them.

Write one message per user below. Rules for every message:
- Start with "Hi <first_name>," then introduce: "I'm Aditya, the founder of Iris."
- Mention what they did, using the real numbers: jobs_applied if above 0 ("I see you've applied to N jobs"), otherwise jobs_swiped, otherwise that they signed up recently. You may name one company they applied to (for exactly 1 job, say "applied to a job at <company>", not "1 job, including").
- Ask for their quick feedback in one short line.
- Ask what they are after: just exploring, recently laid off, a fresher looking for a first role, or switching jobs. Tailor the options to their profile (e.g. a student or fresher vs. an experienced person).
- One light personal touch from their profile (role, skills, or city) if it fits naturally.
- Do NOT pitch, sell, mention premium, plans, prices, or payment.
- Warm, casual, human, like a founder texting personally. No emojis overload (one at most), no hashtags, no em dashes, no sign-off line.
- Under ${MAX_WORDS} words, ideally 50 to 75.

Users (JSON):
${JSON.stringify(profiles.map(describe), null, 1)}

Reply with ONLY a JSON array: [{"id": "<id>", "message": "<text>"}], one entry per user, same ids.`
}

export function parseMessages(text: string): Map<string, string> {
  const out = new Map<string, string>()
  const start = text.indexOf("[")
  const end = text.lastIndexOf("]")
  if (start < 0 || end <= start) return out
  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as Array<{ id?: unknown; message?: unknown }>
    for (const item of arr) {
      if (typeof item?.id === "string" && typeof item?.message === "string" && item.message.trim()) {
        out.set(item.id, capWords(item.message))
      }
    }
  } catch {
    // Malformed JSON: the caller falls back to the next model.
  }
  return out
}

export interface LlmKeys {
  gemini?: string
  groq?: string
  openRouter?: string
}

type Attempt = { label: string; call: (prompt: string) => Promise<string> }

function attempts(keys: LlmKeys): Attempt[] {
  const list: Attempt[] = []
  if (keys.gemini) {
    for (const model of ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]) {
      list.push({
        label: `google/${model}`,
        call: async (prompt) => {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys.gemini}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
            }),
          })
          if (!res.ok) throw new Error(`${model} ${res.status}`)
          const data = await res.json()
          return (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text || "").join("")
        },
      })
    }
  }
  const chat = (label: string, url: string, key: string, model: string): Attempt => ({
    label,
    call: async (prompt) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, temperature: 0.8, messages: [{ role: "user", content: prompt }] }),
      })
      if (!res.ok) throw new Error(`${label} ${res.status}`)
      const data = await res.json()
      return data?.choices?.[0]?.message?.content || ""
    },
  })
  if (keys.groq) {
    list.push(chat("groq/openai/gpt-oss-120b", "https://api.groq.com/openai/v1/chat/completions", keys.groq, "openai/gpt-oss-120b"))
    list.push(chat("groq/openai/gpt-oss-20b", "https://api.groq.com/openai/v1/chat/completions", keys.groq, "openai/gpt-oss-20b"))
  }
  if (keys.openRouter) {
    list.push(chat("openrouter/openrouter/free", "https://openrouter.ai/api/v1/chat/completions", keys.openRouter, "openrouter/free"))
  }
  return list
}

export interface DraftResult {
  userId: string
  message: string
  model: string
}

/**
 * Drafts messages in batches (one LLM call per batch, to stay inside free-tier
 * request limits). Users a model skips are retried on the next model, and any
 * still missing at the end get the template.
 */
export async function draftMessages(profiles: OutreachProfile[], keys: LlmKeys, batchSize = 8): Promise<DraftResult[]> {
  const chain = attempts(keys)
  const results: DraftResult[] = []
  for (let i = 0; i < profiles.length; i += batchSize) {
    let pending = profiles.slice(i, i + batchSize)
    for (const attempt of chain) {
      if (!pending.length) break
      try {
        const got = parseMessages(await attempt.call(buildPrompt(pending)))
        for (const p of pending) {
          const message = got.get(p.userId)
          if (message) results.push({ userId: p.userId, message, model: attempt.label })
        }
        pending = pending.filter((p) => !got.has(p.userId))
      } catch (err) {
        console.error(`[outreach] ${attempt.label} failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    for (const p of pending) results.push({ userId: p.userId, message: fallbackMessage(p), model: "template" })
  }
  return results
}
