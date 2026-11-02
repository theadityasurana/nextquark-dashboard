// Pure helpers for the Iris remote config admin (App Control).
// Source of truth: ~/Desktop/iris-admin-control/remote-config.md (§5, §6, §8.4).
// No IO here — everything is unit-tested in core.test.ts.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
export type JsonObject = { [k: string]: Json }
export type Path = string[]

export const SECTION_KEYS = [
  'limits',
  'features',
  'social',
  'copy.share',
  'copy.free_swipes',
  'copy.out_of_swipes',
  'job_card',
  'paywall',
  'logos',
  'feed',
] as const
export type SectionKey = (typeof SECTION_KEYS)[number]

export function isSectionKey(k: string): k is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(k)
}

export interface ConfigRow {
  key: string
  value: JsonObject
  default_value: JsonObject
  description: string | null
  version: number
  updated_at: string
  updated_by: string | null
}

export interface HistoryRow {
  id: number
  key: string
  version: number
  old_value: JsonObject | null
  new_value: JsonObject
  changed_by: string | null
  note: string | null
  changed_at: string
}

// ─── Paths & equality ────────────────────────────────────────────────────────

export function getAt(obj: Json | undefined, path: Path): Json | undefined {
  let cur: Json | undefined = obj
  for (const p of path) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) return undefined
    cur = (cur as JsonObject)[p]
  }
  return cur
}

/** Immutable set. Creates intermediate objects as needed. */
export function setAt<T extends Json>(obj: T, path: Path, value: Json): T {
  if (path.length === 0) return value as T
  const base: JsonObject =
    obj !== null && typeof obj === 'object' && !Array.isArray(obj) ? { ...(obj as JsonObject) } : {}
  const [head, ...rest] = path
  base[head] = setAt((base[head] ?? {}) as Json, rest, value)
  return base as T
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (typeof a === 'object') {
    if (Array.isArray(b)) return false
    const ak = Object.keys(a as object)
    const bk = Object.keys(b as object)
    if (ak.length !== bk.length) return false
    return ak.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual((a as never)[k], (b as never)[k]))
  }
  return false
}

/** Effective value: a missing field falls back to its default (doc §3 "Rules for values"). */
export function effective(value: JsonObject, def: JsonObject, path: Path): Json | undefined {
  const v = getAt(value, path)
  return v === undefined ? getAt(def, path) : v
}

// ─── Diff ────────────────────────────────────────────────────────────────────

export interface DiffEntry {
  path: Path
  before: Json | undefined
  after: Json | undefined
}

/** Field-by-field diff. Objects recurse; arrays and scalars are leaves. */
export function diff(before: Json | undefined, after: Json | undefined, path: Path = []): DiffEntry[] {
  const isObj = (x: unknown): x is JsonObject => x !== null && typeof x === 'object' && !Array.isArray(x)
  if (isObj(before) && isObj(after)) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    return keys.flatMap(k => diff(before[k], after[k], [...path, k]))
  }
  if (path.length === 0 && (isObj(before) || isObj(after))) {
    // One side is null (first history row): diff against an empty object.
    return diff(isObj(before) ? before : {}, isObj(after) ? after : {}, path)
  }
  return deepEqual(before, after) ? [] : [{ path, before, after }]
}

export function formatJson(v: Json | undefined): string {
  if (v === undefined) return '—'
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v) && v.every(x => typeof x === 'string')) return `[${(v as string[]).join(', ')}]`
  return JSON.stringify(v)
}

// ─── Placeholders (§5) ───────────────────────────────────────────────────────

export const PLACEHOLDERS = ['referral_reward', 'follow_reward', 'code', 'link', 'countdown', 'title', 'company'] as const
export type Placeholder = (typeof PLACEHOLDERS)[number]

/** Which placeholders the app fills in for a given text field. */
export function placeholdersFor(section: string, path: Path): Placeholder[] {
  const out: Placeholder[] = ['referral_reward', 'follow_reward']
  if (section === 'copy.share') out.push('code', 'link')
  if (section === 'copy.share' && path[0] === 'job_share') out.push('title', 'company')
  if (section === 'copy.out_of_swipes' && path[0] === 'reset_countdown') out.push('countdown')
  return out
}

const PLACEHOLDER_RE = /\{([^{}\s]+)\}/g

export function findPlaceholders(text: string): string[] {
  return Array.from(text.matchAll(PLACEHOLDER_RE), m => m[1])
}

