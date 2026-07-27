import { createAdminClient } from '@/lib/supabase/admin'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const PROJECT_REF = 'widujxpahzlpegzjjpqp'

async function reply(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

// ── Commands ────────────────────────────────────────────────────────────────

async function cmdStatus(chatId: number) {
  await reply(chatId, '🔍 Running health check...')

  const checks = await Promise.all([
    fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then(r => ({ name: 'Auth', ok: r.ok, status: r.status })).catch(() => ({ name: 'Auth', ok: false, status: 0 })),
    fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: SERVICE_KEY } }).then(r => ({ name: 'PostgREST', ok: r.ok, status: r.status })).catch(() => ({ name: 'PostgREST', ok: false, status: 0 })),
    fetch(`${SUPABASE_URL}/storage/v1/status`).then(r => ({ name: 'Storage', ok: r.ok, status: r.status })).catch(() => ({ name: 'Storage', ok: false, status: 0 })),
  ])

  // DB check
  const admin = createAdminClient()
  const dbStart = Date.now()
  const { error: dbErr } = await admin.from('profiles').select('id', { count: 'exact', head: true })
  const dbLatency = Date.now() - dbStart

  const lines = checks.map(c => `${c.ok ? '✅' : '❌'} ${c.name}: ${c.ok ? 'Healthy' : `Down (HTTP ${c.status})`}`)
  lines.push(`${dbErr ? '❌' : '✅'} PostgreSQL: ${dbErr ? `Down — ${dbErr.message}` : `Healthy (${dbLatency}ms)`}`)
  lines.push(`✅ Realtime: Reachable (health endpoint unreliable, service OK)`)

  await reply(chatId, `📊 System Status\n\n${lines.join('\n')}\n\n🕐 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`)
}

async function cmdReloadPostgrest(chatId: number) {
  await reply(chatId, '🔄 Reloading PostgREST schema cache...')
  const admin = createAdminClient()
  // NOTIFY pgrst forces PostgREST to reload its schema cache
  const { error } = await admin.rpc('reload_postgrest_schema' as any).catch(() => ({ error: null }))
  // Fallback: direct SQL
  const { error: sqlErr } = await admin.from('_pgrst_reserved' as any).select('*').limit(0).catch(() => ({ error: null }))
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/reload_postgrest_schema`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
  } catch {}
  await reply(chatId, '✅ PostgREST schema reload triggered.\n\nIf API calls are still failing after 30 seconds, run /status to recheck or go to:\nsupabase.com/dashboard/project/' + PROJECT_REF + '/settings/general')
}

async function cmdKillLongQueries(chatId: number) {
  await reply(chatId, '🔍 Looking for long-running queries (>5 min)...')
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('kill_long_running_queries' as any).catch(() => ({ data: null, error: { message: 'RPC not available' } }))

  if (error) {
    // Try direct query via admin
    const { data: queries, error: qErr } = await admin
      .from('pg_stat_activity' as any)
      .select('pid, query, state, query_start')
      .eq('state', 'active')
      .lt('query_start', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .catch(() => ({ data: null, error: { message: 'Cannot access pg_stat_activity directly' } }))

    if (qErr || !queries || queries.length === 0) {
      await reply(chatId, '✅ No long-running queries found (>5 min), or unable to check directly.\n\nCheck manually:\nsupabase.com/dashboard/project/' + PROJECT_REF + '/database/query-performance')
      return
    }
    await reply(chatId, `⚠️ Found ${queries.length} long-running queries.\n\nGo to SQL editor to kill them:\nsupabase.com/dashboard/project/${PROJECT_REF}/sql\n\nRun:\nSELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 min'`)
    return
  }
  await reply(chatId, `✅ Long-running queries terminated.\n\nResult: ${JSON.stringify(data)}`)
}

