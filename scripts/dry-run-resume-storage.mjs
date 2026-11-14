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

console.log(`Found ${profiles.length} profiles. Calculating storage...\n`)

let totalBytes = 0
let totalFiles = 0
let profilesWithResumes = 0

for (const { id } of profiles) {
  const { data: files, error: listErr } = await supabase.storage.from('resumes').list(id)
  if (listErr || !files?.length) continue

  const bytes = files.reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0)
  totalBytes += bytes
  totalFiles += files.length
  profilesWithResumes++
  console.log(`  [${id}] ${files.length} file(s) — ${(bytes / 1024).toFixed(1)} KB`)
}

console.log(`\nProfiles with resumes : ${profilesWithResumes} / ${profiles.length}`)
console.log(`Total files           : ${totalFiles}`)
console.log(`Total storage to free : ${(totalBytes / 1024 / 1024).toFixed(2)} MB`)
