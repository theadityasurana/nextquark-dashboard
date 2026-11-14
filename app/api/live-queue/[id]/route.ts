import { createAdminClient } from '@/lib/supabase/admin'
import { resolveResumeUrl } from '@/lib/application-runner'

// Queue rows are snapshots taken when the job was queued and are often sparse.
// These profile columns fill any field the queue row left empty.
const PROFILE_FALLBACK_FIELDS = [
  'email', 'phone', 'location', 'headline', 'bio', 'gender', 'ethnicity',
  'disability_status', 'veteran_status', 'work_authorization_status',
  'linkedin_url', 'github_url', 'resume_url', 'cover_letter',
  'skills', 'top_skills', 'experience', 'education', 'certifications', 'achievements',
  'job_preferences', 'work_mode_preferences', 'salary_currency', 'salary_min', 'salary_max',
] as const

function isEmpty(v: unknown) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

const IN_PROGRESS = ['pending', 'processing', 'awaiting_otp', 'awaiting_captcha']

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('live_application_queue')
      .select('*')
      .eq('id', id)
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    const row: Record<string, any> = { ...data }

    if (row.user_id) {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', row.user_id).maybeSingle()
      if (profile) {
        for (const key of PROFILE_FALLBACK_FIELDS) {
          if (isEmpty(row[key]) && !isEmpty((profile as any)[key])) row[key] = (profile as any)[key]
        }
        if (isEmpty(row.first_name) && profile.first_name) row.first_name = profile.first_name
        if (isEmpty(row.last_name) && profile.last_name) row.last_name = profile.last_name
      }

      // Per-candidate stats (the queue screen's stats are for the whole queue).
      const count = async (statuses?: string[]) => {
        let q = supabase.from('live_application_queue').select('id', { count: 'exact', head: true }).eq('user_id', row.user_id)
        if (statuses) q = q.in('status', statuses)
        const { count: c } = await q
        return c ?? 0
      }
      const [totalApps, successful, failed, inProgress] = await Promise.all([
        count(), count(['completed']), count(['failed', 'blocked']), count(IN_PROGRESS),
      ])
      row.user_stats = { totalApps, successful, failed, inProgress }

      // The column can be empty while the file sits in the candidate's storage folder.
      if (isEmpty(row.resume_url)) {
        const { data: files } = await supabase.storage.from('resumes').list(row.user_id, { limit: 20 })
        const stored = (files ?? []).map((f) => f.name).find((n) => /\.(pdf|docx?)$/i.test(n))
        if (stored) row.resume_url = stored
      }
    }

    // Signed URL works whether or not the bucket is public.
    const resumeUrl = resolveResumeUrl(row)
    row.resume_download_url = resumeUrl || null
    const marker = '/storage/v1/object/public/resumes/'
    if (resumeUrl.includes(marker)) {
      const path = decodeURIComponent(resumeUrl.split(marker)[1])
      const { data: signed } = await supabase.storage.from('resumes').createSignedUrl(path, 60 * 60, { download: true })
      if (signed?.signedUrl) row.resume_download_url = signed.signedUrl
    }

    return Response.json(row)
  } catch {
    return Response.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
