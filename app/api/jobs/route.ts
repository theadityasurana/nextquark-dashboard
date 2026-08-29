import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { normalizeExperienceLevel, normalizeJobType } from '@/lib/job-parser'

export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)

  const page      = parseInt(searchParams.get('page')  || '1')
  const limit     = parseInt(searchParams.get('limit') || '20')
  const companyId = searchParams.get('companyId')
  const all       = searchParams.get('all') === 'true'
  const from      = (page - 1) * limit

  let query = supabase
    .from('jobs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (companyId) query = query.eq('company_id', companyId)
  if (!all)      query = query.range(from, from + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[jobs] GET error:', error.message)
    return NextResponse.json({ data: [], total: 0 })
  }

  return NextResponse.json({ data: data || [], total: count || 0 })
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json()

  const initial   = body.company_initial || 'J'
  const randomNum = String(Math.floor(Math.random() * 999)).padStart(3, '0')
  const jobId     = `${initial}-${randomNum}`
  const companyId = body.company_id && body.company_id.length > 0 ? body.company_id : null

  const insertData: Record<string, unknown> = {
    id: jobId,
    company_id: companyId,
    company_name: body.company_name || 'Unknown',
    company_initial: body.company_initial || '',
    title: body.title,
    location: body.location || 'Remote',
    type: normalizeJobType(body.type),
    salary_range: body.salary_range || 'Competitive salary',
    experience: normalizeExperienceLevel(body.experience),
    portal_url: body.portal_url || '',
    job_url: body.job_url || '',
    company_website: body.company_website || null,
    company_linkedin: body.company_linkedin || null,
    status: 'queued',
    total_apps: 0,
    right_swipes: 0,
    success_rate: 0,
    avg_time: '-',
    posted_at: new Date().toISOString().split('T')[0],
    description: body.description || '',
    requirements: body.requirements || [],
    skills: body.skills || [],
    benefits: body.benefits || [],
    detailed_requirements: body.detailed_requirements || '',
    education_level: body.education_level || null,
    work_authorization: body.work_authorization || null,
  }

  const { data, error } = await supabase.from('jobs').insert(insertData).select().single()

  if (error) {
    console.error('[jobs] POST insert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Atomic increment — avoids the read-modify-write race condition where two
  // concurrent inserts both read total_jobs=5 and both write 6 instead of 7.
  if (companyId) {
    await supabase.rpc('increment_company_jobs', { company_id_arg: companyId })
  }

  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const keyMap: Record<string, string> = {
    title: 'title', location: 'location', type: 'type',
    salary_range: 'salary_range', experience: 'experience',
    portal_url: 'portal_url', job_url: 'job_url',
    company_website: 'company_website', company_linkedin: 'company_linkedin',
    status: 'status', description: 'description',
    requirements: 'requirements', skills: 'skills', benefits: 'benefits',
    detailed_requirements: 'detailed_requirements',
    education_level: 'education_level', work_authorization: 'work_authorization',
  }

  const dbUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (key in keyMap) {
      dbUpdates[keyMap[key]] = key === 'experience' ? normalizeExperienceLevel(value as string) : value
    }
  }

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase.from('jobs').update(dbUpdates).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase.from('jobs').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
