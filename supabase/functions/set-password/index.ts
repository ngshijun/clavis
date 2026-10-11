import '@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import { loadProfile } from '../_shared/profiles.ts'
import { maySetPassword, parsePasswordChange } from './rules.ts'

/**
 * A manager sets a new password for a teacher or a student of their own
 * organization (service role). Nobody else can: a teacher and a student have
 * no way to change or recover a password themselves.
 *
 * The caller is identified from their JWT and both accounts are re-read from
 * `profiles`; nothing about either is trusted from the request body.
 *
 * Errors are stable machine codes ({ error: "FORBIDDEN" | ... }); details are
 * logged server-side only. An account that does not exist is refused in the
 * same words as one the caller may not touch, so the answer tells nothing
 * about other organizations.
 */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(req) })
  }

  try {
    const user = await getAuthenticatedUser(req)

    const body = await req.json().catch(() => null)
    const change = body && typeof body === 'object' ? parsePasswordChange(body) : null
    if (!change) {
      return errorResponse(req, 'INVALID_INPUT', 400)
    }

    const caller = await loadProfile(user.id)
    if (!caller) {
      return errorResponse(req, 'FORBIDDEN', 403, `no profile for caller ${user.id}`)
    }

    const account = await loadProfile(change.userId)
    if (!maySetPassword(caller, account)) {
      return errorResponse(
        req,
        'FORBIDDEN',
        403,
        `${caller.role} ${caller.id} may not set the password of ${change.userId}`,
      )
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(change.userId, {
      password: change.password,
    })
    if (error) {
      return errorResponse(req, 'UPDATE_FAILED', 500, error)
    }

    return jsonResponse(req, { userId: change.userId }, 200)
  } catch (error) {
    if (error instanceof Response) return error
    return errorResponse(req, 'UPDATE_FAILED', 500, error)
  }
})
