/**
 * Drafts Sales & Outreach messages for recent signups that don't have one yet.
 *   node --env-file=.env.local --import tsx scripts/draft-outreach.ts [days] [--regenerate]
 */
import { draftMessages } from "../lib/outreach"
import { loadLlmKeys, loadOutreachRows, toProfile } from "../lib/outreach-data"
import { createAdminClient } from "../lib/supabase/admin"

const days = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 7)
const regenerate = process.argv.includes("--regenerate")

async function main() {
  const supabase = createAdminClient()
  const rows = await loadOutreachRows(supabase, days)
  const targets = rows.filter((r) => regenerate || !r.message)
  console.log(`${rows.length} signups in the last ${days} days, drafting ${targets.length}`)
  const drafts = await draftMessages(targets.map((r) => toProfile(r)), await loadLlmKeys(supabase))
  const now = new Date().toISOString()
  const { error } = await supabase.from("outreach_contacts").upsert(
    drafts.map((d) => ({ user_id: d.userId, message: d.message, model: d.model, generated_at: now, updated_at: now })),
    { onConflict: "user_id" }
  )
  if (error) throw new Error(error.message)
  const byModel: Record<string, number> = {}
  for (const d of drafts) byModel[d.model] = (byModel[d.model] ?? 0) + 1
  console.log("drafted:", byModel)
}

main().catch((e) => { console.error(e); process.exit(1) })
