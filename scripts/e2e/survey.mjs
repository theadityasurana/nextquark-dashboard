/**
 * Survey real application forms across Greenhouse, Ashby and Lever.
 *
 * Read-only. Nothing is filled and nothing is submitted — the point is to learn
 * what field shapes actually occur in the wild, so the handler set and the
 * answering policy are built against reality rather than against three examples.
 *
 * No browser is needed for any of the three:
 *   Greenhouse — public JSON:    boards-api.greenhouse.io/.../jobs/<id>?questions=true
 *   Ashby      — public GraphQL: jobs.ashbyhq.com/api/non-user-graphql
 *   Lever      — the apply page is server-rendered HTML; parse it directly
 *
 *   node scripts/e2e/survey.mjs
 */
import fs from "fs"

const urls = JSON.parse(fs.readFileSync("scripts/e2e/survey-urls.json", "utf8"))
const UA = { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/html" }

const norm = (s) => (s || "").replace(/\s+/g, " ").trim()
const decode = (s) =>
  norm(String(s || "").replace(/&lt;[^&]*&gt;/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " "))

// ─── Greenhouse ───
async function greenhouse(url) {
  const m = url.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([^/?]+)(?:\/jobs\/)?(\d+)?/)
  const board = m?.[1]
  const id = url.match(/\/jobs\/(\d+)/)?.[1] || url.match(/gh_jid=(\d+)/)?.[1]
  if (!board || !id) return null
  const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}?questions=true`, { headers: UA })
  if (!r.ok) return { board, error: `HTTP ${r.status}` }
  const d = await r.json()
  const fields = []
  const push = (qs, group) => {
    for (const q of qs || []) for (const f of q.fields || []) {
      fields.push({ group, name: f.name, type: f.type, required: !!q.required,
                    label: decode(q.label), options: (f.values || []).map((v) => String(v.label)) })
    }
  }
  push(d.questions, "custom")
  push(d.location_questions, "location")
  for (const b of d.compliance || []) push(b.questions, "eeo")
  for (const q of d.demographic_questions?.questions || []) {
    fields.push({ group: "demographic", name: `demographic_${q.id}`, type: q.type || "multi_value_single_select",
                  required: !!q.required, label: decode(q.label), options: (q.answer_options || []).map((o) => String(o.label)) })
  }
  return { board, title: d.title, fields }
}

// ─── Ashby ───
async function ashby(url) {
  const m = url.match(/ashbyhq\.com\/([^/]+)\/([0-9a-f-]{20,})/i)
  if (!m) return null
  const [, org, jobPostingId] = m
  const r = await fetch("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting", {
    method: "POST",
    headers: { ...UA, "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "ApiJobPosting",
      variables: { organizationHostedJobsPageName: org, jobPostingId },
      query: `query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
        jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
          title applicationForm { sections { title fieldEntries { id isRequired field } } } } }`,
    }),
  })
  if (!r.ok) return { board: org, error: `HTTP ${r.status}` }
  const d = await r.json()
  if (d.errors) return { board: org, error: d.errors[0]?.message?.slice(0, 80) }
  const jp = d.data?.jobPosting
  if (!jp) return { board: org, error: "no jobPosting" }
  const fields = []
  for (const s of jp.applicationForm?.sections || []) {
    for (const e of s.fieldEntries || []) {
      const f = e.field || {}
      fields.push({ group: /^_systemfield_/.test(f.path || "") ? "standard" : "custom",
                    name: f.path, type: f.type, required: !!e.isRequired, label: norm(f.title),
                    options: (f.selectableValues || []).map((v) => String(v.label ?? v.value)) })
    }
  }
  return { board: org, title: jp.title, fields }
}

// ─── Lever ───
async function lever(url) {
  const base = url.replace(/\/?$/, "").replace(/\/apply$/, "")
  const org = url.match(/lever\.co\/([^/]+)/)?.[1]
  const r = await fetch(base + "/apply", { headers: UA })
  if (!r.ok) return { board: org, error: `HTTP ${r.status}` }
  const html = await r.text()
  const fields = []

  // Standard + custom inputs, read straight out of the markup.
  for (const tag of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const attrs = tag[2]
    const at = (n) => attrs.match(new RegExp(`${n}="([^"]*)"`, "i"))?.[1] || ""
    const name = at("name")
    const type = at("type") || (tag[1].toLowerCase() === "textarea" ? "textarea" : tag[1].toLowerCase())
    if (!name || type === "hidden") continue
    fields.push({
      group: /^cards\[/.test(name) ? "custom" : /^eeo\[/.test(name) ? "eeo" : "standard",
      name, type, required: /\brequired\b/.test(attrs), label: "", options: [],
      dataQa: at("data-qa"),
    })
  }
  // Question text, so custom cards are readable.
  const labels = [...html.matchAll(/class="application-label[^"]*"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => norm(m[1].replace(/<[^>]+>/g, " "))).filter(Boolean)
  return { board: org, title: norm(html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] || ""), fields, labels,
           hasHcaptcha: /hcaptcha/i.test(html), hasRecaptcha: /recaptcha/i.test(html) }
}

const RUNNERS = { greenhouse, ashby, lever }
const typeTally = {}
const groupTally = {}
const notable = []

for (const [ats, list] of Object.entries(urls)) {
  console.log(`\n${"═".repeat(96)}\n  ${ats.toUpperCase()}\n${"═".repeat(96)}`)
  for (const url of list) {
    let r
    try { r = await RUNNERS[ats](url) } catch (e) { r = { error: String(e).slice(0, 80) } }
    if (!r) { console.log(`\n  ✗ ${url} — could not parse URL`); continue }
    if (r.error) { console.log(`\n  ✗ ${r.board}: ${r.error}`); continue }

    const req = r.fields.filter((f) => f.required).length
    console.log(`\n  ● ${r.board} — "${String(r.title).slice(0, 58)}"  (${r.fields.length} fields, ${req} required)`)
    if (r.hasHcaptcha || r.hasRecaptcha) console.log(`      captcha: ${r.hasHcaptcha ? "hCaptcha" : ""}${r.hasRecaptcha ? " reCAPTCHA" : ""}`)
    for (const f of r.fields) {
      typeTally[`${ats}:${f.type}`] = (typeTally[`${ats}:${f.type}`] || 0) + 1
      groupTally[`${ats}:${f.group}`] = (groupTally[`${ats}:${f.group}`] || 0) + 1
      const opts = f.options?.length ? `  [${f.options.length} opts: ${f.options.slice(0, 3).map((o) => o.slice(0, 22)).join(" / ")}${f.options.length > 3 ? " …" : ""}]` : ""
      console.log(`      ${f.required ? "*" : " "} ${String(f.type).padEnd(24)} ${String(f.label || f.name).slice(0, 52).padEnd(54)}${opts}`)
      if (f.options?.length > 12) notable.push(`${ats}/${r.board}: "${String(f.label || f.name).slice(0, 40)}" has ${f.options.length} options`)
    }
    if (r.labels?.length) console.log(`      labels seen: ${r.labels.slice(0, 14).map((l) => l.slice(0, 26)).join(" | ")}`)
  }
}

console.log(`\n${"═".repeat(96)}\n  FIELD TYPE FREQUENCY\n${"═".repeat(96)}`)
for (const [k, v] of Object.entries(typeTally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
console.log(`\n  GROUPS`)
for (const [k, v] of Object.entries(groupTally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
if (notable.length) {
  console.log(`\n  LARGE OPTION LISTS (typeahead territory)`)
  notable.slice(0, 20).forEach((n) => console.log("   " + n))
}