export interface SampleContext {
  referral_reward: number
  follow_reward: number
  invite_link_base: string
}

export const SAMPLE_CODE = 'ADIT4K2Q'
export const SAMPLE_COUNTDOWN = '3d 4h'
export const SAMPLE_JOB = { title: 'Product Designer', company: 'Acme', link: 'https://jobs.example.com/acme/product-designer' }

/** Fill placeholders with sample values (§8.2). Unknown placeholders stay as typed, like the app. */
export function fillSample(text: string, ctx: SampleContext, section: string, path: Path): string {
  const allowed = new Set(placeholdersFor(section, path))
  const isJob = section === 'copy.share' && path[0] === 'job_share'
  const values: Record<Placeholder, string> = {
    referral_reward: String(ctx.referral_reward),
    follow_reward: String(ctx.follow_reward),
    code: SAMPLE_CODE,
    link: isJob ? SAMPLE_JOB.link : ctx.invite_link_base + SAMPLE_CODE,
    countdown: SAMPLE_COUNTDOWN,
    title: SAMPLE_JOB.title,
    company: SAMPLE_JOB.company,
  }
  return text.replace(PLACEHOLDER_RE, (m, name: string) =>
    allowed.has(name as Placeholder) ? values[name as Placeholder] : m,
  )
}

/** Fill with the defaults the app would use when no section context is relevant (sheet previews). */
export function sampleContext(rows: Record<string, ConfigRow | undefined>): SampleContext {
  const limits = rows['limits']
  const share = rows['copy.share']
  const num = (p: string, d: number) => {
    const v = limits ? effective(limits.value, limits.default_value, [p]) : undefined
    return typeof v === 'number' ? Math.max(0, Math.round(v)) : d
  }
  const base = share ? effective(share.value, share.default_value, ['invite_link_base']) : undefined
  return {
    referral_reward: num('referral_reward_referee', 5),
    follow_reward: num('social_follow_reward', 2),
    invite_link_base: typeof base === 'string' ? base : 'https://nextquark.in/invite/',
  }
}

// ─── Website-side checks (§8.4) ──────────────────────────────────────────────

export interface Issue {
  path: Path
  severity: 'error' | 'warning'
  message: string
}

export const ALLOWED = {
  share_targets: ['story', 'x', 'whatsapp'],
  platforms: ['instagram', 'twitter', 'linkedin'],
  chips: [
    'industry', 'company_type', 'employment_type', 'location_type', 'experience',
    'posted', 'salary', 'level', 'requirements', 'education', 'work_authorization',
  ],
  sections: ['requirements', 'fit_writeup', 'skills', 'benefits'],
  hidden_sections: ['requirements', 'fit_writeup', 'skills', 'benefits', 'about'],
  plans: ['starter', 'pro', 'ultra'],
  providers: ['company', 'logo_dev', 'google', 'duckduckgo'],
  feed_source: ['client', 'server'],
  billing_period: ['monthly', 'quarterly'],
} as const

const MESSAGE_FIELDS = ['x', 'whatsapp', 'story', 'image_caption', 'invite_message', 'job_share']

function walkStrings(v: Json | undefined, path: Path, out: { path: Path; text: string }[]) {
  if (typeof v === 'string') out.push({ path, text: v })
  else if (Array.isArray(v)) v.forEach((x, i) => walkStrings(x, [...path, String(i)], out))
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walkStrings(x, [...path, k], out))
}

function checkAllowedList(value: JsonObject, def: JsonObject, path: Path, allowed: readonly string[], issues: Issue[]) {
  const v = effective(value, def, path)
  if (!Array.isArray(v)) return
  const bad = v.filter(x => typeof x !== 'string' || !allowed.includes(x))
  if (bad.length) {
    issues.push({ path, severity: 'error', message: `Not allowed: ${bad.map(String).join(', ')}. Allowed: ${allowed.join(', ')}.` })
  }
  const dupes = v.filter((x, i) => v.indexOf(x) !== i)
  if (dupes.length) issues.push({ path, severity: 'error', message: `Listed twice: ${dupes.map(String).join(', ')}.` })
}

function checkAllowedValue(value: JsonObject, def: JsonObject, path: Path, allowed: readonly string[], issues: Issue[]) {
  const v = effective(value, def, path)
  if (typeof v === 'string' && !allowed.includes(v)) {
    issues.push({ path, severity: 'error', message: `"${v}" isn't allowed. Use one of: ${allowed.join(', ')}.` })
  }
}

