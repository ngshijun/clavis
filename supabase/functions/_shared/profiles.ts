import type { CallerProfile, UserRole } from '../create-user/provisioning.ts'
import { supabaseAdmin } from './supabase-admin.ts'

/**
 * An account's role and organization, read from `profiles` with the
 * service-role key: what a function trusts about whoever is asking and about
 * whoever they are asking about. Null when there is no such account.
 */
export async function loadProfile(userId: string): Promise<CallerProfile | null> {
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
