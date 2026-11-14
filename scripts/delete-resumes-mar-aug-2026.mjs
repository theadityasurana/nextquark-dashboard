import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://widujxpahzlpegzjjpqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZHVqeHBhaHpscGVnempqcHFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc1MjY2MiwiZXhwIjoyMDg3MzI4NjYyfQ.6KGHcAofT7nFX03JII8yLiEagZfOXWY_0YbEepEf55M'
)

const { data: profiles, error } = await supabase
  .from('profiles')
  .select('id')
  .gte('created_at', '2026-03-01T00:00:00.000Z')
  .lte('created_at', '2026-08-31T23:59:59.999Z')

if (error) { console.error('Failed to fetch profiles:', error.message); process.exit(1) }
if (!profiles.length) { console.log('No profiles found in that range.'); process.exit(0) }

console.log(`Found ${profiles.length} profiles. Deleting resumes...`)

for (const { id } of profiles) {
  const { data: files, error: listErr } = await supabase.storage.from('resumes').list(id)
  if (listErr) { console.error(`  [${id}] list error:`, listErr.message); continue }
  if (!files?.length) { console.log(`  [${id}] no files`); continue }

  const paths = files.map(f => `${id}/${f.name}`)
  const { error: delErr } = await supabase.storage.from('resumes').remove(paths)
  if (delErr) { console.error(`  [${id}] delete error:`, delErr.message); continue }

  await supabase.from('profiles').update({ resume_url: null }).eq('id', id)
  console.log(`  [${id}] deleted ${paths.length} file(s)`)
}

console.log('Done.')
