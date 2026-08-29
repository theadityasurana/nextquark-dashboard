/**
 * Persistence for domain skills — the IO seam around `domain-skills.ts`.
 *
 * Every function here is best-effort. A skill store that is unreachable (the
 * migration hasn't run, Supabase is briefly down) must degrade to "no learned
 * hints" rather than failing a run: these are an optimisation, never a
 * dependency.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildSkillGuidance,
  piiClean,
  scoreAfterRun,
  selectSkills,
  shouldRetire,
  type DomainSkill,
} from "./domain-skills"

interface SkillRow {
  id: string
  domain: string
  content: string
  version: number
  score: number
  status: string
  times_used: number | null
  created_at: string | null
}

function rowToSkill(r: SkillRow): DomainSkill {
  return {
    id: r.id,
    domain: r.domain,
    content: r.content,
    version: r.version,
    score: r.score,
    status: r.status === "retired" ? "retired" : "active",
    timesUsed: r.times_used ?? 0,
    createdAt: r.created_at ?? undefined,
  }
}

/** Every stored skill for a domain, active and retired. */
export async function loadSkills(supabase: SupabaseClient, domain: string): Promise<DomainSkill[]> {
  if (!domain) return []
  try {
    const { data, error } = await supabase
      .from("domain_skills")
      .select("id, domain, content, version, score, status, times_used, created_at")
      .eq("domain", domain)
    if (error) throw error
    return (data ?? []).map(rowToSkill)
  } catch (err) {
    console.warn("[domain-skills] load failed, continuing without learned hints:", err)
    return []
  }
}

/**
 * The guidance block for a domain, plus the ids that produced it.
 *
 * Returning the ids is what makes feedback possible: only the skills actually
 * injected into a run should be scored by that run's outcome.
 */
export async function loadSkillGuidance(
  supabase: SupabaseClient,
  domain: string
): Promise<{ guidance: string; usedIds: string[]; skills: DomainSkill[] }> {
  const all = await loadSkills(supabase, domain)
  const selected = selectSkills(all)
  return {
    guidance: buildSkillGuidance(selected),
    usedIds: selected.map((s) => s.id!).filter(Boolean),
    skills: selected,
  }
}

/**
 * Store a distilled skill as the next version for its domain.
 *
 * Two guards, both of which have to live at the write boundary rather than at
 * the call site:
 *
 *  - the **PII gate** is re-run here even though `parseDistilReply` already ran
 *    it, so no future caller can reach the table by another path
 *  - **content dedup**, because the distiller runs after every run and an
 *    unchanged site keeps producing the same sentence. Without this the table
 *    grows without bound and the guidance block fills with duplicates.
 */
export async function recordSkill(
  supabase: SupabaseClient,
  domain: string,
  content: string
): Promise<DomainSkill | null> {
  const gate = piiClean(content)
  if (!gate.clean) {
    console.warn(`[domain-skills] refused to store a skill for ${domain}: ${gate.reason}`)
    return null
  }

  try {
    const existing = await loadSkills(supabase, domain)

    const normalized = content.toLowerCase().replace(/\s+/g, " ").trim()
    const duplicate = existing.find(
      (s) => s.status === "active" && s.content.toLowerCase().replace(/\s+/g, " ").trim() === normalized
    )
    if (duplicate) return duplicate

    const nextVersion = existing.reduce((max, s) => Math.max(max, s.version), 0) + 1

    const { data, error } = await supabase
      .from("domain_skills")
      .insert({
        domain,
        content,
        version: nextVersion,
        score: 0,
        status: "active",
        times_used: 0,
      })
      .select("id, domain, content, version, score, status, times_used, created_at")
      .single()
    if (error) throw error
    return rowToSkill(data as SkillRow)
  } catch (err) {
    console.warn("[domain-skills] record failed (non-fatal):", err)
    return null
  }
}

/**
 * Feed a run's outcome back into the skills it used, retiring any that fall
 * below the threshold.
 *
 * Only the skills injected into that run are scored — a skill that wasn't shown
 * to the model cannot be blamed for what the model did.
 */
export async function recordSkillFeedback(
  supabase: SupabaseClient,
  usedIds: string[],
  succeeded: boolean
): Promise<void> {
  if (!usedIds.length) return
  await Promise.all(
    usedIds.map(async (id) => {
      try {
        const { data } = await supabase
          .from("domain_skills")
          .select("score, times_used")
          .eq("id", id)
          .maybeSingle()
        if (!data) return
        const score = scoreAfterRun(Number(data.score ?? 0), succeeded)
        await supabase
          .from("domain_skills")
          .update({
            score,
            times_used: Number(data.times_used ?? 0) + 1,
            status: shouldRetire(score) ? "retired" : "active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
      } catch {
        // Scoring is telemetry — never surface into the run's result.
      }
    })
  )
}
