/**
 * Pure provisioning rules for the `create-user` edge function.
 *
 * Kept free of Deno/Supabase imports so the hierarchy guard and input
 * validation are unit-testable (`provisioning.test.ts`, run by `pnpm test`).
 */

export type UserRole = 'admin' | 'manager' | 'teacher' | 'student'

/** Domain used to synthesize logins for username-based student accounts. */
export const STUDENT_EMAIL_DOMAIN = 'student.clavis.app'

/** 3-30 chars, starts alphanumeric, then alphanumeric / dot / underscore / hyphen. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MAX_NAME_LENGTH = 100
const MIN_PASSWORD_LENGTH = 8
// bcrypt truncates beyond 72 bytes; reject rather than silently truncate.
const MAX_PASSWORD_LENGTH = 72

/** The authenticated caller, as read from `profiles` with the service-role key. */
export interface CallerProfile {
  id: string
  role: UserRole
  organizationId: string | null
}

/** Wire format of the request body (unvalidated). */
export interface CreateUserBody {
  role?: unknown
  name?: unknown
  email?: unknown
  username?: unknown
  password?: unknown
  organizationId?: unknown
  gradeLevelId?: unknown
}

/** A validated, hierarchy-approved account to create. */
export interface ProvisionPlan {
  role: Exclude<UserRole, 'admin'>
  name: string
  /** Real email for staff; synthetic `<username>@student.clavis.app` for students. */
  email: string
  password: string
  organizationId: string
  username: string | null
  gradeLevelId: string | null
  createdBy: string | null
}

/** Stable machine codes returned to the client (localized there). */
export type ProvisionErrorCode = 'FORBIDDEN' | 'INVALID_INPUT'

export interface ProvisionError {
  code: ProvisionErrorCode
  status: number
  /** Developer-facing reason; logged server-side, never localized. */
  detail: string
}

export function isProvisionError(result: ProvisionPlan | ProvisionError): result is ProvisionError {
  return 'code' in result
}

function invalid(detail: string): ProvisionError {
  return { code: 'INVALID_INPUT', status: 400, detail }
}

function forbidden(detail: string): ProvisionError {
  return { code: 'FORBIDDEN', status: 403, detail }
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Which roles each caller role is allowed to create. Every other pairing is a 403.
 * admin → manager, manager → { teacher, student }. Teachers and students
 * create nobody (student provisioning moved to the manager in Revamp 2.2).
 */
const CREATABLE_ROLES: Record<UserRole, ReadonlyArray<Exclude<UserRole, 'admin'>>> = {
  admin: ['manager'],
  manager: ['teacher', 'student'],
  teacher: [],
  student: [],
}

/**
 * Enforce the caller hierarchy and validate the payload.
 *
 * The organization is never taken from the request except when a platform admin
 * creates a manager: teachers and students always provision inside the manager
 * caller's own organization.
 */
export function planProvisioning(
  caller: CallerProfile,
  body: CreateUserBody,
): ProvisionPlan | ProvisionError {
  const requestedRole = asTrimmedString(body.role)
  if (!['manager', 'teacher', 'student'].includes(requestedRole)) {
    return invalid(`unsupported role "${requestedRole}"`)
  }

  if (!CREATABLE_ROLES[caller.role].includes(requestedRole as Exclude<UserRole, 'admin'>)) {
    return forbidden(`${caller.role} may not create ${requestedRole}`)
  }
  const role = requestedRole as Exclude<UserRole, 'admin'>

  const name = asTrimmedString(body.name)
  if (!name || name.length > MAX_NAME_LENGTH) {
    return invalid('name must be 1-100 characters')
  }

  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return invalid('password must be 8-72 characters')
  }

  // Organization: admins target an explicit org, org staff inherit their own.
  let organizationId: string
  if (caller.role === 'admin') {
    organizationId = asTrimmedString(body.organizationId)
    if (!organizationId) {
      return invalid('organizationId is required when an admin creates a manager')
    }
  } else {
    if (!caller.organizationId) {
      return forbidden(`${caller.role} has no organization`)
    }
    organizationId = caller.organizationId
  }

  if (role === 'student') {
    const username = asTrimmedString(body.username).toLowerCase()
    if (!USERNAME_PATTERN.test(username)) {
      return invalid('username must be 3-30 chars: a-z, 0-9, dot, underscore, hyphen')
    }

    const gradeLevelId = asTrimmedString(body.gradeLevelId)
    if (!gradeLevelId) {
      return invalid('gradeLevelId is required for students')
    }

    return {
      role,
      name,
      email: `${username}@${STUDENT_EMAIL_DOMAIN}`,
      password,
      organizationId,
      username,
      gradeLevelId,
      createdBy: caller.id,
    }
  }

  const email = asTrimmedString(body.email).toLowerCase()
  if (!EMAIL_PATTERN.test(email)) {
    return invalid('a valid email is required for staff accounts')
  }

  return {
    role,
    name,
    email,
    password,
    organizationId,
    username: null,
    gradeLevelId: null,
    createdBy: null,
  }
}
