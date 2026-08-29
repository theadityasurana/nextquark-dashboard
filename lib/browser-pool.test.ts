import { describe, expect, it } from "vitest"
import { isPoolable, POOLABLE_PORTALS, poolNameFor } from "./browser-pool"
import { buildV4ModelChain, pickStagehandModel } from "./stagehand-v4"
import { toInventoryItem } from "./extract-schemas"

describe("isPoolable", () => {
  it("pools the portals where nothing needs to survive the session", () => {
    // Public form at a direct URL, no account, nothing to remember.
    expect(isPoolable("Greenhouse")).toBe(true)
    expect(isPoolable("Lever")).toBe(true)
    expect(isPoolable("Ashby")).toBe(true)
  })

  it("never pools the portals that depend on persisted login state", () => {
    // A pooled browser loads its profile read-only and writes nothing back, so
    // pooling these would silently throw away the cookies that make them work.
    expect(isPoolable("Workday")).toBe(false)
    expect(isPoolable("LinkedIn")).toBe(false)
    expect(isPoolable("iCIMS")).toBe(false)
    expect(isPoolable("Unknown")).toBe(false)
  })

  it("gives each portal its own pool name", () => {
    const names = [...POOLABLE_PORTALS].map(poolNameFor)
    expect(new Set(names).size).toBe(names.length)
    expect(poolNameFor("Greenhouse")).toBe("nq-greenhouse")
  })
})

describe("buildV4ModelChain", () => {
  it("excludes OpenRouter entirely — v4 has no baseURL to point at it", () => {
    // An OpenRouter key here would be sent to Google's endpoint and rejected.
    const chain = buildV4ModelChain({})
    expect(chain).toHaveLength(0)
    expect(pickStagehandModel({})).toBeNull()
  })

  it("prefers Gemini when both direct keys exist", () => {
    const chain = buildV4ModelChain({ geminiKey: "g", openAiKey: "o" })
    expect(chain[0].modelName).toContain("google/")
    expect(chain.length).toBeGreaterThan(1)
  })

  it("offers more than one model, so an exhausted quota is a slowdown not an outage", () => {
    const chain = buildV4ModelChain({ openAiKey: "o" })
    expect(chain.length).toBeGreaterThan(1)
    expect(new Set(chain.map((m) => m.modelName)).size).toBe(chain.length)
  })

  it("carries the right key with each entry", () => {
    for (const m of buildV4ModelChain({ geminiKey: "gkey", openAiKey: "okey" })) {
      expect(m.apiKey).toBe(m.modelName.startsWith("google/") ? "gkey" : "okey")
      expect(m.label).toBeTruthy()
    }
  })
})

describe("toInventoryItem", () => {
  const field = (over = {}) => ({
    label: "Why do you want to work here?",
    kind: "textarea" as const,
    required: true,
    options: [],
    ...over,
  })

  it("namespaces the key so it cannot collide with a DOM or AX key", () => {
    // The fill loop tracks completion by key; a collision would mark the wrong
    // control done and leave a real field unfilled at the submit gate.
    const item = toInventoryItem(field(), 0)
    expect(item.key.startsWith("x:")).toBe(true)
  })

  it("gives distinct keys to distinct fields", () => {
    const a = toInventoryItem(field({ label: "First name" }), 0)
    const b = toInventoryItem(field({ label: "Last name" }), 1)
    expect(a.key).not.toBe(b.key)
  })

  it("strips required-marker asterisks from the label", () => {
    expect(toInventoryItem(field({ label: "Email *" }), 0).label).toBe("Email")
  })

  it("keeps only real options", () => {
    const item = toInventoryItem(field({ kind: "select" as const, options: ["Yes", "", "No"] }), 0)
    expect(item.options).toEqual(["Yes", "No"])
  })
})
