import { describe, it, expect, beforeAll } from "vitest"

// lib/kernel builds a Supabase client at module scope, so the module cannot be
// imported until the environment it reads is present. Hence the deferred import
// rather than a top-level one — this is the only reason the file is shaped this
// way, and it is why kernel.ts has had no unit test until now.
let buildModelChain: (
  cua: boolean,
  keys: { openRouterKey: string; geminiKey: string; openAiKey: string; groqKey?: string },
  freeModels?: string[]
) => Array<{ label: string }>

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://stub.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "stub-service-role-key"
  ;({ buildModelChain } = await import("./kernel") as any)
})

// ─── Provider order is a cost and latency contract, not a preference ───
//
// A credit-exhausted OpenRouter account does not decline to be chosen; it
// returns HTTP 402 after a full round trip. So every OpenRouter entry sitting
// ahead of a working provider costs ~3.5s and buys nothing. One live run spent
// 32 such round trips — roughly two minutes — before Gemini answered each time.
const KEYS = { openRouterKey: "or-key", geminiKey: "gm-key", openAiKey: "oa-key" }

// The real shape of OpenRouter's free tier: most ids carry a vendor prefix that
// Stagehand's aiSDK layer cannot route. Only the google/* ones are usable here.
const FREE = [
  "minimax/minimax-m3:free",
  "dots-studio/dots-3-note-preview:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "z-ai/glm-5.2:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "openai/some-free-model:free",
]

const labels = (cua: boolean, keys: any = KEYS, free: string[] = FREE) =>
  buildModelChain(cua, keys, free).map((m) => m.label)

describe("buildModelChain", () => {
  it("puts direct Gemini ahead of every OpenRouter entry", () => {
    for (const cua of [false, true]) {
      const l = labels(cua)
      const gemini = l.indexOf("google/gemini-2.5-flash")
      const firstOpenRouter = l.findIndex((x) => x.startsWith("openrouter/"))
      expect(gemini, `cua=${cua}`).toBeGreaterThanOrEqual(0)
      expect(firstOpenRouter, `cua=${cua}`).toBeGreaterThan(gemini)
    }
  })

  it("orders the same way whether or not the portal needs Computer-Use", () => {
    expect(labels(false)).toEqual(labels(true))
  })

  it("still offers paid OpenRouter as a fallback rather than dropping it", () => {
    expect(labels(false).filter((x) => x.startsWith("openrouter/"))).toHaveLength(3)
  })

  // A zero-cost model that might answer beats a paid one returning HTTP 402.
  it("puts free OpenRouter models ahead of the paid ones", () => {
    const l = labels(false)
    const lastFree = l.map((x) => x.startsWith("openrouter-free/")).lastIndexOf(true)
    const firstPaid = l.findIndex((x) => x.startsWith("openrouter/"))
    expect(lastFree).toBeGreaterThan(0)
    expect(firstPaid).toBeGreaterThan(lastFree)
  })

  // Each Stagehand attempt re-sends a full accessibility tree, so an unbounded
  // list of unlikely models is expensive in latency even when every call is free.
  it("caps how many free models it will walk", () => {
    const free = labels(false, KEYS, [
      "google/a:free", "google/b:free", "openai/c:free", "google/d:free", "google/e:free",
    ]).filter((x) => x.startsWith("openrouter-free/"))
    expect(free).toHaveLength(4)
  })

  // Stagehand re-derives the provider from the vendor prefix and rejects anything
  // it does not recognise, so an unroutable id is not a long shot — it is a
  // guaranteed failure, and a slow one, in front of a model that works.
  it("offers Stagehand only free models it can actually route", () => {
    const free = labels(false).filter((x) => x.startsWith("openrouter-free/"))
    expect(free).toEqual([
      "openrouter-free/google/gemma-4-31b-it:free",
      "openrouter-free/google/gemma-4-26b-a4b-it:free",
      "openrouter-free/openai/some-free-model:free",
    ])
  })

  it("falls straight through to paid when no free model is routable", () => {
    const l = labels(false, KEYS, ["minimax/m:free", "z-ai/g:free", "nvidia/n:free"])
    expect(l.some((x) => x.startsWith("openrouter-free/"))).toBe(false)
    expect(l[0]).toBe("google/gemini-2.5-flash")
  })

  it("offers no free models when there is no OpenRouter key to call them with", () => {
    const l = labels(false, { openRouterKey: "", geminiKey: "gm-key", openAiKey: "" })
    expect(l.some((x) => x.includes("free"))).toBe(false)
  })

  it("survives an empty free list, as when the catalogue fetch failed", () => {
    const l = labels(false, KEYS, [])
    expect(l.some((x) => x.startsWith("openrouter-free/"))).toBe(false)
    expect(l.filter((x) => x.startsWith("openrouter/"))).toHaveLength(3)
  })

  it("degrades to OpenRouter alone when no direct key is configured", () => {
    const l = labels(false, { openRouterKey: "or-key", geminiKey: "", openAiKey: "" })
    expect(l).toHaveLength(6)
    expect(l.every((x) => x.startsWith("openrouter"))).toBe(true)
  })

  it("returns an empty chain when nothing is configured", () => {
    expect(labels(false, { openRouterKey: "", geminiKey: "", openAiKey: "" })).toEqual([])
  })
})

// ─── Groq leads every chain ───
describe("buildModelChain with Groq", () => {
  const WITH_GROQ = { ...KEYS, groqKey: "gsk-key" }

  it("puts Groq ahead of Gemini and everything else", () => {
    const l = labels(false, WITH_GROQ)
    expect(l[0]).toBe("groq/openai/gpt-oss-120b")
    expect(l[1]).toBe("groq/openai/gpt-oss-20b")
    expect(l.indexOf("google/gemini-2.5-flash")).toBe(2)
  })

  // Groq's ids are `openai/...` in its own catalogue, which is what lets
  // Stagehand route them without any rewriting.
  it("uses model ids Stagehand can route", async () => {
    const { isStagehandRoutableModel } = (await import("./kernel")) as any
    expect(isStagehandRoutableModel("openai/gpt-oss-120b")).toBe(true)
    expect(isStagehandRoutableModel("openai/gpt-oss-20b")).toBe(true)
  })

  it("keeps every other provider as a fallback behind it", () => {
    const l = labels(false, WITH_GROQ)
    expect(l.filter((x) => x.startsWith("groq/"))).toHaveLength(2)
    expect(l.some((x) => x.startsWith("openrouter-free/"))).toBe(true)
    expect(l.some((x) => x.startsWith("openrouter/"))).toBe(true)
  })

  it("falls back to the old order when no Groq key is set", () => {
    expect(labels(false)[0]).toBe("google/gemini-2.5-flash")
  })

  it("can run on Groq alone", () => {
    const l = labels(false, { openRouterKey: "", geminiKey: "", openAiKey: "", groqKey: "gsk-key" })
    expect(l).toEqual(["groq/openai/gpt-oss-120b", "groq/openai/gpt-oss-20b"])
  })
})
