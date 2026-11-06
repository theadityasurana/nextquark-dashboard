import { describe, it, expect } from "vitest"
import { heardAboutLabel, percentOf } from "./marketing"
import { isPersisted } from "./api-cache"

describe("heardAboutLabel", () => {
  it("names the values stored on profiles", () => {
    expect(heardAboutLabel("linkedin")).toBe("LinkedIn")
    expect(heardAboutLabel("know_founder")).toBe("Know the founder")
    expect(heardAboutLabel("friends_colleagues")).toBe("Friends / colleagues")
  })

  it("makes an unknown value readable", () => {
    expect(heardAboutLabel("college_fest")).toBe("College fest")
  })

  it("counts no answer as no answer", () => {
    expect(heardAboutLabel(null)).toBeNull()
    expect(heardAboutLabel("  ")).toBeNull()
  })
})

describe("percentOf", () => {
  it("never produces NaN", () => {
    expect(percentOf(0, 0)).toBe(0)
    expect(percentOf(1, 4)).toBe(25)
  })
})

describe("what is kept on disk", () => {
  it("keeps tab data", () => {
    for (const url of ["/api/overview?chartRange=24h", "/api/learning", "/api/companies?all=true", "/api/jobs?page=1&limit=20", "/api/download-analytics?range=all", "/api/users?funnel=1"]) {
      expect(isPersisted(url)).toBe(true)
    }
  })

  it("leaves lists of people in memory", () => {
    for (const url of ["/api/users", "/api/live-queue", "/api/applications/queue", "/api/logs", "/api/agents?page=1"]) {
      expect(isPersisted(url)).toBe(false)
    }
  })
})