/**
 * Meaning checks the database can't do. `errors` block saving; `warnings` are
 * shown in the review step. `current` is the saved value (for big-jump warnings).
 */
/** Objects whose keys are free-form names (doc §3 "map" objects). */
const MAP_PATHS: Record<string, Path[]> = {
  paywall: [['features']],
  feed: [['starting_levels']],
}

function checkUnknownKeys(key: string, val: Json | undefined, def: Json | undefined, path: Path, issues: Issue[]) {
  const isObj = (x: unknown): x is JsonObject => x !== null && typeof x === 'object' && !Array.isArray(x)
  if (!isObj(val) || !isObj(def)) return
  const isMap = (MAP_PATHS[key] ?? []).some(p => deepEqual(p, path))
  for (const k of Object.keys(val)) {
    if (k in def) checkUnknownKeys(key, val[k], def[k], [...path, k], issues)
    else if (!isMap) issues.push({ path: [...path, k], severity: 'error', message: `Unknown field "${[...path, k].join('.')}". The app doesn't read it; new fields need a developer.` })
  }
}

export function checkSection(key: string, value: JsonObject, def: JsonObject, current?: JsonObject): Issue[] {
  const issues: Issue[] = []
  checkUnknownKeys(key, value, def, [], issues)

  // Placeholders everywhere.
  const strings: { path: Path; text: string }[] = []
  walkStrings(value, [], strings)
  for (const { path, text } of strings) {
    const allowed = placeholdersFor(key, path)
    for (const name of findPlaceholders(text)) {
      if (!(PLACEHOLDERS as readonly string[]).includes(name)) {
        issues.push({ path, severity: 'warning', message: `Unknown placeholder {${name}} will show up literally.` })
      } else if (!allowed.includes(name as Placeholder)) {
        issues.push({ path, severity: 'warning', message: `{${name}} isn't filled in here and will show up literally.` })
      }
    }
  }

  switch (key) {
    case 'limits': {
      for (const [k, v] of Object.entries(value)) {
        if (typeof v !== 'number') continue
        if (v < 0 || !Number.isInteger(v)) {
          issues.push({ path: [k], severity: 'warning', message: 'Must be a whole number ≥ 0; the database rounds decimals and turns negatives into 0.' })
        }
        const before = current ? getAt(current, [k]) : undefined
        if (typeof before === 'number' && before > 0 && v > before * 3) {
          issues.push({ path: [k], severity: 'warning', message: `Big jump: ${before} → ${v} (more than 3×).` })
        }
      }
      break
    }
    case 'features': {
      checkAllowedList(value, def, ['share_targets'], ALLOWED.share_targets, issues)
      checkAllowedValue(value, def, ['feed_source'], ALLOWED.feed_source, issues)
      const ms = effective(value, def, ['splash_min_ms'])
      if (typeof ms === 'number' && (ms < 0 || ms > 5000)) {
        issues.push({ path: ['splash_min_ms'], severity: 'warning', message: 'Outside 0–5000; the app will clamp it.' })
      }
      break
    }
    case 'social': {
      const items = effective(value, def, ['follow_items'])
      if (Array.isArray(items)) {
        items.forEach((it, i) => {
          const p = it && typeof it === 'object' && !Array.isArray(it) ? it.platform : undefined
          if (typeof p !== 'string' || !(ALLOWED.platforms as readonly string[]).includes(p)) {
            issues.push({ path: ['follow_items', String(i), 'platform'], severity: 'error', message: `Platform must be one of: ${ALLOWED.platforms.join(', ')}.` })
          }
        })
      }
      for (const p of ALLOWED.platforms) {
        const url = effective(value, def, ['links', p])
        if (typeof url === 'string' && !/^https:\/\//.test(url)) {
          issues.push({ path: ['links', p], severity: 'warning', message: 'Should be a full https:// URL.' })
        }
      }
      break
    }
    case 'copy.share': {
      const base = effective(value, def, ['invite_link_base'])
      if (typeof base === 'string' && !base.startsWith('https://nextquark.in/')) {
        issues.push({ path: ['invite_link_base'], severity: 'error', message: 'Must start with https://nextquark.in/ (keep the nextquark.in domain).' })
      }
      for (const f of MESSAGE_FIELDS) {
        const text = effective(value, def, [f])
        const defText = getAt(def, [f])
        if (typeof text !== 'string') continue
        // Require whichever of {code}/{link} the original message relies on.
        for (const ph of ['code', 'link']) {
          const needed = typeof defText === 'string' ? defText.includes(`{${ph}}`) : ph === 'link'
          if (needed && !text.includes(`{${ph}}`)) {
            issues.push({ path: [f], severity: 'warning', message: `Missing {${ph}}; the shared message won't include it.` })
          }
        }
      }
      const x = effective(value, def, ['x'])
      if (typeof x === 'string') {
        const len = xLength(fillSample(x, { referral_reward: 5, follow_reward: 2, invite_link_base: typeof base === 'string' ? base : '' }, 'copy.share', ['x']))
        if (len > 250) issues.push({ path: ['x'], severity: 'warning', message: `About ${len} characters on X; keep it under ~250.` })
      }
      break
    }
    case 'job_card': {
      checkAllowedList(value, def, ['chips', 'order'], ALLOWED.chips, issues)
      checkAllowedList(value, def, ['chips', 'hidden'], ALLOWED.chips, issues)
      checkAllowedList(value, def, ['sections', 'order'], ALLOWED.sections, issues)
      checkAllowedList(value, def, ['sections', 'hidden'], ALLOWED.hidden_sections, issues)
      break
    }
    case 'paywall': {
      checkAllowedList(value, def, ['plan_order'], ALLOWED.plans, issues)
      checkAllowedList(value, def, ['hidden_plans'], ALLOWED.plans, issues)
      checkAllowedValue(value, def, ['default_plan'], ALLOWED.plans, issues)
      checkAllowedValue(value, def, ['default_billing_period'], ALLOWED.billing_period, issues)
      const order = effective(value, def, ['plan_order'])
      const hidden = effective(value, def, ['hidden_plans'])
      const ordered = Array.isArray(order) ? (order as string[]) : [...ALLOWED.plans]
      const hiddenSet = new Set(Array.isArray(hidden) ? (hidden as string[]) : [])
      let visible = ordered.filter(p => !hiddenSet.has(p))
      if (visible.length === 0) {
        issues.push({ path: ['hidden_plans'], severity: 'warning', message: 'Every plan is hidden, so the app will show all plans.' })
        visible = ordered
      }
      const dp = effective(value, def, ['default_plan'])
      if (typeof dp === 'string' && !visible.includes(dp)) {
        issues.push({ path: ['default_plan'], severity: 'warning', message: `"${dp}" isn't a visible plan.` })
      }
      const hp = effective(value, def, ['highlighted_plan'])
      if (typeof hp === 'string' && (ALLOWED.plans as readonly string[]).includes(hp) && !visible.includes(hp)) {
        issues.push({ path: ['highlighted_plan'], severity: 'warning', message: `"${hp}" is hidden, so no plan will get the badge.` })
      }
      const features = effective(value, def, ['features'])
      for (const p of visible) {
        if (!features || typeof features !== 'object' || Array.isArray(features) || !Array.isArray(features[p])) {
          issues.push({ path: ['features'], severity: 'warning', message: `No feature rows for visible plan "${p}".` })
        }
      }
      break
    }
    case 'logos':
      checkAllowedList(value, def, ['providers'], ALLOWED.providers, issues)
      break
    case 'feed': {
      const levels = effective(value, def, ['starting_levels'])
      if (levels && typeof levels === 'object' && !Array.isArray(levels)) {
        for (const [k, r] of Object.entries(levels)) {
          const ok = Array.isArray(r) && r.length === 2 && r.every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 5) && (r[0] as number) <= (r[1] as number)
          if (!ok) issues.push({ path: ['starting_levels', k], severity: 'error', message: 'Must be [from, to] with whole numbers 0–5 and from ≤ to.' })
        }
      }
      const share = effective(value, def, ['adjacent_share'])
      if (typeof share === 'number' && (share < 0 || share > 1)) {
        issues.push({ path: ['adjacent_share'], severity: 'error', message: 'Must be between 0 and 1.' })
      }
      break
    }
  }
  return issues
}

