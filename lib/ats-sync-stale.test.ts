import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }))

import { pickStaleJobs } from "@/lib/ats-sync"
import { jobDedupeKey } from "@/lib/job-identity"

const gh = (n: number) => `https://boards.greenhouse.io/acme/jobs/${n}?gh_jid=${n}`
const row = (id: string, url: string | null) => ({ id, job_url: url, experience: null })

describe("pickStaleJobs", () => {
  it("retires postings that left the feed", () => {
    const live = new Set([jobDedupeKey(gh(1))])
    const { staleIds, keepByKey } = pickStaleJobs([row("a", gh(1)), row("b", gh(2))], live, new Set())
    expect(staleIds).toEqual(["b"])
    expect(keepByKey.get(jobDedupeKey(gh(1)))).toBe("a")
  })

  it("keeps one row per live posting, preferring the current stable id", () => {
    const live = new Set([jobDedupeKey(gh(1))])
    const rows = [row("S-old1", gh(1)), row("A-stable", gh(1)), row("S-old2", gh(1))]
    const { staleIds, keepByKey } = pickStaleJobs(rows, live, new Set(["A-stable"]))
    expect(keepByKey.get(jobDedupeKey(gh(1)))).toBe("A-stable")
    expect(staleIds.sort()).toEqual(["S-old1", "S-old2"])
  })

  it("falls back to the first row when no stable id matches", () => {
    const live = new Set([jobDedupeKey(gh(1))])
    const { staleIds, keepByKey } = pickStaleJobs([row("x", gh(1)), row("y", gh(1))], live, new Set())
    expect(keepByKey.get(jobDedupeKey(gh(1)))).toBe("x")
    expect(staleIds).toEqual(["y"])
  })

  it("treats URL variants of one posting as the same job and ignores url-less rows", () => {
    const live = new Set([jobDedupeKey(gh(1))])
    const rows = [row("a", gh(1)), row("b", "https://job-boards.greenhouse.io/acme/jobs/1"), row("c", null)]
    const { staleIds } = pickStaleJobs(rows, live, new Set(["a"]))
    expect(staleIds).toEqual(["b"])
  })
})
