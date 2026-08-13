import { ref } from 'vue'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { errorMessages } from '@/lib/errors'

export type ProvisionableRole = 'manager' | 'teacher' | 'student'

export interface CreateUserPayload {
  role: ProvisionableRole
  name: string
  password: string
  /** Staff accounts (manager / teacher) sign in with a real email. */
  email?: string
  /** Students sign in with a username; the server synthesizes their email. */
  username?: string
  /** Only an admin passes this (the target org for a new manager). */
  organizationId?: string
  gradeLevelId?: string
}

export interface CreatedAccount {
  userId: string
  role: ProvisionableRole
  name: string
  email: string
  username: string | null
  /** Echoed once so the creator can hand the credentials over. */
  password: string
  organizationId: string
}

/**
 * Map the edge function's stable machine codes onto localized copy.
 * Anything unrecognized falls back to the generic provisioning failure.
 */
function messageForCode(code: string): string {
  const errors = errorMessages()
  switch (code) {
    case 'FORBIDDEN':
      return errors.provisionForbidden
    case 'INVALID_INPUT':
      return errors.provisionInvalidInput
    case 'EMAIL_TAKEN':
      return errors.provisionEmailTaken
    case 'USERNAME_TAKEN':
      return errors.provisionUsernameTaken
    case 'ORGANIZATION_NOT_FOUND':
      return errors.provisionOrganizationNotFound
    case 'GRADE_LEVEL_NOT_FOUND':
      return errors.provisionGradeLevelNotFound
    default:
      return errors.provisionFailed
  }
}

/**
 * Wraps the `create-user` Edge Function so the three provisioning surfaces
 * (admin → manager, manager → teacher, manager → student) share one code path.
 * The caller hierarchy itself is enforced server-side from the caller's JWT.
 */
export function useCreateUser() {
  const isSubmitting = ref(false)

  async function createUser(
    payload: CreateUserPayload,
  ): Promise<{ account: CreatedAccount | null; error: string | null }> {
    isSubmitting.value = true
    try {
      const { data, error } = await supabase.functions.invoke<CreatedAccount>('create-user', {
        body: payload,
      })

      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null)
          return { account: null, error: messageForCode(String(body?.error ?? '')) }
        }
        console.error('[create-user]', error)
        return { account: null, error: errorMessages().network }
      }

      if (!data) {
        return { account: null, error: errorMessages().provisionFailed }
      }

      return { account: data, error: null }
    } finally {
      isSubmitting.value = false
    }
  }

  return { isSubmitting, createUser }
}
