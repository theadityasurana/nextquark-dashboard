import { createAdminClient } from '@/lib/supabase/admin'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!
const PROJECT_REF = 'widujxpahzlpegzjjpqp'
const DASHBOARD_URL = `https://supabase.com/dashboard/project/${PROJECT_REF}`

const lastAlertState: Record<string, string> = {}

type ServiceStatus = 'healthy' | 'degraded' | 'down'

interface ServiceResult {
  name: string
  status: ServiceStatus
  latencyMs: number
  detail?: string
}

const FIX_GUIDE: Record<string, { impact: string; causes: string[]; steps: string[] }> = {
  Auth: {
    impact: 'Users cannot log in or sign up. All authenticated API calls will fail. Active sessions may be invalidated.',
    causes: [
      'Supabase Auth service outage',
      'JWT secret misconfiguration',
      'Rate limiting triggered by too many failed logins',
      'GoTrue service crash',
    ],
    steps: [
      `1. Check Supabase status → https://status.supabase.com`,
      `2. Check Auth logs → ${DASHBOARD_URL}/logs/auth`,
      `3. Check Auth settings → ${DASHBOARD_URL}/auth/users`,
      `4. If rate limited: wait 15 min or whitelist IPs in Auth settings`,
      `5. If JWT issue: rotate JWT secret → ${DASHBOARD_URL}/settings/api`,
      `6. Restart Auth service → ${DASHBOARD_URL}/settings/general`,
    ],
  },
  PostgREST: {
    impact: 'All database API calls from the app are failing. No data can be read or written via REST. Queue processing, user profiles, jobs — all broken.',
    causes: [
      'PostgREST service crash or restart',
      'Database schema change broke PostgREST cache',
      'Connection pool exhausted',
      'Invalid service role key',
    ],
    steps: [
      `1. Check API logs → ${DASHBOARD_URL}/logs/postgrest`,
      `2. Reload PostgREST schema cache → ${DASHBOARD_URL}/database/replication (or run: NOTIFY pgrst, 'reload schema')`,
      `3. Check DB connections → ${DASHBOARD_URL}/database/roles`,
      `4. Verify service role key is valid → ${DASHBOARD_URL}/settings/api`,
      `5. Check for recent migrations that may have broken schema`,
      `6. If persistent: restart PostgREST → ${DASHBOARD_URL}/settings/general`,
    ],
  },
  Realtime: {
    impact: 'Live queue updates, real-time application status changes, and any subscriptions are not working. Dashboard will show stale data.',
    causes: [
      'Realtime service overloaded (too many concurrent connections)',
      'Realtime service crash',
      'Database replication slot issue',
      'Network timeout between Realtime and DB',
    ],
    steps: [
      `1. Check Realtime logs → ${DASHBOARD_URL}/logs/realtime`,
      `2. Check active connections → ${DASHBOARD_URL}/database/replication`,
      `3. Drop unused replication slots if any are stuck`,
      `4. Check concurrent connection count — free tier limit is 200`,
      `5. Restart Realtime → ${DASHBOARD_URL}/settings/general`,
      `6. If overloaded: reduce subscriptions or upgrade plan`,
    ],
  },
  Storage: {
    impact: 'Resume uploads, profile pictures, and file downloads are failing. Users cannot upload or access stored files.',
    causes: [
      'Supabase Storage service outage',
      'Storage bucket policy misconfiguration',
      'S3 backend issue',
      'File size limit exceeded',
    ],
    steps: [
      `1. Check Supabase status → https://status.supabase.com`,
      `2. Check Storage logs → ${DASHBOARD_URL}/logs/storage`,
      `3. Verify bucket policies → ${DASHBOARD_URL}/storage/buckets`,
      `4. Check storage usage limits → ${DASHBOARD_URL}/settings/billing`,
      `5. Test a manual upload via Supabase dashboard`,
    ],
  },
  PostgreSQL: {
    impact: 'CRITICAL — The entire database is unreachable. All app functionality is broken. No data can be read or written. Queue processing stopped.',
    causes: [
      'Database server crash or restart',
      'Connection pool exhausted (too many concurrent queries)',
      'Disk space full',
      'Long-running query blocking all connections',
      'Database paused due to inactivity (free tier)',
    ],
    steps: [
      `1. Check if DB is paused (free tier auto-pauses) → ${DASHBOARD_URL}/settings/general`,
      `2. Check DB health → ${DASHBOARD_URL}/reports/database`,
      `3. Check active queries → ${DASHBOARD_URL}/database/query-performance`,
      `4. Kill long-running queries if blocking: SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 min'`,
      `5. Check disk usage → ${DASHBOARD_URL}/settings/billing`,
      `6. Check connection count → ${DASHBOARD_URL}/database/roles`,
      `7. If paused: click "Resume" on the dashboard`,
    ],
  },
}

