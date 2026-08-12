import { createClient } from '@supabase/supabase-js'
import { errorResponse } from './http.ts'

/** Lightweight user info extracted from JWT claims */
export interface AuthUser {
  id: string
  email: string | undefined
}

// Shared client for JWKS-based local JWT verification (no network call per request).
// Fail fast at module load so a misconfigured deploy (missing URL/key, or an anon
// key from a different project than SUPABASE_URL) is caught at startup rather than
// degrading JWT verification silently at request time.
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')
if (!supabaseUrl) {
  throw new Error('Missing required env SUPABASE_URL')
}
if (!supabaseKey) {
  throw new Error('Missing required env SB_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY)')
}

const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Authenticate the request and return the user.
 * Uses getClaims() for local JWKS verification (no network roundtrip).
 * Throws a Response if authentication fails.
 */
export async function getAuthenticatedUser(req: Request): Promise<AuthUser> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    throw errorResponse('No authorization header', 401)
  }

  // Strict scheme parse: require exactly "Bearer <token>" and reject anything else,
  // rather than naively stripping the first 'Bearer ' substring.
  const match = authHeader.match(/^Bearer (.+)$/)
  if (!match) {
    throw errorResponse('Unauthorized', 401)
  }
  const token = match[1]
  const { data, error } = await supabase.auth.getClaims(token)

  if (error || !data?.claims?.sub) {
    throw errorResponse('Unauthorized', 401)
  }

  return {
    id: data.claims.sub as string,
    email: data.claims.email as string | undefined,
  }
}
