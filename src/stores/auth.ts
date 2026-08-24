import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, clearSupabaseAuth } from '@/lib/supabaseClient'
import type { Session } from '@supabase/supabase-js'
import { resetAllStores } from '@/lib/piniaResetPlugin'
import type { Database } from '@/types/database.types'
import { handleError, errorMessages } from '@/lib/errors'
import { handleAuthError } from '@/lib/authErrors'
import { optimizeImage } from '@/lib/imageOptimizer'

type UserRole = Database['public']['Enums']['user_role']

export interface AuthUser {
  id: string
  email: string
  name: string
  userType: UserRole
  avatarPath: string | null
  dateOfBirth: string | null
  createdAt: string | null
  // Tenancy: NULL only for platform admins (DB CHECK enforces the invariant)
  organizationId: string | null
  organizationName: string | null
  // Student-specific fields
  studentProfile?: {
    gradeLevelId: string | null
    preferredLanguage: 'en' | 'zh'
    schoolId: string | null
    schoolName: string | null
    username: string | null
    createdBy: string | null
  }
}

/**
 * Fetch the user's profile from the database
 * This includes the main profile and the student profile for students
 */
async function fetchUserProfile(userId: string): Promise<AuthUser | null> {
  try {
    // Fetch main profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*, organizations(name)')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      console.error('Error fetching profile:', profileError)
      return null
    }

    const authUser: AuthUser = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      userType: profile.user_type,
      avatarPath: profile.avatar_path,
      dateOfBirth: profile.date_of_birth,
      createdAt: profile.created_at,
      organizationId: profile.organization_id,
      organizationName: (profile.organizations as { name: string } | null)?.name ?? null,
    }

    // Fetch type-specific profile
    if (profile.user_type === 'student') {
      const { data: studentProfile } = await supabase
        .from('student_profiles')
        .select('*, schools(name)')
        .eq('id', userId)
        .single()

      if (studentProfile) {
        authUser.studentProfile = {
          gradeLevelId: studentProfile.grade_level_id,
          preferredLanguage: studentProfile.preferred_language === 'zh' ? 'zh' : 'en',
          schoolId: studentProfile.school_id,
          schoolName: (studentProfile.schools as { name: string } | null)?.name ?? null,
          username: studentProfile.username,
          createdBy: studentProfile.created_by,
        }
      }
    }

    return authUser
  } catch (err) {
    console.error('Error fetching user profile:', err)
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const isLoading = ref(false)
  const isInitialized = ref(false)
  // Set when a deferred (session-restore / USER_UPDATED) profile load fails,
  // so the failure is recoverable/visible instead of silently leaving user null.
  const profileLoadError = ref(false)

  // Store auth listener unsubscribe function to prevent memory leaks
  let authListenerUnsubscribe: (() => void) | null = null

  // In-flight memoization so concurrent initialize() calls share one boot run
  let initPromise: Promise<void> | null = null

  // Monotonic token: every profile load increments this; only the latest write wins,
  // so out-of-order resolution of concurrent loads (e.g. initialize() vs a deferred
  // SIGNED_IN handler) cannot seat stale data.
  let profileLoadSeq = 0

  /**
   * Funnel every user.value write through a single loader guarded by a monotonic
   * request id. Stale (superseded) results are discarded.
   * Returns false if the profile load failed (so callers can surface an error).
   */
  async function loadUserProfile(userId: string): Promise<boolean> {
    const seq = ++profileLoadSeq
    const profile = await fetchUserProfile(userId)
    // Ignore if a newer load started after this one
    if (seq !== profileLoadSeq) return profile !== null
    if (profile) {
      user.value = profile
      return true
    }
    return false
  }

  const isAuthenticated = computed(() => user.value !== null)
  const userType = computed<UserRole | null>(() => user.value?.userType ?? null)

  // Role computed properties
  const isStudent = computed(() => user.value?.userType === 'student')
  const isAdmin = computed(() => user.value?.userType === 'admin')
  const isManager = computed(() => user.value?.userType === 'manager')
  const isTeacher = computed(() => user.value?.userType === 'teacher')

  const organizationId = computed(() => user.value?.organizationId ?? null)

  const studentProfile = computed(() => {
    if (user.value?.userType === 'student') {
      return user.value.studentProfile
    }
    return null
  })

  /**
   * Initialize auth state by checking for existing session.
   * Memoized: concurrent callers share one in-flight boot run, so the body
   * (including the onAuthStateChange subscribe) never double-runs.
   */
  function initialize(): Promise<void> {
    if (isInitialized.value) return Promise.resolve()
    if (initPromise) return initPromise

    initPromise = runInitialize().finally(() => {
      initPromise = null
    })
    return initPromise
  }

  async function runInitialize(): Promise<void> {
    isLoading.value = true
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.user) {
        // Fetch the user profile through the sequenced loader
        await loadUserProfile(session.user.id)
      }
    } catch (err) {
      console.error('Error initializing auth:', err)
    } finally {
      isLoading.value = false
      isInitialized.value = true
    }

    // Clean up any existing auth listener before creating a new one
    if (authListenerUnsubscribe) {
      authListenerUnsubscribe()
      authListenerUnsubscribe = null
    }

    // Listen for auth state changes
    // IMPORTANT: Callback must NOT be async to avoid deadlock
    // See: https://supabase.com/docs/reference/javascript/auth-onauthstatechange
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const signedInUser = session.user
        // Defer Supabase calls to avoid deadlock. loadUserProfile's monotonic
        // request id discards this result if a later load (e.g. from initialize()
        // or refreshProfile()) has already superseded it — preventing stale clobber.
        setTimeout(async () => {
          const ok = await loadUserProfile(signedInUser.id)
          profileLoadError.value = !ok
        }, 0)
      } else if (event === 'SIGNED_OUT') {
        user.value = null
      } else if (event === 'USER_UPDATED' && session?.user) {
        const updatedUser = session.user
        // Defer Supabase calls to avoid deadlock
        setTimeout(async () => {
          const ok = await loadUserProfile(updatedUser.id)
          profileLoadError.value = !ok
        }, 0)
      }
    })

    // Store unsubscribe function to prevent memory leaks
    authListenerUnsubscribe = subscription.unsubscribe
  }

  /**
   * Sign in with email and password
   */
  async function signIn(email: string, password: string) {
    isLoading.value = true
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        const message = handleAuthError(signInError)
        return {
          user: null,
          session: null,
          error: message,
          errorCode: 'code' in signInError ? (signInError.code as string) : undefined,
        }
      }

      if (data.user) {
        // Fetch the user profile through the sequenced loader
        await loadUserProfile(data.user.id)
      }

      return { user: data.user, session: data.session, error: null }
    } catch (err) {
      const message = handleError(err, 'unknown')
      return { user: null, session: null, error: message }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Sign out the current user
   *
   * Note: When the session is already invalid (e.g., logged out from another domain),
   * Supabase's signOut() cannot clear localStorage because _useSession() fails first.
   * In this case, we treat the error as success since the user IS logged out server-side.
   */
  async function signOut() {
    isLoading.value = true
    try {
      const { error: signOutError } = await supabase.auth.signOut()

      if (signOutError) {
        // Check if the error indicates the session is already invalid/gone
        const isSessionGone =
          signOutError.message.includes('session_not_found') ||
          signOutError.code === 'session_not_found' ||
          signOutError.message.includes('Invalid Refresh Token') ||
          signOutError.message.includes('invalid_grant') ||
          signOutError.message.includes('Auth session missing') ||
          signOutError.status === 403 ||
          signOutError.status === 401

        if (!isSessionGone) {
          const msg = handleError(signOutError, 'unknown')
          // Still clear local state even on unexpected errors
          user.value = null
          return { error: msg }
        }
        // For session-gone errors: user IS logged out server-side
        // Clear localStorage since Supabase couldn't do it
        clearSupabaseAuth()
      }

      // Always clear local user state when signing out
      user.value = null

      // Clean up auth listener to prevent memory leaks
      if (authListenerUnsubscribe) {
        authListenerUnsubscribe()
        authListenerUnsubscribe = null
      }

      // SECURITY: Reset ALL stores to prevent data leakage after logout
      const { failed } = resetAllStores()

      // If any store reset failed, force a page reload to ensure clean state
      if (failed.length > 0) {
        console.warn('Some stores failed to reset, forcing page reload for security')
        window.location.href = '/login'
        return { error: null }
      }

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'unknown')
      user.value = null
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get the current session
   */
  async function getSession(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession()
    return data.session
  }

  /**
   * Send password reset email
   */
  async function resetPassword(email: string): Promise<{ error: string | null }> {
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (resetError) {
        return {
          error: handleAuthError(resetError),
        }
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'unknown') }
    }
  }

  /**
   * Update user password
   */
  async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        return {
          error: handleAuthError(updateError),
        }
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'unknown') }
    }
  }

  /**
   * Refresh user profile from database
   */
  async function refreshProfile() {
    if (!user.value) return
    await loadUserProfile(user.value.id)
  }

  /**
   * Update user's name
   */
  async function updateName(name: string) {
    if (!user.value) return { error: errorMessages().notAuthenticated }

    const { error } = await supabase.from('profiles').update({ name }).eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'failedUpdateName') }
    }

    user.value.name = name
    return { error: null }
  }

  /**
   * Update user's date of birth
   */
  async function updateDateOfBirth(dateOfBirth: string | null) {
    if (!user.value) return { error: errorMessages().notAuthenticated }

    const { error } = await supabase
      .from('profiles')
      .update({ date_of_birth: dateOfBirth })
      .eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'failedUpdateDateOfBirth') }
    }

    user.value.dateOfBirth = dateOfBirth
    return { error: null }
  }

  /**
   * Update user's avatar path in database
   */
  async function updateAvatar(avatarPath: string) {
    if (!user.value) return { error: errorMessages().notAuthenticated }

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_path: avatarPath })
      .eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'failedUpdateAvatar') }
    }

    user.value.avatarPath = avatarPath
    return { error: null }
  }

  /**
   * Upload avatar image to storage and update profile
   */
  async function uploadAvatar(file: File): Promise<{ path: string | null; error: string | null }> {
    if (!user.value) return { path: null, error: errorMessages().notAuthenticated }

    try {
      const oldAvatarPath = user.value.avatarPath
      const optimized = await optimizeImage(file, { maxDimension: 256 })
      const fileExt = optimized.name.split('.').pop()
      const filePath = `${user.value.id}/${crypto.randomUUID()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, optimized, {
          cacheControl: '31536000', // 1 year cache for CDN
        })

      if (uploadError) throw uploadError

      // Update the avatar path in the database
      const updateResult = await updateAvatar(filePath)
      if (updateResult.error) {
        // Cleanup: delete the uploaded file since DB update failed
        await supabase.storage.from('avatars').remove([filePath])
        return { path: null, error: updateResult.error }
      }

      // Remove old avatar file (best-effort, don't block on failure)
      if (oldAvatarPath && !oldAvatarPath.startsWith('http')) {
        supabase.storage.from('avatars').remove([oldAvatarPath])
      }

      return { path: filePath, error: null }
    } catch (err) {
      const message = handleError(err, 'failedUploadAvatar')
      return { path: null, error: message }
    }
  }

  /**
   * Upload avatar from a URL (e.g., dicebear) to storage
   */
  async function uploadAvatarFromUrl(
    avatarUrl: string,
  ): Promise<{ path: string | null; error: string | null }> {
    if (!user.value) return { path: null, error: errorMessages().notAuthenticated }

    try {
      const oldAvatarPath = user.value.avatarPath

      // Fetch the image from the URL
      const response = await fetch(avatarUrl)
      if (!response.ok) {
        throw new Error(errorMessages().failedFetchAvatar)
      }

      const blob = await response.blob()

      // SVGs (e.g. DiceBear) skip automatically inside optimizeImage
      const optimized = await optimizeImage(blob, { maxDimension: 256 })
      const contentType = optimized.type
      const ext = contentType.includes('svg') ? 'svg' : 'webp'
      const filePath = `${user.value.id}/${crypto.randomUUID()}.${ext}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, optimized, {
          contentType,
          cacheControl: '31536000', // 1 year cache for CDN
        })

      if (uploadError) throw uploadError

      // Update the avatar path in the database
      const updateResult = await updateAvatar(filePath)
      if (updateResult.error) {
        // Cleanup: delete the uploaded file since DB update failed
        await supabase.storage.from('avatars').remove([filePath])
        return { path: null, error: updateResult.error }
      }

      // Remove old avatar file (best-effort, don't block on failure)
      if (oldAvatarPath && !oldAvatarPath.startsWith('http')) {
        supabase.storage.from('avatars').remove([oldAvatarPath])
      }

      return { path: filePath, error: null }
    } catch (err) {
      const message = handleError(err, 'failedUploadAvatar')
      return { path: null, error: message }
    }
  }

  /**
   * Update student's grade level
   */
  async function updateGradeLevel(gradeLevelId: string) {
    if (!user.value || user.value.userType !== 'student') {
      return { error: errorMessages().notAStudent }
    }

    const { error } = await supabase
      .from('student_profiles')
      .update({ grade_level_id: gradeLevelId })
      .eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'failedUpdateGradeLevel') }
    }

    if (user.value.studentProfile) {
      user.value.studentProfile.gradeLevelId = gradeLevelId
    }
    return { error: null }
  }

  async function updateSchool(schoolId: string | null) {
    if (!user.value || user.value.userType !== 'student' || !user.value.studentProfile) {
      return { error: errorMessages().notAStudent }
    }

    const { error } = await supabase
      .from('student_profiles')
      .update({ school_id: schoolId })
      .eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'failedUpdateSchool') }
    }

    user.value.studentProfile.schoolId = schoolId

    if (schoolId) {
      const { data: school } = await supabase
        .from('schools')
        .select('name')
        .eq('id', schoolId)
        .single()
      user.value.studentProfile.schoolName = school?.name ?? null
    } else {
      user.value.studentProfile.schoolName = null
    }

    return { error: null }
  }

  async function updatePreferredLanguage(language: 'en' | 'zh') {
    if (!user.value || user.value.userType !== 'student' || !user.value.studentProfile) {
      return { error: errorMessages().notAStudent }
    }

    const { error } = await supabase
      .from('student_profiles')
      .update({ preferred_language: language })
      .eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'failedUpdateLanguage') }
    }

    user.value.studentProfile.preferredLanguage = language
    return { error: null }
  }

  return {
    // State
    user,
    isLoading,
    isInitialized,
    profileLoadError,

    // Computed
    isAuthenticated,
    userType,
    isStudent,
    isAdmin,
    isManager,
    isTeacher,
    organizationId,
    studentProfile,
    // Actions
    initialize,
    signIn,
    signOut,
    getSession,
    resetPassword,
    updatePassword,
    refreshProfile,
    updateName,
    updateDateOfBirth,
    updateAvatar,
    uploadAvatar,
    uploadAvatarFromUrl,
    updateGradeLevel,
    updateSchool,
    updatePreferredLanguage,
  }
})
