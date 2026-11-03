/**
 * Fill empty job fields from each job's own title + description, with the
 * same parser the ATS sync uses (lib/job-parser parseJobContent). Only empty
 * values are written — nothing that already has a value is touched:
 *   experience (null)            → title-first level, then the requirement text
 *   skills / requirements / benefits (empty)
 *   salary_range ("Competitive salary") → a range stated in the description
 *   education_level / work_authorization (null)
 * Jobs still without a level afterwards are queued for the LLM enrichment
 * (experience_enrichment_queue → enrich-experience).
 *
 *   bun scripts/backfill-missing-fields.ts            # dry run: counts + samples
 *   APPLY=1 bun scripts/backfill-missing-fields.ts    # write
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { parseJobContent, normalizeExperienceLevel } from '@/lib/job-parser'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.env.APPLY === '1'

const empty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
const fmtSalary = (min: string, max: string) =>
  min && max ? `$${Number(min).toLocaleString()} - $${Number(max).toLocaleString()}` : min ? `$${Number(min).toLocaleString()}+` : ''

const counts = { scanned: 0, patched: 0, experience: 0, skills: 0, requirements: 0, benefits: 0, salary: 0, education: 0, workAuth: 0, queued: 0 }
const samples: string[] = []
const PAGE = 200
let lastCreatedAt = '1970-01-01T00:00:00.000Z'

while (true) {
  const { data: jobs, error } = await supabase.from('jobs')
    .select('id, title, company_name, description, detailed_requirements, experience, skills, requirements, benefits, salary_range, education_level, work_authorization, created_at')
    .gt('created_at', lastCreatedAt)
    .order('created_at', { ascending: true }).limit(PAGE)
  if (error) throw error
  if (!jobs?.length) break
  const last = jobs[jobs.length - 1]
  // If all rows share the same timestamp, advance by 1ms to avoid infinite loop
  if (jobs.every(j => j.created_at === last.created_at)) {
    lastCreatedAt = new Date(new Date(last.created_at).getTime() + 1).toISOString()
  } else {
    lastCreatedAt = last.created_at
  }

  const updates: { id: string; patch: Record<string, unknown> }[] = []
  const toQueue: { job_id: string; job_title: string; company_name: string; status: string }[] = []
  for (const j of jobs) {
    counts.scanned++
    const needsWork = empty(j.experience) || empty(j.skills) || empty(j.requirements) || empty(j.benefits) ||
      empty(j.education_level) || empty(j.work_authorization) ||
      (empty(j.salary_range) || j.salary_range === 'Competitive salary')
    if (!needsWork) continue
    const text = [j.description, j.detailed_requirements].filter(Boolean).join('\n\n')
    const p = parseJobContent(text, j.title ?? '')
    const patch: Record<string, unknown> = {}
    if (empty(j.experience)) {
      const lvl = normalizeExperienceLevel(p.experienceLevel)
      if (lvl) { patch.experience = lvl; counts.experience++ }
      else toQueue.push({ job_id: j.id, job_title: j.title, company_name: j.company_name, status: 'pending' })
    }
    if (empty(j.skills) && p.skills.length) { patch.skills = p.skills; counts.skills++ }
    if (empty(j.requirements) && p.requirements.length) { patch.requirements = p.requirements; counts.requirements++ }
    if (empty(j.benefits) && p.benefits.length) { patch.benefits = p.benefits; counts.benefits++ }
    if ((empty(j.salary_range) || j.salary_range === 'Competitive salary') && (p.salaryMin || p.salaryMax)) {
      const s = fmtSalary(p.salaryMin, p.salaryMax)
      if (s) { patch.salary_range = s; counts.salary++ }
    }
    if (empty(j.education_level) && p.educationLevel) { patch.education_level = p.educationLevel; counts.education++ }
    if (empty(j.work_authorization) && p.workAuthorization) { patch.work_authorization = p.workAuthorization; counts.workAuth++ }
    if (Object.keys(patch).length) {
      updates.push({ id: j.id, patch })
      if (samples.length < 12) samples.push(`${j.title} → ${JSON.stringify({ ...patch, skills: (patch.skills as string[] | undefined)?.slice(0, 4) })}`)
    }
  }
  counts.patched += updates.length
  counts.queued += toQueue.length

  if (APPLY) {
    for (let i = 0; i < updates.length; i += 20) {
      await Promise.all(updates.slice(i, i + 20).map(u => supabase.from('jobs').update(u.patch).eq('id', u.id)))
    }
    if (toQueue.length) await supabase.from('experience_enrichment_queue').upsert(toQueue, { onConflict: 'job_id', ignoreDuplicates: true })
  }
  process.stdout.write(`\r${counts.scanned} scanned · ${counts.patched} to patch`)
}

console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}`, counts)
console.log(samples.join('\n'))