/** X counts every link as 23 characters. */
export function xLength(text: string): number {
  return Array.from(text.replace(/https?:\/\/\S+/g, 'x'.repeat(23))).length
}

// ─── Database validation messages → field paths ──────────────────────────────

/** ".free_swipes_per_cycle must be a number (got string)" → ['free_swipes_per_cycle'] */
export function pathFromProblem(problem: string): Path | null {
  const m = problem.match(/^\.([A-Za-z0-9_.[\]]+)/)
  if (!m) return null
  return m[1].replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
}

export function pathStartsWith(path: Path, prefix: Path): boolean {
  return prefix.length <= path.length && prefix.every((p, i) => path[i] === p)
}

// ─── High-impact confirmations (§8.3) ────────────────────────────────────────

/** Plain-words sentences for changes that users feel; [] when none apply. */
export function impactSentences(key: string, before: JsonObject, after: JsonObject, def: JsonObject): string[] {
  const out: string[] = []
  const changed = (p: Path) => !deepEqual(effective(before, def, p), effective(after, def, p))
  const val = (p: Path) => effective(after, def, p)
  const list = (v: Json | undefined) => (Array.isArray(v) ? (v as string[]).join(', ') : String(v))

  if (key === 'limits') {
    const n = (p: string) => Math.max(0, Math.round(Number(val([p]))))
    if (changed(['free_swipes_per_cycle'])) out.push(`New free users will get ${n('free_swipes_per_cycle')} swipes per cycle; existing users at their next reset.`)
    if (changed(['free_cycle_days'])) out.push(`Free swipe cycles will last ${n('free_cycle_days')} days, starting from each user's next reset.`)
    if (changed(['referral_reward_referrer'])) out.push(`Code owners will get ${n('referral_reward_referrer')} swipes for each friend who signs up with their code.`)
    if (changed(['referral_reward_referee'])) out.push(`New users who sign up with a code will get ${n('referral_reward_referee')} swipes, and every message using {referral_reward} will say ${n('referral_reward_referee')}.`)
    if (changed(['social_follow_reward'])) out.push(`Users will get ${n('social_follow_reward')} swipes per follow claim, and {follow_reward} will say ${n('social_follow_reward')}.`)
    if (changed(['new_user_application_credits'])) out.push(`New accounts will start with ${n('new_user_application_credits')} application credits.`)
    if (out.length) out.push('This takes effect immediately and is not retroactive: existing balances aren\'t changed.')
  }
  if (key === 'paywall') {
    if (changed(['plan_order'])) out.push(`Plan cards will be shown in this order: ${list(val(['plan_order']))}.`)
    if (changed(['hidden_plans'])) {
      const h = val(['hidden_plans'])
      out.push(Array.isArray(h) && h.length ? `These plans will no longer be offered: ${list(h)}.` : 'All plans will be offered.')
    }
    if (changed(['highlighted_plan'])) {
      const h = String(val(['highlighted_plan']))
      out.push((ALLOWED.plans as readonly string[]).includes(h) ? `The "${h}" plan will get the badge.` : 'No plan will get the badge.')
    }
    if (changed(['highlight_badge'])) out.push(`The badge will read "${val(['highlight_badge'])}".`)
    if (changed(['default_plan'])) out.push(`The paywall will open with "${val(['default_plan'])}" selected.`)
    if (changed(['default_billing_period'])) out.push(`The paywall will open on ${val(['default_billing_period'])} billing.`)
    if (changed(['features'])) out.push('The feature rows on the plan cards will change.')
    if (changed(['how_it_works'])) out.push('The "How it works" grid on the paywall will change.')
    if (out.length) out.push('Prices are not affected; they come from the App Store and Google Play.')
  }
  if (key === 'features' && changed(['feed_source'])) {
    out.push(
      val(['feed_source']) === 'server'
        ? 'The job feed will be built by the get-feed function instead of on the phone. If it fails, the app falls back to the phone by itself.'
        : 'The job feed will be built on the phone again (not by the get-feed function).',
    )
  }
  return out
}

// ─── Error mapping for API routes ────────────────────────────────────────────

export function describeDbError(err: { code?: string; message?: string; details?: string | null }): { status: number; message: string } {
  switch (err.code) {
    case '22023':
      return { status: 400, message: err.message ?? 'Rejected by the database.' }
    case '42501':
      return { status: 500, message: 'The server isn\'t using the Supabase service key, so the database refused the change. Check SUPABASE_SERVICE_ROLE_KEY.' }
    case 'P0002':
      return { status: 404, message: err.message ?? 'Not found.' }
    default:
      return { status: 500, message: err.message || 'Unexpected database error.' }
  }
}
