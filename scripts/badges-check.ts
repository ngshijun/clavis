// Verifies that every active badge slug in the DB has matching en + zh locale
// entries with both `name` and `description`. Fails with exit code 1 if any
// slug is missing a translation. Run in CI before build.

import { createClient } from '@supabase/supabase-js'
import enStudent from '../src/locales/en/student'
import zhStudent from '../src/locales/zh/student'
import type { Database } from '../src/types/database.types'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_KEY)

interface LocaleBadgeEntry {
  name?: string
  description?: string
}

async function main() {
  const { data, error } = await supabase.from('badges').select('slug').eq('is_active', true)

  if (error) {
    console.error('Failed to fetch badges:', error.message)
    process.exit(1)
  }

  const missing: string[] = []
  const enBadges = enStudent.badges as Record<string, LocaleBadgeEntry | undefined>
  const zhBadges = zhStudent.badges as Record<string, LocaleBadgeEntry | undefined>

  for (const { slug } of data ?? []) {
    const enEntry = enBadges[slug]
    const zhEntry = zhBadges[slug]
    if (!enEntry?.name || !enEntry.description) missing.push(`en/${slug}`)
    if (!zhEntry?.name || !zhEntry.description) missing.push(`zh/${slug}`)
  }

  if (missing.length > 0) {
    console.error('Missing badge translations:')
    for (const m of missing) console.error(`  - ${m}`)
    process.exit(1)
  }

  console.log(`All ${data?.length ?? 0} active badges have en + zh translations`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
