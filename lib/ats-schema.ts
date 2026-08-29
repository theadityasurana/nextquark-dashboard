/**
 * Authoritative form schemas, fetched from the ATS itself before the browser opens.
 *
 * Scanning the DOM to work out what a form asks is guesswork: labels get
 * truncated, `required` is inferred from a red asterisk, and the option list of
 * a closed dropdown is invisible. Greenhouse publishes all three as public JSON,
 * so for the single biggest board we can stop guessing entirely.
 *
 * What the schema buys us, in order of importance:
 *
 *   1. EXACT option strings. An answer can be validated against the real list
 *      before we touch the widget, instead of discovering the mismatch by
 *      clicking and failing.
 *   2. EXACT `required` flags. Our DOM heuristic reads an asterisk in the label
 *      text, which misses `✱` (Lever), aria-only markers, and CSS-drawn stars.
 *   3. EXACT question text. `labelOf` truncates at 120 characters, which is what
 *      breaks LLM answer matching on Greenhouse's long compliance questions.
 *
 * Deliberately best-effort: every failure path returns null and the caller falls
 * back to the DOM scan it already had. A schema that cannot be fetched must
 * never fail a run that would otherwise have worked.
 */

import type { WidgetKind } from "./ats-fields"
import { GREENHOUSE_TYPE_MAP } from "./ats-fields"

/** Where on the form a question comes from. Drives answering policy. */
export type SchemaGroup =
  /** Name, email, phone, résumé — the fields every application has. */
  | "standard"
  /** Employer-authored questions for this specific job. */
  | "custom"
  /** EEOC: race, gender, veteran, disability. Never model-answered. */
  | "eeo"
  /** Self-ID / diversity survey. Never model-answered. */
  | "demographic"
  /** Structured address questions. */
  | "location"

/** One question, as the ATS itself describes it. */
export interface SchemaField {
  /**
   * The provider's own field name (`first_name`, `question_62720861`).
   * Greenhouse renders this verbatim as the DOM `id`, which is what lets a
   * schema entry be matched to a scanned control with no fuzzy text matching.
   */
  name: string
  label: string
  type: WidgetKind
  required: boolean
  /** Exact allowed answers. Empty for free-text fields. */
  options: string[]
  group: SchemaGroup
}

export interface AtsSchema {
  portal: string
  fields: SchemaField[]
  /** Set when the posting is closed / the API returned no such job. */
  jobClosed?: boolean
}

// ─── Greenhouse ───

/**
 * Pull the board token and job id out of any Greenhouse URL shape.
 *
 * Four shapes in the wild, and the embed forms carry the token in a query
 * parameter rather than the path:
 *   boards.greenhouse.io/acme/jobs/123
 *   job-boards.greenhouse.io/acme/jobs/123
 *   boards.greenhouse.io/embed/job_app?for=acme&token=123
 *   acme.com/careers?gh_jid=123          ← job id only, board unknown
 */
export function parseGreenhouseUrl(rawUrl: string): { board: string; jobId: string } | null {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return null
  }
  if (!/greenhouse\.io$/i.test(u.hostname) && !/[?&]gh_jid=/i.test(rawUrl)) return null

  // Embed form: both parts live in the query string.
  const forParam = u.searchParams.get("for")
  const tokenParam = u.searchParams.get("token") || u.searchParams.get("gh_jid")
  if (forParam && tokenParam && /^\d+$/.test(tokenParam)) {
    return { board: forParam, jobId: tokenParam }
  }

  // Path form: /<board>/jobs/<id>
  const m = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/)
  if (m) return { board: m[1], jobId: m[2] }

  return null
}

/** Greenhouse wraps every question in a `fields[]` array; flatten it. */
interface GhField {
  name?: string
  type?: string
  values?: Array<{ value: string | number; label: string }>
}
interface GhQuestion {
  label?: string
  required?: boolean
  fields?: GhField[]
}

