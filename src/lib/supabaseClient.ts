import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types.ts'

const supabaseKey = import.meta.env.VITE_SUPABASE_KEY
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

// Fail fast with a clear config error rather than an opaque URL-constructor
// throw at module load if the env vars are missing/malformed.
if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL is not set')
}
if (!supabaseKey) {
  throw new Error('VITE_SUPABASE_KEY is not set')
}

// Extract project ref from Supabase URL for storage key
// URL format: https://<project-ref>.supabase.co
const projectRef = new URL(supabaseUrl).hostname.split('.')[0]

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

/**
 * Clear Supabase auth data from localStorage.
 *
 * This is needed when signOut() fails due to an already-invalid session
 * (e.g., user logged out from another domain). Supabase's signOut() cannot
 * clear localStorage in this case because _useSession() fails first.
 *
 * Removes every key matching the Supabase auth-token prefix, including the
 * chunked variants (`.0`, `.1`, …) used for large sessions, so no stale token
 * lingers if the session was split across multiple keys.
 */
export function clearSupabaseAuth(): void {
  const prefix = `sb-${projectRef}-auth-token`
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key))
}
