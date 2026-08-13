import '@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders, errorResponse } from '../_shared/http.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import {
  isProvisionError,
  planProvisioning,
  type CallerProfile,
  type ProvisionPlan,
  type UserRole,
} from './provisioning.ts'

/**
 * Hierarchical account provisioning (service role).
 *
 * admin → manager · manager → { teacher, student }.
 * The caller is identified from their JWT and re-read from `profiles`; nothing
 * about the caller (role, organization) is trusted from the request body.
 *
 * Errors are stable machine codes ({ error: "FORBIDDEN" | ... }) that the client
 * localizes; details are logged server-side only.
 */

interface CreatedAccount {
  userId: string
  role: Exclude<UserRole, 'admin'>
  name: string
  email: string
  username: string | null
  /** Echoed back once so the creator can hand the credentials over. */
  password: string
  organizationId: string
}

async function loadCaller(userId: string): Promise<CallerProfile | null> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, user_type, organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return null

  return {
    id: data.id,
    role: data.user_type as UserRole,
    organizationId: data.organization_id,
  }
}

/** True when Supabase Auth rejected the create because the email is taken. */
function isEmailTaken(error: { code?: string; status?: number; message?: string }): boolean {
  return (
    error.code === 'email_exists' ||
    error.code === 'user_already_exists' ||
    (error.status === 422 && /already been registered/i.test(error.message ?? ''))
  )
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return errorResponse('INVALID_INPUT', 400)
    }

    const caller = await loadCaller(user.id)
    if (!caller) {
      return errorResponse('FORBIDDEN', 403, `no profile for caller ${user.id}`)
    }

    const planned = planProvisioning(caller, body)
    if (isProvisionError(planned)) {
      return errorResponse(planned.code, planned.status, planned.detail)
    }
    const plan: ProvisionPlan = planned

    // The organization must exist; a non-admin's org comes from their own profile
    // so this only ever fails on an admin passing a stale id.
    const { data: organization } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('id', plan.organizationId)
      .maybeSingle()

    if (!organization) {
      return errorResponse('ORGANIZATION_NOT_FOUND', 404)
    }

    if (plan.role === 'student') {
      const { data: gradeLevel } = await supabaseAdmin
        .from('grade_levels')
        .select('id')
        .eq('id', plan.gradeLevelId!)
        .maybeSingle()

      if (!gradeLevel) {
        return errorResponse('GRADE_LEVEL_NOT_FOUND', 404)
      }

      const { data: usernameOwner } = await supabaseAdmin
        .from('student_profiles')
        .select('id')
        .eq('username', plan.username!)
        .maybeSingle()

      if (usernameOwner) {
        return errorResponse('USERNAME_TAKEN', 409)
      }
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: plan.email,
      password: plan.password,
      email_confirm: true,
      user_metadata: { name: plan.name },
    })

    if (createError || !created?.user) {
      if (createError && isEmailTaken(createError)) {
        return errorResponse(plan.role === 'student' ? 'USERNAME_TAKEN' : 'EMAIL_TAKEN', 409)
      }
      return errorResponse('CREATE_FAILED', 500, createError)
    }

    const userId = created.user.id

    // profiles.id → auth.users(id) ON DELETE CASCADE, so deleting the auth user
    // is a complete rollback for every failure below.
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: userId,
      email: plan.email,
      name: plan.name,
      user_type: plan.role,
      organization_id: plan.organizationId,
    })

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return errorResponse('CREATE_FAILED', 500, profileError)
    }

    if (plan.role === 'student') {
      const { error: studentError } = await supabaseAdmin.from('student_profiles').insert({
        id: userId,
        username: plan.username,
        grade_level_id: plan.gradeLevelId,
        created_by: plan.createdBy,
      })

      if (studentError) {
        await supabaseAdmin.auth.admin.deleteUser(userId)
        // 23505 = unique violation: the username was claimed between the
        // pre-check and this insert.
        if (studentError.code === '23505') {
          return errorResponse('USERNAME_TAKEN', 409)
        }
        return errorResponse('CREATE_FAILED', 500, studentError)
      }
    }

    const account: CreatedAccount = {
      userId,
      role: plan.role,
      name: plan.name,
      email: plan.email,
      username: plan.username,
      password: plan.password,
      organizationId: plan.organizationId,
    }

    return new Response(JSON.stringify(account), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    if (error instanceof Response) return error
    return errorResponse('CREATE_FAILED', 500, error)
  }
})