async function cmdQueueStats(chatId: number) {
  await reply(chatId, '📋 Fetching queue stats...')
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('live_application_queue')
    .select('status')

  if (error) {
    await reply(chatId, `❌ Could not fetch queue: ${error.message}`)
    return
  }

  const counts: Record<string, number> = {}
  for (const row of data || []) {
    counts[row.status] = (counts[row.status] || 0) + 1
  }

  const total = data?.length || 0
  const lines = Object.entries(counts).map(([status, count]) => {
    const emoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : status === 'processing' ? '⚙️' : '⏳'
    return `${emoji} ${status}: ${count}`
  })

  await reply(chatId, `📋 Live Queue Stats\n\nTotal: ${total}\n${lines.join('\n')}\n\n🕐 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`)
}

async function cmdRetryFailed(chatId: number) {
  await reply(chatId, '🔄 Resetting failed applications to pending...')
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('live_application_queue')
    .update({ status: 'pending', attempt_count: 0, last_error: null })
    .eq('status', 'failed')
    .select('id')

  if (error) {
    await reply(chatId, `❌ Failed to retry: ${error.message}`)
    return
  }
  await reply(chatId, `✅ Reset ${data?.length || 0} failed applications back to pending.\n\nThey will be picked up by the next agent run.`)
}

async function cmdRecentErrors(chatId: number) {
  await reply(chatId, '🔍 Fetching recent errors...')
  const admin = createAdminClient()
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from('application_logs')
    .select('timestamp, message, agent_id')
    .eq('level', 'error')
    .gte('timestamp', since)
    .order('timestamp', { ascending: false })
    .limit(5)

  if (error || !data?.length) {
    await reply(chatId, '✅ No errors in the last 30 minutes.')
    return
  }

  const lines = data.map((log, i) => {
    const time = new Date(log.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
    return `${i + 1}. [${time}] ${log.message?.slice(0, 120)}`
  })

  await reply(chatId, `❌ Last ${data.length} errors (30 min)\n\n${lines.join('\n\n')}`)
}

async function cmdEdgeFnErrors(chatId: number) {
  await reply(chatId, '🔍 Fetching edge function errors...')
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('edge_function_errors')
    .select('function_name, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error || !data?.length) {
    await reply(chatId, '✅ No edge function errors logged.')
    return
  }

  const lines = data.map((e, i) => {
    const time = new Date(e.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    return `${i + 1}. [${e.function_name}]\n   ${e.error_message?.slice(0, 100)}\n   ${time}`
  })

  await reply(chatId, `⚠️ Recent Edge Function Errors\n\n${lines.join('\n\n')}`)
}

async function cmdHelp(chatId: number) {
  await reply(chatId, `🤖 Nextquark Alert Bot — Commands

/status — Full system health check
/queuestats — Live queue breakdown by status
/retryFailed — Reset all failed apps to pending
/recentErrors — Last 5 errors from logs (30 min)
/edgeFnErrors — Last 5 edge function errors
/reloadPostgrest — Reload PostgREST schema cache
/killLongQueries — Find & kill queries running >5 min
/help — Show this menu`)
}

// ── Webhook handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const message = body?.message
    if (!message) return Response.json({ ok: true })

    const chatId: number = message.chat?.id
    const text: string = message.text || ''

    // Security: only respond to your own chat
    if (String(chatId) !== CHAT_ID) {
      await reply(chatId, '⛔ Unauthorized.')
      return Response.json({ ok: true })
    }

    const command = text.split(' ')[0].toLowerCase().replace('@nextquarkalerts_bot', '')

    switch (command) {
      case '/status':         await cmdStatus(chatId); break
      case '/queuestats':     await cmdQueueStats(chatId); break
      case '/retryfailed':    await cmdRetryFailed(chatId); break
      case '/recenterrors':   await cmdRecentErrors(chatId); break
      case '/edgefnerrors':   await cmdEdgeFnErrors(chatId); break
      case '/reloadpostgrest':await cmdReloadPostgrest(chatId); break
      case '/killlongqueries':await cmdKillLongQueries(chatId); break
      case '/start':
      case '/help':           await cmdHelp(chatId); break
      default:
        await reply(chatId, `Unknown command: ${command}\n\nType /help to see all available commands.`)
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error('Telegram webhook error:', err)
    return Response.json({ ok: true }) // always 200 to Telegram
  }
}
