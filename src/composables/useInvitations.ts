import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/stores/auth'
import { errorMessages, handleError } from '@/lib/errors'
import { mapInvitationRows, type ParentStudentInvitation } from '@/lib/invitations'
import type { Database } from '@/types/database.types'

export type InvitationRole = 'parent' | 'student'

export type AcceptInvitationResult =
  Database['public']['Functions']['accept_parent_student_invitation']['Returns'][number]

export interface InvitationHooks {
  /** Return error message to block send, or null to allow */
  canSend?: (targetEmail: string) => string | null
  /** Return error message to block accept, or null to allow */
  canAccept?: () => string | null
  /** Called after successful accept with typed RPC result row */
  onAccepted?: (result: AcceptInvitationResult) => void
}

export function useInvitations(role: InvitationRole, hooks?: InvitationHooks) {
  const authStore = useAuthStore()

  // Fields that vary by role (DB column names for Supabase queries)
  const ownIdCol = role === 'student' ? 'student_id' : 'parent_id'
  const ownEmailCol = role === 'student' ? 'student_email' : 'parent_email'
  // Camel-case keys for ParentStudentInvitation interface
  const ownIdKey = role === 'student' ? 'studentId' : ('parentId' as const)
  const ownEmailKey = role === 'student' ? 'studentEmail' : ('parentEmail' as const)
  const targetEmailKey = role === 'student' ? 'parentEmail' : ('studentEmail' as const)
  const targetType = role === 'student' ? 'parent' : 'student'
  const sendDirection = role === 'student' ? 'student_to_parent' : ('parent_to_student' as const)
  const receiveDirection = role === 'student' ? 'parent_to_student' : ('student_to_parent' as const)
  const roleCheck = role === 'student' ? () => authStore.isStudent : () => authStore.isParent

  // Error keys vary by role; resolved at error time so language switches take effect
  const notAuthenticatedKey =
    role === 'student' ? 'notAuthenticatedAsStudent' : 'notAuthenticatedAsParent'
  const noAccountKey =
    targetType === 'parent' ? 'noParentAccountForEmail' : 'noStudentAccountForEmail'
  const wrongAccountTypeKey =
    targetType === 'parent' ? 'emailNotParentAccount' : 'emailNotStudentAccount'

  const invitations = ref<ParentStudentInvitation[]>([])

  const receivedInvitations = computed(() => {
    if (!authStore.user || !roleCheck()) return []
    return invitations.value.filter((inv) => {
      const matchesId = inv[ownIdKey] === authStore.user!.id
      const matchesEmail = inv[ownEmailKey].toLowerCase() === authStore.user!.email.toLowerCase()
      return (
        (matchesId || matchesEmail) &&
        inv.direction === receiveDirection &&
        inv.status === 'pending'
      )
    })
  })

  const sentInvitations = computed(() => {
    if (!authStore.user || !roleCheck()) return []
    return invitations.value.filter((inv) => {
      return (
        inv[ownIdKey] === authStore.user!.id &&
        inv.direction === sendDirection &&
        inv.status === 'pending'
      )
    })
  })

  async function fetchInvitations(): Promise<{ error: string | null }> {
    if (!authStore.user || !roleCheck()) {
      return { error: errorMessages()[notAuthenticatedKey] }
    }

    try {
      // Run two .eq() queries and merge rather than a string-built .or(): the email
      // value would otherwise be interpolated raw into PostgREST's .or() filter grammar,
      // where commas/parentheses are structural delimiters and would corrupt the filter.
      const [byId, byEmail] = await Promise.all([
        supabase
          .from('parent_student_invitations')
          .select('*')
          .eq(ownIdCol, authStore.user.id)
          .in('status', ['pending'])
          .order('created_at', { ascending: false }),
        supabase
          .from('parent_student_invitations')
          .select('*')
          .eq(ownEmailCol, authStore.user.email)
          .in('status', ['pending'])
          .order('created_at', { ascending: false }),
      ])

      if (byId.error) throw byId.error
      if (byEmail.error) throw byEmail.error

      // Merge and de-duplicate by row id (a row can match both id and email)
      const merged = new Map<string, NonNullable<typeof byId.data>[number]>()
      for (const row of [...(byId.data ?? []), ...(byEmail.data ?? [])]) {
        merged.set(row.id, row)
      }

      invitations.value = await mapInvitationRows([...merged.values()])

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedLoadInvitations') }
    }
  }

  async function sendInvitation(
    targetEmail: string,
  ): Promise<{ success?: boolean; invitation?: ParentStudentInvitation; error?: string }> {
    if (!authStore.user || !roleCheck()) {
      return { error: errorMessages()[notAuthenticatedKey] }
    }

    // Run hook validation
    if (hooks?.canSend) {
      const hookError = hooks.canSend(targetEmail)
      if (hookError) return { error: hookError }
    }

    // Check if invitation already exists
    const existingInvitation = invitations.value.find(
      (inv) =>
        inv[targetEmailKey].toLowerCase() === targetEmail.toLowerCase() && inv.status === 'pending',
    )
    if (existingInvitation) {
      return { error: errorMessages().invitationAlreadyPending }
    }

    try {
      // Look up the target by email — they must exist in the system
      const { data: targetProfile, error: lookupError } = await supabase
        .from('profiles')
        .select('id, name, user_type')
        .eq('email', targetEmail.toLowerCase())
        .single()

      if (lookupError || !targetProfile) {
        return { error: errorMessages()[noAccountKey] }
      }

      if (targetProfile.user_type !== targetType) {
        return { error: errorMessages()[wrongAccountTypeKey] }
      }

      const insertData =
        role === 'student'
          ? {
              student_id: authStore.user.id,
              student_email: authStore.user.email,
              parent_id: targetProfile.id,
              parent_email: targetEmail,
              direction: 'student_to_parent' as const,
              status: 'pending' as const,
            }
          : {
              parent_id: authStore.user.id,
              parent_email: authStore.user.email,
              student_id: targetProfile.id,
              student_email: targetEmail,
              direction: 'parent_to_student' as const,
              status: 'pending' as const,
            }

      const { data, error: insertError } = await supabase
        .from('parent_student_invitations')
        .insert(insertData)
        .select()
        .single()

      if (insertError) {
        // The local cache scan above is only a UX shortcut; the partial unique
        // constraint on (parent_id, student_id) WHERE status = 'pending' is the real
        // guard. A duplicate pending row surfaces as a unique_violation (23505) — map
        // it to the friendly "already pending" message rather than the generic one.
        if (insertError.code === '23505') {
          return { error: errorMessages().invitationAlreadyPending }
        }
        throw insertError
      }

      const invitation: ParentStudentInvitation = {
        id: data.id,
        parentId: data.parent_id,
        parentEmail: data.parent_email,
        parentName: role === 'parent' ? authStore.user.name : targetProfile.name,
        studentId: data.student_id,
        studentEmail: data.student_email,
        studentName: role === 'student' ? authStore.user.name : targetProfile.name,
        direction: data.direction,
        status: data.status ?? 'pending',
        createdAt: data.created_at ?? new Date().toISOString(),
        respondedAt: data.responded_at,
      }

      invitations.value.push(invitation)

      return { success: true, invitation }
    } catch (err) {
      return { error: handleError(err, 'failedSendInvitation') }
    }
  }

  async function acceptInvitation(
    invitationId: string,
  ): Promise<{ success?: boolean; error?: string }> {
    if (!authStore.user || !roleCheck()) {
      return { error: errorMessages()[notAuthenticatedKey] }
    }

    const invitation = invitations.value.find((inv) => inv.id === invitationId)
    if (!invitation) {
      return { error: errorMessages().invitationNotFound }
    }

    // Run hook validation
    if (hooks?.canAccept) {
      const hookError = hooks.canAccept()
      if (hookError) return { error: hookError }
    }

    try {
      const { data, error: rpcError } = await supabase.rpc('accept_parent_student_invitation', {
        p_invitation_id: invitationId,
        p_accepting_user_id: authStore.user.id,
        p_is_parent: role === 'parent',
      })

      if (rpcError) throw rpcError

      const result = data?.[0]
      if (result && hooks?.onAccepted) {
        hooks.onAccepted(result)
      }

      // Remove from invitations
      const index = invitations.value.findIndex((inv) => inv.id === invitationId)
      if (index !== -1) {
        invitations.value.splice(index, 1)
      }

      return { success: true }
    } catch (err: unknown) {
      return { error: handleError(err, 'failedAcceptInvitation') }
    }
  }

  async function rejectInvitation(
    invitationId: string,
  ): Promise<{ success?: boolean; error?: string }> {
    if (!authStore.user || !roleCheck()) {
      return { error: errorMessages()[notAuthenticatedKey] }
    }

    try {
      const { error: updateError } = await supabase
        .from('parent_student_invitations')
        .update({
          status: 'rejected',
          responded_at: new Date().toISOString(),
          [ownIdCol]: authStore.user.id,
        })
        .eq('id', invitationId)

      if (updateError) throw updateError

      // Remove from invitations
      const index = invitations.value.findIndex((inv) => inv.id === invitationId)
      if (index !== -1) {
        invitations.value.splice(index, 1)
      }

      return { success: true }
    } catch (err) {
      return { error: handleError(err, 'failedDeclineInvitation') }
    }
  }

  async function cancelInvitation(
    invitationId: string,
  ): Promise<{ success?: boolean; error?: string }> {
    if (!authStore.user || !roleCheck()) {
      return { error: errorMessages()[notAuthenticatedKey] }
    }

    try {
      const { error: updateError } = await supabase
        .from('parent_student_invitations')
        .update({
          status: 'cancelled',
          responded_at: new Date().toISOString(),
        })
        .eq('id', invitationId)
        .eq(ownIdCol, authStore.user.id)

      if (updateError) throw updateError

      // Remove from invitations
      const index = invitations.value.findIndex((inv) => inv.id === invitationId)
      if (index !== -1) {
        invitations.value.splice(index, 1)
      }

      return { success: true }
    } catch (err) {
      return { error: handleError(err, 'failedCancelInvitation') }
    }
  }

  function $reset() {
    invitations.value = []
  }

  return {
    invitations,
    receivedInvitations,
    sentInvitations,
    fetchInvitations,
    sendInvitation,
    acceptInvitation,
    rejectInvitation,
    cancelInvitation,
    $reset,
  }
}