async function probe(name: string, url: string, apiKey?: string, timeoutMs = 5000, reachableOnly = false): Promise<ServiceResult> {
  const start = Date.now()
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: apiKey ? { apikey: apiKey } : {},
    })
    const latencyMs = Date.now() - start
    // reachableOnly: any HTTP response means the service is up (used for Realtime
    // whose /api/health returns 500 via Cloudflare but the service itself works fine)
    const ok = reachableOnly ? true : res.ok
    return { name, status: ok ? (latencyMs > 3000 ? 'degraded' : 'healthy') : 'degraded', latencyMs }
  } catch (err: any) {
    return { name, status: 'down', latencyMs: Date.now() - start, detail: err?.message }
  }
}

async function checkDatabase(): Promise<ServiceResult> {
  const admin = createAdminClient()
  const start = Date.now()
  try {
    const { error } = await admin.from('profiles').select('id', { count: 'exact', head: true })
    const latencyMs = Date.now() - start
    if (error) return { name: 'PostgreSQL', status: 'down', latencyMs, detail: error.message }
    return { name: 'PostgreSQL', status: latencyMs > 3000 ? 'degraded' : 'healthy', latencyMs }
  } catch (err: any) {
    return { name: 'PostgreSQL', status: 'down', latencyMs: Date.now() - start, detail: err?.message }
  }
}

async function getRecentErrorRate() {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const [{ data: logs }, { data: authLogs }] = await Promise.all([
    admin.from('application_logs').select('level').gte('timestamp', since),
    admin.from('application_logs').select('level, message').gte('timestamp', since).ilike('message', '%auth%'),
  ])
  const total = logs?.length || 0
  const errors = logs?.filter(l => l.level === 'error').length || 0
  const authErrors = authLogs?.filter(l => l.level === 'error').length || 0
  return {
    httpErrorRate: total > 0 ? Math.round((errors / total) * 100) : 0,
    totalErrors: errors,
    authErrors,
    totalRequests: total,
  }
}

async function sendTelegram(text: string, silent = false) {
  if (!BOT_TOKEN || !CHAT_ID) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, disable_notification: silent }),
  }).catch(() => {})
}

function buildServiceAlert(svc: ServiceResult): string {
  const guide = FIX_GUIDE[svc.name]
  const emoji = svc.status === 'down' ? '🚨' : '⚠️'
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

  return [
    `${emoji} *ALERT — Nextquark: ${svc.name} is ${svc.status.toUpperCase()}*`,
    ``,
    `📊 *Diagnostics*`,
    `• Service: ${svc.name}`,
    `• Status: ${svc.status.toUpperCase()}`,
    `• Response time: ${svc.latencyMs}ms ${svc.latencyMs > 3000 ? '(too slow)' : ''}`,
    svc.detail ? `• Error: ${svc.detail}` : null,
    `• Project: ${PROJECT_REF}`,
    ``,
    `💥 *Impact*`,
    guide.impact,
    ``,
    `🔍 *Likely Causes*`,
    ...guide.causes.map(c => `• ${c}`),
    ``,
    `🛠 *How to Fix*`,
    ...guide.steps,
    ``,
    `🕐 Detected at: ${time}`,
  ].filter(l => l !== null).join('\n')
}

