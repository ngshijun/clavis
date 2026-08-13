import { AuthError, type PostgrestError } from '@supabase/supabase-js'
import { useLanguageStore } from '@/stores/language'

type ErrorMessages = ReturnType<typeof useLanguageStore>['t']['shared']['errors']
export type ErrorKey = keyof ErrorMessages

/**
 * Live, locale-aware accessor for the shared error messages.
 * Resolves at call time so language switches take effect immediately.
 */
export function errorMessages(): ErrorMessages {
  return useLanguageStore().t.shared.errors
}

/**
 * Centralized error handler for Supabase and general errors.
 *
 * Classifies errors by type using error codes (not message strings) and
 * returns a localized, user-friendly message. Raw error details are
 * logged via console.error for debugging — never surfaced to users.
 *
 * @param err - The error to handle (unknown type from catch blocks)
 * @param fallbackKey - Key into shared.errors for unknown error shapes
 * @returns A localized, user-friendly error string
 */
export interface HandleErrorOptions {
  /**
   * Use the caller's localized fallback for an unrecognized PL/pgSQL RAISE
   * (P0001) instead of passing the DB's English message through. Set this
   * where the RAISE text is internal/parameterized and never fit to show a
   * user — e.g. the positional reorder RPCs, whose permutation message
   * embeds counts and cannot be exact-matched in DB_RAISE_MESSAGE_KEYS.
   */
  localizeRaise?: boolean
}

export function handleError(
  err: unknown,
  fallbackKey: ErrorKey,
  options: HandleErrorOptions = {},
): string {
  console.error('[Error]', err)

  const errors = errorMessages()
  const fallback = errors[fallbackKey]

  if (err instanceof AuthError) {
    return mapAuthError(err, errors)
  }

  if (isPostgrestError(err)) {
    if (options.localizeRaise && err.code === 'P0001' && !DB_RAISE_MESSAGE_KEYS[err.message]) {
      return fallback
    }
    return mapPostgrestError(err, errors)
  }

  if (isStorageError(err)) {
    return mapStorageError(err, errors)
  }

  if (isFunctionsError(err)) {
    return fallback
  }

  if (err instanceof TypeError && isFetchError(err.message)) {
    return errors.network
  }

  return fallback
}

// ──────────────────────────────────────────────
// Auth error mapping
// ──────────────────────────────────────────────

function mapAuthError(err: AuthError, errors: ErrorMessages): string {
  if (err.code) {
    switch (err.code) {
      case 'invalid_credentials':
        return errors.authGeneric
      case 'email_not_confirmed':
        return errors.authGeneric
      case 'user_already_exists':
      case 'email_exists':
        return errors.authAccountExists
      case 'weak_password':
        return errors.authInvalidInput
      case 'session_not_found':
        return errors.authSessionExpired
      case 'over_request_rate_limit':
        return errors.authRateLimited
      case 'same_password':
        return errors.authInvalidInput
      case 'user_not_found':
        return errors.authGeneric
      case 'otp_expired':
        return errors.authGeneric
      case 'validation_failed':
        return errors.authInvalidInput
    }
  }

  switch (err.status) {
    case 401:
      return errors.authSessionExpired
    case 403:
      return errors.authNoPermission
    case 422:
      return errors.authInvalidInput
    case 429:
      return errors.authRateLimited
  }

  return errors.authGeneric
}

// ──────────────────────────────────────────────
// Postgrest / database error mapping
// ──────────────────────────────────────────────

/**
 * Exact RAISE strings from the P8a assignment-scope trigger
 * (`enforce_assignment_scope`) and `clone_assessment_template`, mapped to
 * localized error copy (P8A-HANDOFF §4-5).
 */
const DB_RAISE_MESSAGE_KEYS: Record<string, ErrorKey> = {
  'Cannot assign a template assessment': 'assignTemplateBlocked',
  'Classroom does not match the assessment grade and subject': 'assignClassroomScopeMismatch',
  'Student is not in a classroom matching the assessment grade and subject':
    'assignStudentScopeMismatch',
  'No classroom matches this template grade and subject': 'cloneNoMatchingClassroom',
}

function isPostgrestError(err: unknown): err is PostgrestError {
  if (typeof err !== 'object' || err === null) return false
  return 'code' in err && 'message' in err && 'details' in err
}

function mapPostgrestError(err: PostgrestError, errors: ErrorMessages): string {
  switch (err.code) {
    case '23505':
      return errors.dbDuplicate
    case '23503':
      return errors.dbForeignKey
    case '23502':
      return errors.dbMissingField
    case '23514':
      return errors.dbCheckConstraint
    case '42501':
      return errors.dbNoPermission
    case '42P01':
    case '42703':
      return errors.dbServerError
    // PL/pgSQL raise exceptions surface as user-facing messages from the DB.
    // Known guard messages (P8a assignment-scope trigger + clone RPC) map to
    // localized copy; other intentional RPC messages remain in DB-language.
    case 'P0001': {
      const key = DB_RAISE_MESSAGE_KEYS[err.message]
      if (key) return errors[key]
      return err.message || errors.dbGeneric
    }
  }

  if (err.code?.startsWith('PGRST')) {
    switch (err.code) {
      case 'PGRST116':
        return errors.dbNotFound
      default:
        return errors.dbServerError
    }
  }

  return errors.dbGeneric
}

// ──────────────────────────────────────────────
// Storage error mapping (duck-typed)
// ──────────────────────────────────────────────

interface StorageErrorLike {
  __isStorageError: true
  message: string
  status?: number
  statusCode?: string
}

function isStorageError(err: unknown): err is StorageErrorLike {
  if (typeof err !== 'object' || err === null) return false
  return '__isStorageError' in err && (err as StorageErrorLike).__isStorageError === true
}

function mapStorageError(err: StorageErrorLike, errors: ErrorMessages): string {
  const status = err.status ?? (err.statusCode ? parseInt(err.statusCode) : 0)

  switch (status) {
    case 413:
      return errors.fileTooLarge
    case 415:
      return errors.fileTypeUnsupported
    case 404:
      return errors.fileNotFound
    case 403:
      return errors.fileNoPermission
  }

  return errors.fileGeneric
}

// ──────────────────────────────────────────────
// Functions error detection
// ──────────────────────────────────────────────

function isFunctionsError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  // FunctionsError types: FunctionsHttpError, FunctionsRelayError, FunctionsFetchError
  const name = (err as { name?: string }).name
  return typeof name === 'string' && name.startsWith('Functions')
}

// ──────────────────────────────────────────────
// Network error detection
// ──────────────────────────────────────────────

function isFetchError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('networkerror') ||
    lower.includes('load failed')
  )
}