function flattenGhQuestions(questions: GhQuestion[] | undefined, group: SchemaGroup): SchemaField[] {
  if (!Array.isArray(questions)) return []
  const out: SchemaField[] = []
  for (const q of questions) {
    for (const f of q.fields ?? []) {
      if (!f.name || !f.type) continue
      const kind = GREENHOUSE_TYPE_MAP[f.type] ?? "text"
      if (kind === "hidden") continue
      out.push({
        // `question_123[]` is how Greenhouse names a multi-select; the DOM id
        // drops the brackets, and the id is our join key.
        name: f.name.replace(/\[\]$/, ""),
        label: decodeEntities(String(q.label ?? "")).replace(/\s+/g, " ").trim(),
        type: kind,
        // A question with two fields (résumé: file OR text) is required as a
        // question, not per-field — but Greenhouse only ever marks the question.
        required: !!q.required,
        options: (f.values ?? []).map((v) => String(v.label)).filter(Boolean),
        group,
      })
    }
  }
  return out
}

/** Greenhouse double-encodes HTML in label and description strings. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;[^&]*&gt;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
}

/**
 * The full question set for a Greenhouse posting.
 *
 * Returns null — never throws — when the URL is not Greenhouse, the board is
 * private, or the network is unhappy. `jobClosed` is distinguished from a plain
 * failure because a 404 here is a real, permanent answer: the posting is gone,
 * and the run should not burn a browser session discovering that.
 */
export async function fetchGreenhouseSchema(
  rawUrl: string,
  timeoutMs = 8000
): Promise<AtsSchema | null> {
  const parsed = parseGreenhouseUrl(rawUrl)
  if (!parsed) return null

  const api = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(parsed.board)}/jobs/${encodeURIComponent(parsed.jobId)}?questions=true`

  let res: Response
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    res = await fetch(api, { signal: controller.signal, headers: { Accept: "application/json" } })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 404) return { portal: "Greenhouse", fields: [], jobClosed: true }
  if (!res.ok) return null

  let data: any
  try {
    data = await res.json()
  } catch {
    return null
  }
  if (!data || data.status === 404 || data.error) return null

  const fields: SchemaField[] = [
    ...flattenGhQuestions(data.questions, "custom"),
    ...flattenGhQuestions(data.location_questions, "location"),
  ]

  // Compliance is an ARRAY of blocks, each with its own questions[].
  for (const block of Array.isArray(data.compliance) ? data.compliance : []) {
    fields.push(...flattenGhQuestions(block?.questions, "eeo"))
  }

  // Demographic questions use a different shape: answer_options, not fields[].
  const demo = data.demographic_questions
  for (const q of Array.isArray(demo?.questions) ? demo.questions : []) {
    if (!q?.id) continue
    fields.push({
      name: `demographic_question_${q.id}`,
      label: decodeEntities(String(q.label ?? "")).replace(/\s+/g, " ").trim(),
      type: q.type === "multi_select" ? "multiselect" : "select",
      required: !!q.required,
      options: (q.answer_options ?? []).map((o: any) => String(o.label)).filter(Boolean),
      group: "demographic",
    })
  }

  // The first four standard fields are always present but Greenhouse only lists
  // them inside `questions`; anything it did list has already been captured
  // above, so nothing is synthesised here. De-dup on name, first wins.
  const seen = new Set<string>()
  const deduped = fields.filter((f) => {
    if (!f.name || seen.has(f.name)) return false
    seen.add(f.name)
    return true
  })

  return { portal: "Greenhouse", fields: deduped }
}

// ─── Ashby ───

/** Ashby's application-form field types → widget kind. */
const ASHBY_FORM_TYPE_MAP: Record<string, WidgetKind> = {
  String: "text",
  LongText: "longtext",
  Email: "email",
  Phone: "phone",
  Number: "number",
  Score: "number",
  Date: "date",
  File: "file",
  Boolean: "radio",
  ValueSelect: "select",
  MultiValueSelect: "multiselect",
  SocialLink: "url",
  Url: "url",
  Location: "typeahead",
  Currency: "text",
  RichText: "longtext",
}

/** jobs.ashbyhq.com/<org>/<jobPostingId>[/application] */
export function parseAshbyUrl(rawUrl: string): { org: string; jobPostingId: string } | null {
  try {
    const u = new URL(rawUrl)
    if (!/ashbyhq\.com$/i.test(u.hostname)) return null
    const m = u.pathname.match(/^\/([^/]+)\/([0-9a-f-]{20,})/i)
    if (!m) return null
    return { org: m[1], jobPostingId: m[2] }
  } catch {
    return null
  }
}

/**
 * The full question set for an Ashby posting.
 *
 * Ashby's official `jobPosting.info` exposes `applicationFormDefinition`, but it
 * needs the EMPLOYER's API key, which we will never have for an arbitrary
 * company. The job board's own front end, however, reads the same definition
 * from an unauthenticated GraphQL endpoint — the one the page itself calls to
 * render the form. That is what this uses.
 *
 * `field` comes back as raw JSON (Ashby types it as `JSON!`), which is why the
 * query asks for it wholesale rather than selecting subfields.
 *
 * This matters more on Ashby than anywhere else: its Boolean questions render as
 * bare <button>Yes</button> pairs with no backing input, and its Location and
 * Date fields carry no id — so the DOM alone cannot reliably say what is being
 * asked, what type it is, or whether it is required.
 */
export async function fetchAshbySchema(rawUrl: string, timeoutMs = 8000): Promise<AtsSchema | null> {
  const parsed = parseAshbyUrl(rawUrl)
  if (!parsed) return null

  const query = `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
  jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
    applicationForm { sections { title fieldEntries { id isRequired field } } }
  }
}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let data: any
  try {
    const res = await fetch("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        operationName: "ApiJobPosting",
        variables: { organizationHostedJobsPageName: parsed.org, jobPostingId: parsed.jobPostingId },
        query,
      }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    data = await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }

  if (data?.errors?.length) return null
  const sections = data?.data?.jobPosting?.applicationForm?.sections
  if (!Array.isArray(sections)) return null
  if (sections.length === 0) return { portal: "Ashby", fields: [], jobClosed: true }

  const fields: SchemaField[] = []
  for (const section of sections) {
    for (const entry of section?.fieldEntries ?? []) {
      const f = entry?.field
      if (!f?.path || !f?.type) continue
      const kind = ASHBY_FORM_TYPE_MAP[f.type] ?? "text"
      const options: string[] = (f.selectableValues ?? [])
        .map((v: any) => String(v?.label ?? v?.value ?? ""))
        .filter(Boolean)
      fields.push({
        // Ashby renders `path` verbatim as the DOM id for every control that
        // has one, which is what makes the join exact rather than fuzzy.
        name: String(f.path),
        label: String(f.title ?? "").replace(/\s+/g, " ").trim(),
        type: kind,
        required: !!entry.isRequired,
        // A Boolean question offers Yes/No; Ashby does not spell that out.
        options: kind === "radio" && options.length === 0 ? ["Yes", "No"] : options,
        group: /^_systemfield_/.test(String(f.path)) ? "standard" : "custom",
      })
    }
  }
  return { portal: "Ashby", fields }
}

