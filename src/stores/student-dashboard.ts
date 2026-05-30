import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import type { Database } from '@/types/database.types'
import { handleError, errorMessages } from '@/lib/errors'
import { toMYTDateString } from '@/lib/date'

export type MoodType = Database['public']['Enums']['mood_type']

export interface DailyStatus {
  id: string
  studentId: string
  date: string // ISO date string (YYYY-MM-DD)
  mood: MoodType | null
  hasPracticed: boolean
  hasSpun: boolean
  spinReward: number | null
  createdAt: string | null
}

export const useStudentDashboardStore = defineStore('studentDashboard', () => {
  const authStore = useAuthStore()

  // Current day's status
  const todayStatus = ref<DailyStatus | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Streak from database (single source of truth)
  const currentStreak = ref<number>(0)

  // Get today's date string in Asia/Kuala_Lumpur timezone
  function getTodayString(): string {
    return toMYTDateString()
  }

  // Fetch today's daily status
  async function fetchTodayStatus(): Promise<{ error: string | null }> {
    const studentId = authStore.user?.id
    if (!studentId) {
      return { error: errorMessages().notAuthenticated }
    }

    isLoading.value = true
    error.value = null

    try {
      const today = getTodayString()

      const { data, error: fetchError } = await supabase
        .from('daily_statuses')
        .select('*')
        .eq('student_id', studentId)
        .eq('date', today)
        .maybeSingle()

      if (fetchError) {
        const message = handleError(fetchError, 'failedFetchDailyStatus')
        error.value = message
        return { error: message }
      }

      if (data) {
        todayStatus.value = {
          id: data.id,
          studentId: data.student_id,
          date: data.date,
          mood: data.mood,
          hasPracticed: data.has_practiced ?? false,
          hasSpun: data.has_spun ?? false,
          spinReward: data.spin_reward,
          createdAt: data.created_at,
        }
      } else {
        // No record for today yet - create one
        const { data: newData, error: insertError } = await supabase
          .from('daily_statuses')
          .insert({
            student_id: studentId,
            date: today,
            has_practiced: false,
            has_spun: false,
          })
          .select()
          .single()

        if (insertError) {
          const message = handleError(insertError, 'failedFetchDailyStatus')
          error.value = message
          return { error: message }
        }

        todayStatus.value = {
          id: newData.id,
          studentId: newData.student_id,
          date: newData.date,
          mood: newData.mood,
          hasPracticed: newData.has_practiced ?? false,
          hasSpun: newData.has_spun ?? false,
          spinReward: newData.spin_reward,
          createdAt: newData.created_at,
        }
      }

      // Fetch current streak from student_profiles
      const { data: profileData } = await supabase
        .from('student_profiles')
        .select('current_streak')
        .eq('id', studentId)
        .single()

      if (profileData) {
        currentStreak.value = profileData.current_streak ?? 0
      }

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchDailyStatus')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  // Check if mood has been set today
  const hasMoodToday = computed(() => todayStatus.value?.mood !== null)

  // Check if already spun today
  const hasSpunToday = computed(() => todayStatus.value?.hasSpun ?? false)

  // Set today's mood
  async function setMood(mood: MoodType): Promise<{ error: string | null }> {
    const studentId = authStore.user?.id
    if (!studentId) {
      return { error: errorMessages().notAuthenticated }
    }

    if (!todayStatus.value) {
      await fetchTodayStatus()
    }

    if (!todayStatus.value) {
      return { error: errorMessages().couldNotCreateDailyStatus }
    }

    try {
      const { error: updateError } = await supabase
        .from('daily_statuses')
        .update({ mood })
        .eq('id', todayStatus.value.id)

      if (updateError) {
        return { error: handleError(updateError, 'failedSetMood') }
      }

      todayStatus.value.mood = mood
      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedSetMood')
      return { error: message }
    }
  }

  // Record spin reward after animation completes (called by component with pre-determined reward)
  async function recordSpinReward(reward: number): Promise<{ error: string | null }> {
    const studentId = authStore.user?.id
    if (!studentId) {
      return { error: errorMessages().notAuthenticated }
    }

    if (!todayStatus.value) {
      await fetchTodayStatus()
    }

    if (!todayStatus.value) {
      return { error: errorMessages().couldNotCreateDailyStatus }
    }

    if (todayStatus.value.hasSpun) {
      return { error: errorMessages().alreadySpunToday }
    }

    try {
      // Record spin and credit coins atomically using RPC function
      const { data, error: rpcError } = await supabase.rpc('record_spin_reward', {
        p_daily_status_id: todayStatus.value.id,
        p_student_id: studentId,
        p_reward: reward,
      })

      if (rpcError) {
        return { error: handleError(rpcError, 'failedRecordSpin') }
      }

      // Update local state
      todayStatus.value.hasSpun = true
      todayStatus.value.spinReward = reward

      // Refresh auth store to get updated coins from database
      await authStore.refreshProfile()

      // Hand off any newly-unlocked badges. v1 has no triggers that fire on
      // spin, but the hook is wired for future additions.
      const result = data as {
        newly_unlocked_badges?: Database['public']['Tables']['badges']['Row'][]
      } | null
      if (result?.newly_unlocked_badges && result.newly_unlocked_badges.length > 0) {
        const { useBadgesStore } = await import('@/stores/badges')
        useBadgesStore().handleNewlyUnlocked(result.newly_unlocked_badges)
      }

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedRecordSpin')
      return { error: message }
    }
  }

  // Check if practiced today
  const hasPracticedToday = computed(() => {
    return todayStatus.value?.hasPracticed ?? false
  })

  // Reset store state (call on logout)
  function $reset() {
    todayStatus.value = null
    isLoading.value = false
    error.value = null
    currentStreak.value = 0
  }

  return {
    todayStatus,
    isLoading,
    error,
    hasMoodToday,
    hasSpunToday,
    currentStreak,
    hasPracticedToday,
    fetchTodayStatus,
    setMood,
    recordSpinReward,
    getTodayString,
    $reset,
  }
})
