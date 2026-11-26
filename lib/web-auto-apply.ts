// Iris auto-apply for people who pay on the WEBSITE (credits in web_subscriptions).
//
// The app's iris-auto-apply edge function only counts app credits (profiles.applications_remaining),
// so website subscribers were always skipped. This runner covers exactly them: iris_enabled, no app
// credits, live website credits. It applies only to jobs from the person's own job cache
// (user_job_cache, built by the prefetch-jobs edge function from their desired roles), and each
// application spends one of their own website credits. No credits are created.
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_PER_DAY = 10

const PROFILE_FIELDS = 'id, full_name, experience_level, skills, experience, education, desired_roles, desired_role_categories, work_mode_preferences, preferred_cities, headline, location, bio, phone, country_code, gender, linkedin_url, github_url, veteran_status, disability_status, ethnicity, resume_url, salary_currency, job_preferences, certifications, achievements, top_skills, applications_remaining, iris_preferences, swiped_job_ids'

type Job = { id: string; job_title?: string; title?: string; company_name?: string; company?: string; job_url?: string; portal_url?: string }
export type RunResult = { userId: string; applied: number; skipped?: string; jobs?: string[] }

async function cachedJobs(db: ReturnType<typeof createAdminClient>, userId: string): Promise<Job[]> {
  const { data } = await db.from('user_job_cache').select('jobs').eq('user_id', userId).eq('tab', 'unified').maybeSingle()
  return Array.isArray(data?.jobs) ? (data!.jobs as Job[]) : []
}

// Experience level → feed levels (same mapping the app's feed jobs use).
const EXP_LEVEL_MAP: Record<string, string[]> = {
  internship: ['Internship'], entry_level: ['Entry Level'], junior: ['Mid Level', 'Senior Level'],
  mid: ['Mid Level', 'Senior Level'], senior: ['Senior Level', 'Lead', 'Principal'], expert: ['Director', 'VP', 'C-Level'],
}

/**
 * Rebuild the person's job cache from their desired roles with the same search the app's
 * feed jobs use (search_jobs), and save it to user_job_cache. (prefetch-jobs passes app-style
 * swipe ids to search_jobs and comes back empty for some people, so we filter those here.)
 */
async function refreshCache(db: ReturnType<typeof createAdminClient>, user: { id: string; desired_roles?: unknown; experience_level?: unknown }): Promise<void> {
  const roles = (Array.isArray(user.desired_roles) ? user.desired_roles : []).filter((r): r is string => typeof r === 'string' && r.length > 3)
  if (!roles.length) return
  const params: Record<string, unknown> = { p_tab: 'unified', p_limit: 40, p_offset: 0, p_company_cap: 1, p_title_keywords: roles }
  const exp = EXP_LEVEL_MAP[String(user.experience_level || '')]
  if (exp?.length) params.p_exp_exact = exp
  let { data, error } = await db.rpc('search_jobs', params)
  if ((error || !data?.length) && params.p_exp_exact) {
    delete params.p_exp_exact
    ;({ data, error } = await db.rpc('search_jobs', params))
  }
  if (error || !Array.isArray(data) || !data.length) return
  await db.from('user_job_cache').upsert({ user_id: user.id, tab: 'unified', jobs: data, fetched_at: new Date().toISOString(), notified: false }, { onConflict: 'user_id,tab' })
}

