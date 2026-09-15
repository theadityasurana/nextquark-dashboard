import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Process this many jobs per invocation — small enough to stay under CPU limit
// and avoid hammering OpenRouter rate limits
const BATCH_SIZE = 10

// Hard timeout per LLM call in ms
const LLM_TIMEOUT_MS = 5000

// Max retry attempts — higher gives more chances when rate limited
const MAX_ATTEMPTS = 5

const EXPERIENCE_LEVELS = [
  'Internship', 'Entry Level', 'Middle Level', 'Senior Level',
  'Lead', 'Principal', 'Director', 'VP', 'C-Level',
] as const

/** Title heuristic — last-resort fallback if LLM fails after all retries */
function extractFromTitle(title: string): string | null {
  const t = title.toLowerCase()
  if (/\bintern(?:ship)?\b|\bco[\s-]?op\b/.test(t)) return 'Internship'
  if (/\bc[\s-]?level\b|\bchief\b|\bceo\b|\bcto\b|\bcfo\b|\bcoo\b/.test(t)) return 'C-Level'
  if (/\bvp\b|\bvice[\s-]?president\b|\bsvp\b|\bevp\b/.test(t)) return 'VP'
  if (/\bdirector\b/.test(t)) return 'Director'
  if (/\bprincipal\b|\bstaff\b|\bdistinguished\b/.test(t)) return 'Principal'
  if (/\blead\b|\bhead\s+of\b/.test(t) && !/\bleader(?:ship)?\b/.test(t)) return 'Lead'
  if (/\bsenior\b|\bsr\.?\s/.test(t)) return 'Senior Level'
  if (/\bjunior\b|\bjr\.?\s|\bmid[\s-]?level\b/.test(t)) return 'Middle Level'
  if (/\bentry[\s-]?level\b|\bnew\s+grad\b|\btrainee\b/.test(t)) return 'Entry Level'
  return null
}

/**
 * Call OpenRouter with a hard timeout.
 * Returns the classified level or null on any failure.
 * Never throws — all errors are caught and returned as null.
 */
