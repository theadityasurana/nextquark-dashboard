import { describe, expect, it } from "vitest"
import {
  buildSkillGuidance,
  parseDistilReply,
  piiClean,
  RETIRE_THRESHOLD,
  scoreAfterRun,
  selectSkills,
  shouldRetire,
  skillDomain,
  type DomainSkill,
} from "./domain-skills"

const skill = (over: Partial<DomainSkill> = {}): DomainSkill => ({
  id: "1",
  domain: "boards.greenhouse.io",
  content: "The apply form renders inside an iframe on company career pages.",
  version: 1,
  score: 0,
  status: "active",
  ...over,
})

describe("piiClean", () => {
  it("accepts durable site knowledge", () => {
    expect(piiClean("Lever forms need /apply appended to the posting URL.").clean).toBe(true)
  })

  it("rejects anything carrying personal data — these rows are shared across candidates", () => {
    expect(piiClean("Filled email as priya@example.com").clean).toBe(false)
    expect(piiClean("Phone +91 98765 43210 was accepted").clean).toBe(false)
    expect(piiClean("Use key sk-abc123def456ghi").clean).toBe(false)
    expect(piiClean("Address 221 Baker Street was entered").clean).toBe(false)
  })

  it("rejects a narration of the candidate rather than the site", () => {
    expect(piiClean("The candidate's resume parsed correctly.").clean).toBe(false)
    expect(piiClean("Answered yes to the sponsorship question.").clean).toBe(false)
  })

  it("names the reason it rejected something", () => {
    expect(piiClean("mail me at a@b.com").reason).toContain("email")
  })
})

describe("parseDistilReply", () => {
  it("accepts a worthwhile distillation", () => {
    const r = parseDistilReply('{"worth_saving":true,"content":"Workday loads each section asynchronously after Next; wait for the spinner to clear."}')
    expect(r.worthSaving).toBe(true)
    expect(r.content).toContain("asynchronously")
  })

  it("honours worth_saving:false — most routine runs teach nothing", () => {
    expect(parseDistilReply('{"worth_saving":false,"content":""}').worthSaving).toBe(false)
  })

  it("re-runs the PII gate, so nothing personal can reach storage through this path", () => {
    const r = parseDistilReply('{"worth_saving":true,"content":"The form pre-filled the email as someone@example.com automatically."}')
    expect(r.worthSaving).toBe(false)
    expect(r.rejectedReason).toContain("PII gate")
  })

  it("rejects distillations that are too short or too long to be useful", () => {
    expect(parseDistilReply('{"worth_saving":true,"content":"ok"}').worthSaving).toBe(false)
    const long = parseDistilReply(`{"worth_saving":true,"content":"${"a".repeat(700)}"}`)
    expect(long.worthSaving).toBe(false)
    expect(long.rejectedReason).toContain("characters")
  })

  it("returns nothing for unparseable output rather than storing garbage", () => {
    expect(parseDistilReply("no json here").worthSaving).toBe(false)
    expect(parseDistilReply(null).worthSaving).toBe(false)
  })
})

describe("scoring", () => {
  it("rewards a success by less than it punishes a failure over time", () => {
    // Successes cap; failures don't. A skill the site has outgrown reaches the
    // retire threshold quickly, while a skill that merely rode along on
    // successful runs cannot accumulate unbounded authority.
    expect(scoreAfterRun(0, true)).toBe(1)
    expect(scoreAfterRun(0, false)).toBe(-1)
    expect(scoreAfterRun(10, true)).toBe(10)
    expect(scoreAfterRun(-10, false)).toBe(-11)
  })

  it("retires at the threshold", () => {
    expect(shouldRetire(RETIRE_THRESHOLD)).toBe(true)
    expect(shouldRetire(RETIRE_THRESHOLD + 1)).toBe(false)
  })
})

describe("selectSkills", () => {
  it("excludes retired skills and orders by score then version", () => {
    const chosen = selectSkills([
      skill({ id: "a", score: 1, version: 1 }),
      skill({ id: "b", score: 5, version: 2 }),
      skill({ id: "c", score: 9, version: 1, status: "retired" }),
      skill({ id: "d", score: 5, version: 7 }),
    ])
    expect(chosen.map((s) => s.id)).toEqual(["d", "b", "a"])
  })

  it("caps how many are injected", () => {
    const many = Array.from({ length: 12 }, (_, i) => skill({ id: String(i), score: i }))
    expect(selectSkills(many).length).toBe(5)
  })
})

describe("buildSkillGuidance", () => {
  it("returns nothing when there is nothing learned", () => {
    expect(buildSkillGuidance([])).toBe("")
  })

  it("frames skills as overridable hints, not rules", () => {
    // A stale skill must never outrank what the model can see on the page now.
    const g = buildSkillGuidance([skill()])
    expect(g).toMatch(/hints, not rules/i)
    expect(g).toMatch(/believe the page/i)
  })
})

describe("skillDomain", () => {
  it("keeps the tenant subdomain for ATS hosts, where behaviour differs per tenant", () => {
    expect(skillDomain("https://acme.wd5.myworkdayjobs.com/en-US/careers/job/1")).toBe("acme.wd5.myworkdayjobs.com")
    expect(skillDomain("https://boards.greenhouse.io/acme/jobs/1")).toBe("boards.greenhouse.io")
  })

  it("reduces an ordinary career site to its registrable domain", () => {
    expect(skillDomain("https://careers.example.co/jobs/1")).toBe("example.co")
    expect(skillDomain("https://www.example.com/x")).toBe("example.com")
  })

  it("returns null for a malformed URL", () => {
    expect(skillDomain("not a url")).toBeNull()
  })
})