function buildRecoveryAlert(svc: ServiceResult): string {
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  return [
    `✅ *RESOLVED — Nextquark: ${svc.name} is back online*`,
    ``,
    `• Service: ${svc.name}`,
    `• Status: HEALTHY`,
    `• Response time: ${svc.latencyMs}ms`,
    `• Project: ${PROJECT_REF}`,
    ``,
    `🕐 Recovered at: ${time}`,
  ].join('\n')
}

function buildErrorRateAlert(stats: { httpErrorRate: number; totalErrors: number; authErrors: number; totalRequests: number }): string {
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  return [
    `❌ *ALERT — Nextquark: High Error Rate Detected*`,
    ``,
    `📊 *Diagnostics*`,
    `• Error rate: ${stats.httpErrorRate}% (threshold: 20%)`,
    `• Total errors: ${stats.totalErrors} out of ${stats.totalRequests} requests`,
    `• Auth-related errors: ${stats.authErrors}`,
    `• Window: last 15 minutes`,
    ``,
    `💥 *Impact*`,
    `A large portion of user requests are failing. Applications may not be processing correctly. Users could be experiencing failures silently.`,
    ``,
    `🔍 *Likely Causes*`,
    `• Agent failures during application processing`,
    `• Portal timeouts or captcha blocks`,
    `• Auth token expiry causing cascading failures`,
    `• External service (BrowserBase/Browser Use) outage`,
    ``,
    `🛠 *How to Fix*`,
    `1. Check application logs → ${DASHBOARD_URL}/logs/edge-functions`,
    `2. Check live queue for stuck/failed items → https://nextquark-dashboard.vercel.app/queue`,
    `3. Check agent logs → https://nextquark-dashboard.vercel.app/logs`,
    `4. If auth errors: rotate JWT or check Auth service`,
    `5. If portal timeouts: check BrowserBase dashboard for session limits`,
    `6. Manually retry failed applications if needed`,
    ``,
    `🕐 Detected at: ${time}`,
  ].join('\n')
}

export async function GET() {
  const [auth, postgrest, realtime, storage, db, errorStats] = await Promise.all([
    probe('Auth', `${SUPABASE_URL}/auth/v1/health`, ANON_KEY),
    probe('PostgREST', `${SUPABASE_URL}/rest/v1/`, SERVICE_KEY),
    probe('Realtime', `${SUPABASE_URL}/realtime/v1/api/health?apikey=${ANON_KEY}`, undefined, 5000, true),
    probe('Storage', `${SUPABASE_URL}/storage/v1/status`),
    checkDatabase(),
    getRecentErrorRate(),
  ])

  const services = [auth, postgrest, realtime, storage, db]
  const overallStatus: ServiceStatus = services.some(s => s.status === 'down')
    ? 'down'
    : services.some(s => s.status === 'degraded')
    ? 'degraded'
    : 'healthy'

  const alerts: string[] = []
  for (const svc of services) {
    if (svc.status !== 'healthy') alerts.push(`${svc.name} is ${svc.status}`)
  }
  if (errorStats.httpErrorRate > 20) alerts.push(`High error rate: ${errorStats.httpErrorRate}% in last 15 min`)
  if (errorStats.authErrors > 5) alerts.push(`Auth errors spiking: ${errorStats.authErrors} in last 15 min`)

  // State-change alerts only
  for (const svc of services) {
    const key = `svc:${svc.name}`
    if (svc.status !== 'healthy' && lastAlertState[key] !== svc.status) {
      await sendTelegram(buildServiceAlert(svc))
    }
    if (svc.status === 'healthy' && lastAlertState[key] && lastAlertState[key] !== 'healthy') {
      await sendTelegram(buildRecoveryAlert(svc), true)
    }
    lastAlertState[key] = svc.status
  }

  if (errorStats.httpErrorRate > 20 && lastAlertState['errorRate'] !== 'high') {
    await sendTelegram(buildErrorRateAlert(errorStats))
    lastAlertState['errorRate'] = 'high'
  } else if (errorStats.httpErrorRate <= 20) {
    lastAlertState['errorRate'] = 'normal'
  }

  return Response.json({ overallStatus, services, alerts, errorStats, checkedAt: new Date().toISOString() })
}