/**
 * Fetch whatever schema we can for a posting.
 *
 * Lever is absent deliberately: its postings API returns the description and
 * nothing about custom questions, verified against several hundred live
 * postings. Lever stays DOM-driven, which is tolerable because its apply page is
 * plain server-rendered HTML with stable `name` attributes.
 */
export async function fetchAtsSchema(portal: string, url: string): Promise<AtsSchema | null> {
  if (portal === "Greenhouse") return fetchGreenhouseSchema(url)
  if (portal === "Ashby") return fetchAshbySchema(url)
  return null
}

// ─── Applying a schema to what the DOM scan found ───

/** The subset of an inventory item this module needs to read or overwrite. */
export interface EnrichableItem {
  key: string
  label: string
  kind: string
  required: boolean
  options: string[]
  /** Set when a schema entry backed this item. */
  schemaName?: string
  schemaGroup?: SchemaGroup
}

/** `id:question_123` / `name:first_name` → `question_123` / `first_name`. */
function domNameOf(key: string): string | null {
  const m = key.match(/^(?:id|name):(.+)$/)
  if (!m) return null
  return m[1].replace(/\[\]$/, "")
}

/**
 * Widget kinds that describe a real interaction the DOM discovered.
 *
 * When the scan reports one of these and the schema disagrees by claiming a
 * plain text box, the scan is right: the schema describes the ANSWER's data
 * type, not the control's behaviour.
 */
const INTERACTIVE_DOM_KINDS = new Set([
  "typeahead", "select", "multiselect", "radio", "checkbox", "buttongroup", "date", "file",
])

