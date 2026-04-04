import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, clearSupabaseAuth } from '@/lib/supabaseClient'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { resetAllStores } from '@/lib/piniaResetPlugin'
import type { Database } from '@/types/database.types'
import { handleError } from '@/lib/errors'
import { XP_PER_LEVEL, computeLevel } from '@/lib/xp'
import { optimizeImage } from '@/lib/imageOptimizer'

type UserType = Database['public']['Enums']['user_type']

export interface AuthUser {
  id: string
  email: string
  name: string
  userType: UserType
  avatarPath: string | null
  dateOfBirth: string | null
  createdAt: string | null
  hasCompletedTour: boolean
  // Student-specific fields
  studentProfile?: {
    xp: number
    coins: number
    food: number
    gradeLevelId: string | null
    selectedPetId: string | null
    preferredLanguage: 'en' | 'zh'
    schoolId: string | null
    schoolName: string | null
  }
  // Parent-specific fields
  parentProfile?: {
    createdAt: string | null
  }
}

/**
 * Fetch the user's profile from the database
 * This includes the main profile and type-specific profile (student/parent)
 */
async function fetchUserProfile(userId: string): Promise<AuthUser | null> {
  try {
    // Fetch main profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
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
      hasCompletedTour: profile.has_completed_tour ?? false,
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
          xp: studentProfile.xp ?? 0,
          coins: studentProfile.coins ?? 0,
          food: studentProfile.food ?? 0,
          gradeLevelId: studentProfile.grade_level_id,
          selectedPetId: studentProfile.selected_pet_id,
          preferredLanguage: (studentProfile.preferred_language as 'en' | 'zh') ?? 'en',
          schoolId: studentProfile.school_id,
          schoolName: (studentProfile.schools as { name: string } | null)?.name ?? null,
        }
      }
    } else if (profile.user_type === 'parent') {
      const { data: parentProfile } = await supabase
        .from('parent_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (parentProfile) {
        authUser.parentProfile = {
          createdAt: parentProfile.created_at,
        }
      }
    }

    return authUser
  } catch (err) {
    console.error('Error fetching user profile:', err)
    return null
  }
}

/**
 * Ensure the user's profile exists in the database
 * This is a fallback in case the DB trigger didn't create it on signup
 * Called on first login to guarantee profile exists
 */