async function classifyWithLLM(title: string, apiKey: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://nextquark.com',
        'X-Title': 'NextQuark Job Classifier',
      },
      body: JSON.stringify({
        model: 'google/gemma-3-4b-it:free',
        max_tokens: 8,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Job title: "${title}"\n\nClassify into one of: ${EXPERIENCE_LEVELS.join(', ')}\n\nReply with only the level name.`,
        }],
      }),
    })

    clearTimeout(timer)

    // Rate limited — return null, will retry on next invocation
    if (res.status === 429) return null
    if (!res.ok) return null

    const data = await res.json()
    const raw = (data.choices?.[0]?.message?.content ?? '').trim()
    return EXPERIENCE_LEVELS.find(l => raw.toLowerCase().includes(l.toLowerCase())) ?? null
  } catch {
    clearTimeout(timer)
    return null
  }
}

/**
 * Last-resort inference for completely generic titles.
 * "Software Engineer" → Middle Level, "Engineering Manager" → Lead, etc.
 * Returns null only for truly unclassifiable titles.
 */
function inferGenericLevel(title: string): string | null {
  const t = title.toLowerCase()
  // Manager/Lead roles without explicit level
  if (/\bmanager\b|\bmanagement\b/.test(t)) return 'Lead'
  if (/\bengineering\s+manager\b|\beng\s+manager\b/.test(t)) return 'Lead'
  // Generic IC roles — default to Middle Level
  if (/\bengineer\b|\bdeveloper\b|\bprogrammer\b|\barchitect\b/.test(t)) return 'Middle Level'
  if (/\bscientist\b|\bresearcher\b|\banalyst\b/.test(t)) return 'Middle Level'
  if (/\bdesigner\b|\bproduct\s+manager\b|\bpm\b/.test(t)) return 'Middle Level'
  if (/\bmarketer\b|\bspecialist\b|\bconsultant\b/.test(t)) return 'Middle Level'
  if (/\brecruiter\b|\bcoordinator\b|\boperations\b/.test(t)) return 'Middle Level'
  if (/\baccountant\b|\bfinance\b|\bsales\b/.test(t)) return 'Middle Level'
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const body = await req.json().catch(() => ({}))
  // sessionId is created on first invocation and passed through on self-invokes
  let { sessionId } = body

  // If a sessionId was passed, check it hasn't been cancelled
  if (sessionId) {
    const { data: existingSession } = await supabase
      .from('sync_sessions').select('status').eq('id', sessionId).single()
    if (existingSession?.status === 'cancelled') {
      return new Response(JSON.stringify({ message: 'Session cancelled' }))
    }
  }

  // Fetch OpenRouter key
  const { data: settings } = await supabase
    .from('settings').select('"openRouterApiKey"').limit(1).single()
  const apiKey: string | null = settings?.openRouterApiKey ?? null

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No OpenRouter API key configured' }), { status: 400 })
  }

  // Clean up dirty experience values before backfilling
  await supabase.from('jobs')
    .update({ experience: null })
    .or('experience.eq.,experience.eq.Not specified')

  // Backfill any existing jobs with null experience not yet in the queue
  // Fetch already-queued job IDs first, then exclude them
  const { data: alreadyQueued } = await supabase
    .from('experience_enrichment_queue')
    .select('job_id')
    .in('status', ['pending', 'processing', 'done'])
    .limit(10000)

  const queuedIds = new Set((alreadyQueued ?? []).map((r: any) => r.job_id))

  const { data: unqueued } = await supabase
    .from('jobs')
    .select('id, title, company_name')
    .is('experience', null)
    .limit(500)

  const toQueue = (unqueued ?? []).filter((j: any) => !queuedIds.has(j.id))

  if (toQueue.length > 0) {
    await supabase.from('experience_enrichment_queue')
      .upsert(
        toQueue.map((j: any) => ({ job_id: j.id, job_title: j.title, company_name: j.company_name, status: 'pending' })),
        { onConflict: 'job_id', ignoreDuplicates: true }
      )
  }

  // Get total pending count for session tracking
  const { count: totalPending } = await supabase
    .from('experience_enrichment_queue')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'processing'])

  // Create or fetch session row
  if (!sessionId) {
    const { data: session } = await supabase
      .from('sync_sessions')
      .insert({ type: 'enrich', total: totalPending ?? 0, done: 0, failed: 0, added: 0, updated: 0, deleted: 0, results: [] })
      .select('id').single()
    sessionId = session?.id ?? null
  }

  // Claim a batch of pending jobs
  const { data: batch } = await supabase
    .from('experience_enrichment_queue')
    .select('id, job_id, job_title, company_name, attempts')
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (!batch?.length) {
    if (sessionId) {
      await supabase.from('sync_sessions').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', sessionId)
    }
    return new Response(JSON.stringify({ message: 'Queue empty' }))
  }

  const batchIds = batch.map(r => r.id)

  // Mark as processing
  await supabase.from('experience_enrichment_queue')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .in('id', batchIds)

  let processed = 0, succeeded = 0, failed = 0
  const batchLog: Array<{ title: string; company: string; level: string; via: string }> = []

  for (const row of batch) {
    await supabase.from('experience_enrichment_queue')
      .update({ status: 'processing', attempts: row.attempts + 1, updated_at: new Date().toISOString() })
      .eq('id', row.id)

    const llmLevel = await classifyWithLLM(row.job_title, apiKey)
    const heuristicLevel = !llmLevel ? extractFromTitle(row.job_title) : null
    const level = llmLevel ?? heuristicLevel
    const via = llmLevel ? 'LLM' : heuristicLevel ? 'title match' : 'none'

    if (level) {
      const { error: jobErr } = await supabase
        .from('jobs').update({ experience: level }).eq('id', row.job_id)

      if (!jobErr) {
        await supabase.from('experience_enrichment_queue')
          .update({ status: 'done', result: level, updated_at: new Date().toISOString() })
          .eq('id', row.id)
        batchLog.push({ title: row.job_title, company: row.company_name ?? '', level, via })
        succeeded++
      } else {
        console.error(`[enrich] failed to update job ${row.job_id}: ${jobErr.message}`)
        await supabase.from('experience_enrichment_queue')
          .update({ status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', row.id)
        failed++
      }
    } else {
      // Both LLM and heuristic returned null.
      // For generic titles (engineer, manager, analyst etc.) default to Middle Level
      // rather than leaving experience permanently blank.
      const genericLevel = inferGenericLevel(row.job_title)
      if (genericLevel) {
        const { error: jobErr } = await supabase
          .from('jobs').update({ experience: genericLevel }).eq('id', row.job_id)
        if (!jobErr) {
          await supabase.from('experience_enrichment_queue')
            .update({ status: 'done', result: genericLevel, updated_at: new Date().toISOString() })
            .eq('id', row.id)
          batchLog.push({ title: row.job_title, company: row.company_name ?? '', level: genericLevel, via: 'default' })
          succeeded++
        } else {
          const newStatus = row.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending'
          await supabase.from('experience_enrichment_queue')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', row.id)
          failed++
        }
      } else {
        const newStatus = row.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending'
        await supabase.from('experience_enrichment_queue')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', row.id)
        failed++
      }
    }

    processed++
  }

  // Update session progress — append this batch's log to results
  if (sessionId) {
    const { count: doneCount } = await supabase
      .from('experience_enrichment_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'done')
    const { count: failedCount } = await supabase
      .from('experience_enrichment_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
    const { count: remainingCount } = await supabase
      .from('experience_enrichment_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('attempts', MAX_ATTEMPTS)

    // Fetch existing results and append new batch entries
    const { data: currentSession } = await supabase
      .from('sync_sessions').select('results').eq('id', sessionId).single()
    const existingResults: any[] = currentSession?.results ?? []
    // Keep last 200 log entries to avoid unbounded growth
    const newResults = [...existingResults, ...batchLog].slice(-200)

    await supabase.from('sync_sessions').update({
      done: doneCount ?? 0,
      failed: failedCount ?? 0,
      updated: doneCount ?? 0,
      total: (doneCount ?? 0) + (failedCount ?? 0) + (remainingCount ?? 0),
      results: newResults,
    }).eq('id', sessionId)
  }

  // Check remaining and self-invoke if more work to do
  const { count: remaining } = await supabase
    .from('experience_enrichment_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)

  if ((remaining ?? 0) > 0) {
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enrich-experience`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ sessionId }),
    })
  } else if (sessionId) {
    await supabase.from('sync_sessions').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', sessionId)
  }

  return new Response(JSON.stringify({ processed, succeeded, failed, remaining: remaining ?? 0, sessionId }))
})