function preferDomKind(domKind: string, schemaKind: string): string {
  // The DOM observed the control; the schema only declares the answer's data
  // type. Whenever the scan managed to identify a real widget, it wins.
  //
  // The earlier version only applied when the SCHEMA kind was weak, which meant
  // Ashby's `Boolean → "radio"` overrode the scan's "buttongroup" — discarding
  // the one fact that matters, that the control is a pair of bare <button>s —
  // and Greenhouse's `multi_value_single_select → "select"` overrode a
  // "typeahead" react-select. Both are exactly what the rule exists to prevent.
  if (INTERACTIVE_DOM_KINDS.has(domKind)) return domKind
  // Otherwise the scan only managed "text"/"unknown", and a schema saying
  // "dropdown, with these options" is a genuine upgrade.
  return schemaKind || domKind
}

/** Collapse a label to a comparable identity. Mirrors nqNormLabel in the VM. */
function normLabel(s: string): string {
  return (s || "")
    .replace(/[*\u2731\uff0a\u2217\u066d]+/g, " ")
    .replace(/\(optional\)|\(required\)/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
    .slice(0, 80)
}

/**
 * Overlay the authoritative schema onto scanned controls.
 *
 * Matching is by the provider's own field name, never by label text — that is
 * the entire point. A Greenhouse control carries `id="question_62720861"` and
 * the schema carries `name: "question_62720861"`, so the join is exact and a
 * truncated or reworded label cannot break it.
 *
 * Returns the enriched items plus the schema fields that had no control on the
 * page. Those are usually on a later wizard step, but a REQUIRED one that never
 * appears is worth surfacing: it means the form we are looking at is not the
 * form the ATS believes it is serving.
 */
export function applySchema<T extends EnrichableItem>(
  items: T[],
  schema: AtsSchema
): { items: T[]; unmatchedRequired: SchemaField[] } {
  const byName = new Map(schema.fields.map((f) => [f.name, f]))
  // ── Why a label index exists alongside the name index ──
  //
  // Matching on the provider's field name is exact and always preferred. But not
  // every control HAS one: Ashby renders its Location combobox, its date picker
  // and its Boolean button pairs with no id and no name at all, so those are
  // keyed on their label. Without this second index the three hardest fields on
  // an Ashby form — the ones that were going unanswered — get no schema at all.
  const byLabel = new Map<string, SchemaField>()
  for (const f of schema.fields) {
    const k = normLabel(f.label)
    // First writer wins: a duplicate label (Greenhouse's file/text résumé pair)
    // must not have its authoritative entry overwritten by the alternate.
    if (k && !byLabel.has(k)) byLabel.set(k, f)
  }
  const matched = new Set<string>()

  const enriched = items.map((item) => {
    const dom = domNameOf(item.key)
    const hit = (dom ? byName.get(dom) : undefined) ?? byLabel.get(normLabel(item.label))
    if (!hit) return item
    matched.add(hit.name)
    return {
      ...item,
      // The schema's label is untruncated and unmangled — always prefer it.
      label: hit.label || item.label,
      // Required is authoritative from the schema. Our asterisk heuristic both
      // over- and under-reports, and both directions are damaging: a false
      // positive blocks submit forever, a false negative skips a real question.
      required: hit.required,
      // Options only when the schema actually has them; a closed dropdown
      // legitimately scans as having none.
      options: hit.options.length > 0 ? hit.options : item.options,
      // ─── The DOM wins on HOW, the schema wins on WHAT ───
      //
      // `kind` selects the handler, so it must describe how the control is
      // actually rendered — and only the DOM knows that. Greenhouse's schema
      // calls its Location field `input_text`, but the page renders a
      // react-select combobox with a hidden lat/long pair behind it. Taking the
      // schema's word for it picked the plain text handler, which typed the city
      // straight into the box without ever opening the dropdown: the visible
      // field looked right, the hidden companions stayed empty, and the form
      // rejected the submission.
      //
      // The same applies to Ashby's Boolean questions, which the schema types as
      // `Boolean` while the page renders a pair of bare <button>s.
      kind: preferDomKind(item.kind, hit.type),
      schemaName: hit.name,
      schemaGroup: hit.group,
    }
  })

  const unmatchedRequired = schema.fields.filter((f) => f.required && !matched.has(f.name))
  return { items: enriched, unmatchedRequired }
}