async function ensureProfileExists(user: SupabaseUser): Promise<{ error: string | null }> {
  try {
    // Check if profile already exists using maybeSingle() to avoid error when not found
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    // If profile exists, we're done
    if (existingProfile) {
      return { error: null }
    }

    // If there was an error other than "not found", return it
    if (checkError) {
      return { error: handleError(checkError, 'An unexpected error occurred.') }
    }

    // Profile doesn't exist, create it atomically using RPC function
    const userMetadata = user.user_metadata || {}
    const userType = (userMetadata.user_type as UserType) || 'student'
    const name = (userMetadata.name as string) || 'User'
    const dateOfBirth = userMetadata.date_of_birth as string | undefined
    const schoolId = userMetadata.school_id as string | undefined

    // Create main profile and type-specific profile atomically
    const { error: rpcError } = await supabase.rpc('create_user_profile', {
      p_user_id: user.id,
      p_email: user.email!,
      p_name: name,
      p_user_type: userType,
      p_date_of_birth: dateOfBirth,
      p_school_id: schoolId,
    })

    if (rpcError) {
      return { error: handleError(rpcError, 'An unexpected error occurred.') }
    }

    return { error: null }
  } catch (err) {
    const message = handleError(err, 'An unexpected error occurred.')
    return { error: message }
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const isLoading = ref(false)
  const isInitialized = ref(false)

  // Store auth listener unsubscribe function to prevent memory leaks
  let authListenerUnsubscribe: (() => void) | null = null

  const isAuthenticated = computed(() => user.value !== null)
  const userType = computed<UserType | null>(() => user.value?.userType ?? null)

  // Student-specific computed properties
  const isStudent = computed(() => user.value?.userType === 'student')
  const isParent = computed(() => user.value?.userType === 'parent')
  const isAdmin = computed(() => user.value?.userType === 'admin')

  const studentProfile = computed(() => {
    if (user.value?.userType === 'student') {
      return user.value.studentProfile
    }
    return null
  })

  // Level-up tracking: set when refreshProfile() detects a level increase
  const levelUpInfo = ref<{ oldLevel: number; newLevel: number } | null>(null)

  function clearLevelUp() {
    levelUpInfo.value = null
  }

  const currentLevel = computed(() => {
    if (!studentProfile.value) return 1
    return computeLevel(studentProfile.value.xp)
  })

  const currentLevelXp = computed(() => {
    if (!studentProfile.value) return 0
    return studentProfile.value.xp % XP_PER_LEVEL
  })

  const xpToNextLevel = computed(() => XP_PER_LEVEL)

  const xpProgress = computed(() => {
    if (!studentProfile.value) return 0
    return Math.round((currentLevelXp.value / XP_PER_LEVEL) * 100)
  })

  /**
   * Initialize auth state by checking for existing session
   */
  async function initialize() {
    if (isInitialized.value) return

    isLoading.value = true
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.user) {
        // Ensure profile exists
        await ensureProfileExists(session.user)
        // Fetch the user profile
        const profile = await fetchUserProfile(session.user.id)
        if (profile) {
          user.value = profile
        }
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
        // Defer Supabase calls to avoid deadlock
        setTimeout(async () => {
          await ensureProfileExists(session.user)
          const profile = await fetchUserProfile(session.user.id)
          if (profile) {
            user.value = profile
          }
        }, 0)
      } else if (event === 'SIGNED_OUT') {
        user.value = null
      } else if (event === 'USER_UPDATED' && session?.user) {
        // Defer Supabase calls to avoid deadlock
        setTimeout(async () => {
          const profile = await fetchUserProfile(session.user.id)
          if (profile) {
            user.value = profile
          }
        }, 0)
      }
    })

    // Store unsubscribe function to prevent memory leaks
    authListenerUnsubscribe = subscription.unsubscribe
  }

  /**
   * Sign up a new user
   */
  async function signUp(
    email: string,
    password: string,
    name: string,
    userTypeParam: 'student' | 'parent',
    dateOfBirth?: string,
    schoolId?: string,
  ) {
    isLoading.value = true
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            user_type: userTypeParam,
            date_of_birth: dateOfBirth,
            school_id: schoolId,
          },
        },
      })

      if (signUpError) {
        const message = handleError(signUpError, 'An unexpected error occurred.')
        return { user: null, error: message }
      }

      // Supabase returns a user with empty identities when the email is already registered
      // (instead of an error, to prevent email enumeration)
      if (data.user && data.user.identities?.length === 0) {
        return {
          user: null,
          error: 'An account with this email already exists. Please login instead.',
        }
      }

      return { user: data.user, error: null }
    } catch (err) {
      const message = handleError(err, 'An unexpected error occurred.')
      return { user: null, error: message }
    } finally {
      isLoading.value = false
    }
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
        const message = handleError(signInError, 'An unexpected error occurred.')
        return {
          user: null,
          session: null,
          error: message,
          errorCode: 'code' in signInError ? (signInError.code as string) : undefined,
        }
      }

      if (data.user) {
        // Ensure profile exists on first login
        await ensureProfileExists(data.user)
        // Fetch the user profile
        const profile = await fetchUserProfile(data.user.id)
        if (profile) {
          user.value = profile
        }
      }

      return { user: data.user, session: data.session, error: null }
    } catch (err) {
      const message = handleError(err, 'An unexpected error occurred.')
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
          const msg = handleError(signOutError, 'An unexpected error occurred.')
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
      const message = handleError(err, 'An unexpected error occurred.')
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
        return { error: handleError(resetError, 'An unexpected error occurred.') }
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'An unexpected error occurred.') }
    }
  }

  /**
   * Resend signup confirmation email
   */
  async function resendConfirmationEmail(email: string): Promise<{ error: string | null }> {
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
      })

      if (resendError) {
        return { error: handleError(resendError, 'An unexpected error occurred.') }
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'An unexpected error occurred.') }
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
        return { error: handleError(updateError, 'An unexpected error occurred.') }
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'An unexpected error occurred.') }
    }
  }

  /**
   * Refresh user profile from database
   */
  async function refreshProfile() {
    if (!user.value) return

    const oldLevel = currentLevel.value

    const profile = await fetchUserProfile(user.value.id)
    if (profile) {
      user.value = profile

      // Detect level-up after profile refresh
      const newLevel = currentLevel.value
      if (newLevel > oldLevel) {
        levelUpInfo.value = { oldLevel, newLevel }
      }
    }
  }

  /**
   * Update user's name
   */
  async function updateName(name: string) {
    if (!user.value) return { error: 'Not authenticated' }

    const { error } = await supabase.from('profiles').update({ name }).eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'Failed to update name.') }
    }

    user.value.name = name
    return { error: null }
  }

  /**
   * Update user's date of birth
   */
  async function updateDateOfBirth(dateOfBirth: string | null) {
    if (!user.value) return { error: 'Not authenticated' }

    const { error } = await supabase
      .from('profiles')
      .update({ date_of_birth: dateOfBirth })
      .eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'Failed to update date of birth.') }
    }

    user.value.dateOfBirth = dateOfBirth
    return { error: null }
  }

  /**
   * Update user's avatar path in database
   */
  async function updateAvatar(avatarPath: string) {
    if (!user.value) return { error: 'Not authenticated' }

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_path: avatarPath })
      .eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'Failed to update avatar.') }
    }

    user.value.avatarPath = avatarPath
    return { error: null }
  }

  /**
   * Upload avatar image to storage and update profile
   */
  async function uploadAvatar(file: File): Promise<{ path: string | null; error: string | null }> {
    if (!user.value) return { path: null, error: 'Not authenticated' }

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
      const message = handleError(err, 'Failed to upload avatar.')
      return { path: null, error: message }
    }
  }

  /**
   * Upload avatar from a URL (e.g., dicebear) to storage
   */
  async function uploadAvatarFromUrl(
    avatarUrl: string,
  ): Promise<{ path: string | null; error: string | null }> {
    if (!user.value) return { path: null, error: 'Not authenticated' }

    try {
      const oldAvatarPath = user.value.avatarPath

      // Fetch the image from the URL
      const response = await fetch(avatarUrl)
      if (!response.ok) {
        throw new Error('Failed to fetch avatar from URL')
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
      const message = handleError(err, 'Failed to upload avatar.')
      return { path: null, error: message }
    }
  }

  /**
   * Update student's grade level
   */
  async function updateGradeLevel(gradeLevelId: string) {
    if (!user.value || user.value.userType !== 'student') {
      return { error: 'Not a student' }
    }

    const { error } = await supabase
      .from('student_profiles')
      .update({ grade_level_id: gradeLevelId })
      .eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'Failed to update grade level.') }
    }

    if (user.value.studentProfile) {
      user.value.studentProfile.gradeLevelId = gradeLevelId
    }
    return { error: null }
  }

  async function updateSchool(schoolId: string | null) {
    if (!user.value || user.value.userType !== 'student' || !user.value.studentProfile) {
      return { error: 'Not a student' }
    }

    const { error } = await supabase
      .from('student_profiles')
      .update({ school_id: schoolId })
      .eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'Failed to update school.') }
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
      return { error: 'Not a student' }
    }

    const { error } = await supabase
      .from('student_profiles')
      .update({ preferred_language: language })
      .eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'Failed to update language preference.') }
    }

    user.value.studentProfile.preferredLanguage = language
    return { error: null }
  }

  /**
   * Mark the guided tour as completed (or reset it)
   */
  async function setTourCompleted(completed: boolean) {
    if (!user.value) return { error: 'Not authenticated' }

    const { error } = await supabase
      .from('profiles')
      .update({ has_completed_tour: completed })
      .eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'Failed to update tour status.') }
    }

    user.value.hasCompletedTour = completed
    return { error: null }
  }

  /**
   * Set selected pet
   */
  async function setSelectedPet(petId: string | null) {
    if (!user.value || user.value.userType !== 'student' || !user.value.studentProfile) {
      return { error: 'Not a student' }
    }

    const { error } = await supabase
      .from('student_profiles')
      .update({ selected_pet_id: petId })
      .eq('id', user.value.id)

    if (error) {
      return { error: handleError(error, 'Failed to update selected pet.') }
    }

    user.value.studentProfile.selectedPetId = petId
    return { error: null }
  }

  return {
    // State
    user,
    isLoading,
    isInitialized,

    // Computed
    isAuthenticated,
    userType,
    isStudent,
    isParent,
    isAdmin,
    studentProfile,
    currentLevel,
    currentLevelXp,
    xpToNextLevel,
    xpProgress,
    levelUpInfo,
    clearLevelUp,

    // Actions
    initialize,
    signUp,
    signIn,
    signOut,
    getSession,
    resetPassword,
    resendConfirmationEmail,
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
    setTourCompleted,
    setSelectedPet,
  }
})
