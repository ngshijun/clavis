/**
 * Pure rules for the `set-password` edge function: whose password a caller
 * may set, and what a new password must be.
 *
 * Kept free of Deno/Supabase imports so they are unit-testable
 * (`rules.test.ts`, run by `pnpm test`).
 */

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  type CallerProfile,
} from '../create-user/provisioning.ts'

/** Wire format of the request body (unvalidated). */
export interface SetPasswordBody {
  userId?: unknown
  password?: unknown
}

/** A validated request: whose password, and what it becomes. */
export interface PasswordChange {
  userId: string
  password: string
}

/** The request as asked for, or null when it does not say whose password or the password is not one. */
export function parsePasswordChange(body: SetPasswordBody): PasswordChange | null {
  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!userId) return null
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) return null

  return { userId, password }
}

/**
 * Whether the caller may set the account's password. A teacher and a student
 * cannot change their own: only a manager sets it, for the teachers and
 * students of their own organization. Nobody sets a manager's or an admin's
 * here.
 */
export function maySetPassword(caller: CallerProfile, account: CallerProfile | null): boolean {
  return (
    caller.role === 'manager' &&
    caller.organizationId !== null &&
    account !== null &&
    (account.role === 'teacher' || account.role === 'student') &&
    account.organizationId === caller.organizationId
  )
}