export async function runWebAutoApply(opts: { userId?: string; dryRun?: boolean } = {}): Promise<RunResult[]> {
  const db = createAdminClient()

  // Live website plans with credits left.
  let wq = db.from('web_subscriptions').select('user_id, status, credits_remaining, current_period_end').gt('credits_remaining', 0).in('status', ['active', 'cancelled'])
  if (opts.userId) wq = wq.eq('user_id', opts.userId)
  const { data: plans, error: pErr } = await wq
  if (pErr) throw new Error(pErr.message)
  const live = (plans ?? []).filter(w => !w.current_period_end || new Date(w.current_period_end).getTime() > Date.now())
  if (!live.length) return opts.userId ? [{ userId: opts.userId, applied: 0, skipped: 'no live website credits' }] : []
  const webLeft = new Map(live.map(w => [w.user_id as string, w.credits_remaining as number]))

  const { data: users, error: uErr } = await db.from('profiles').select(PROFILE_FIELDS).in('id', [...webLeft.keys()]).eq('iris_enabled', true)
  if (uErr) throw new Error(uErr.message)

  const results: RunResult[] = []
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)

  for (const user of users ?? []) {
    const id = user.id as string
    try {
      // App subscribers are handled by the app's own iris-auto-apply; don't apply twice.
      if ((user.applications_remaining ?? 0) > 0) { results.push({ userId: id, applied: 0, skipped: 'has app credits (app runner handles them)' }); continue }

      const prefs = (user.iris_preferences ?? {}) as { dailyLimit?: number; blocked?: string[]; pauseWeekends?: boolean }
      const day = new Date().getUTCDay()
      if (prefs.pauseWeekends === true && (day === 0 || day === 6)) { results.push({ userId: id, applied: 0, skipped: 'weekends paused' }); continue }
      const dailyLimit = Math.min(typeof prefs.dailyLimit === 'number' ? prefs.dailyLimit : MAX_PER_DAY, MAX_PER_DAY)
      const blocked = (prefs.blocked ?? []).map(b => String(b).toLowerCase()).filter(Boolean)

      const { count: doneToday } = await db.from('live_application_queue').select('id', { count: 'exact', head: true })
        .eq('user_id', id).eq('applied_by', 'iris').gte('applied_at', today.toISOString())
      const want = Math.min(dailyLimit - (doneToday ?? 0), webLeft.get(id) ?? 0)
      if (want <= 0) { results.push({ userId: id, applied: 0, skipped: 'daily limit reached or no credits' }); continue }

      const { data: existing } = await db.from('live_application_queue').select('job_id').eq('user_id', id)
      const exclude = new Set<string>([...(existing ?? []).map(r => r.job_id as string), ...((user.swiped_job_ids as string[] | null) ?? [])])
      const pick = (jobs: Job[]) => {
        const seen = new Set<string>()
        return jobs.filter(j => {
          if (!j?.id || exclude.has(j.id) || seen.has(j.id)) return false
          seen.add(j.id)
          const co = String(j.company_name || j.company || '').toLowerCase()
          return !blocked.some(b => co.includes(b) || (co && b.includes(co)))
        })
      }

      let candidates = pick(await cachedJobs(db, id))
      if (candidates.length < want) {
        await refreshCache(db, user as { id: string; desired_roles?: unknown; experience_level?: unknown })
        candidates = pick(await cachedJobs(db, id))
      }
      const chosen = candidates.slice(0, want)
      if (!chosen.length) { results.push({ userId: id, applied: 0, skipped: 'no new jobs in their job cache' }); continue }
      if (opts.dryRun) { results.push({ userId: id, applied: 0, skipped: 'dry run', jobs: chosen.map(j => `${j.job_title || j.title} @ ${j.company_name || j.company}`) }); continue }

      const [firstName, ...rest] = String(user.full_name || '').trim().split(' ')
      const desiredRoles = (user.desired_roles as string[] | null) ?? (user.desired_role_categories as string[] | null) ?? []
      let applied = 0
      const titles: string[] = []
      for (const job of chosen) {
        // Spend the credit first; only queue the application if it was spent.
        const { data: spent } = await db.rpc('consume_web_credit_for', { p_user_id: id })
        if (spent !== true) break
        const now = new Date().toISOString()
        const { error } = await db.from('live_application_queue').insert({
          user_id: id, job_id: job.id,
          first_name: firstName || '', last_name: rest.join(' ') || '',
          gender: user.gender ?? null, phone: user.phone ?? null, country_code: user.country_code ?? null,
          location: user.location ?? null, headline: user.headline ?? null, bio: user.bio ?? null,
          resume_url: user.resume_url ?? null, linkedin_url: user.linkedin_url ?? null, github_url: user.github_url ?? null,
          veteran_status: user.veteran_status ?? null, disability_status: user.disability_status ?? null, ethnicity: user.ethnicity ?? null,
          skills: user.skills ?? [], top_skills: user.top_skills ?? [], experience: user.experience ?? [], education: user.education ?? [],
          certifications: user.certifications ?? [], achievements: user.achievements ?? [],
          job_preferences: user.job_preferences ?? [], work_mode_preferences: user.work_mode_preferences ?? [],
          salary_currency: user.salary_currency ?? null, salary_min: null, salary_max: null,
          desired_roles: desiredRoles, preferred_cities: user.preferred_cities ?? [],
          company_name: job.company_name || job.company || null,
          job_title: job.job_title || job.title || null,
          job_url: job.job_url || job.portal_url || null,
          status: 'pending', applied_at: now, applied_by: 'iris',
          progress_timestamps: JSON.stringify([now]),
        })
        if (error) {
          // Give the credit back if the application couldn't be queued.
          const { data: w } = await db.from('web_subscriptions').select('credits_remaining').eq('user_id', id).single()
          if (w) await db.from('web_subscriptions').update({ credits_remaining: (w.credits_remaining as number) + 1, updated_at: now }).eq('user_id', id)
          continue
        }
        await db.rpc('increment_right_swipe', { job_id: job.id }).then(() => {}, () => {})
        applied++
        titles.push(`${job.job_title || job.title} @ ${job.company_name || job.company}`)
      }
      results.push({ userId: id, applied, jobs: titles })
    } catch (e) {
      results.push({ userId: id, applied: 0, skipped: `error: ${e instanceof Error ? e.message : String(e)}` })
    }
  }
  return results
}
