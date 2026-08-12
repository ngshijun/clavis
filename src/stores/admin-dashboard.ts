import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'
import { toMYTDateString } from '@/lib/date'

// Cache TTL for dashboard stats (5 minutes - balances freshness with avoiding redundant queries)
const STATS_CACHE_TTL = 5 * 60 * 1000

export interface DashboardStats {
  users: {
    total: number
    students: number
    teachers: number
    managers: number
    admins: number
  }
  organizations: number
  activeStudentsToday: number
  practiceSessionsToday: number
}

// Explicit shape for the PostgREST server-side aggregation response. PostgREST
// returns aggregate columns under the alias declared in the select(), so the
// alias below is pinned to the name used in the query (`count`) — a select-shape
// drift breaks here at the single cast site rather than silently reading undefined.
interface UserTypeCountRow {
  user_type: string
  count: number
}

function emptyStats(): DashboardStats {
  return {
    users: { total: 0, students: 0, teachers: 0, managers: 0, admins: 0 },
    organizations: 0,
    activeStudentsToday: 0,
    practiceSessionsToday: 0,
  }
}

export const useAdminDashboardStore = defineStore('adminDashboard', () => {
  const stats = ref<DashboardStats>(emptyStats())

  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const lastFetched = ref<number | null>(null)

  /**
   * Check if cache is stale
   */
  function isCacheStale(): boolean {
    if (!lastFetched.value) return true
    return Date.now() - lastFetched.value > STATS_CACHE_TTL
  }

  // Fetch all dashboard stats (with cache check)
  async function fetchStats(force = false): Promise<{ error: string | null }> {
    // Skip if cache is still valid and not forced
    if (!force && !isCacheStale()) {
      return { error: null }
    }

    isLoading.value = true
    error.value = null

    try {
      const today = toMYTDateString()

      const [usersResult, organizationsResult, sessionsTodayResult] = await Promise.all([
        // Total users by role (server-side aggregation)
        supabase.from('profiles').select('user_type, count:user_type.count()'),

        // Organizations on the platform
        supabase.from('organizations').select('id', { count: 'exact', head: true }),

        // Practice sessions created today (MYT boundaries). student_id is selected so
        // "active students today" can be derived as the distinct student count.
        supabase
          .from('practice_sessions')
          .select('student_id')
          .gte('created_at', `${today}T00:00:00+08:00`)
          .lt('created_at', `${today}T23:59:59.999+08:00`),
      ])

      const firstError = usersResult.error ?? organizationsResult.error ?? sessionsTodayResult.error
      if (firstError) {
        const message = handleError(firstError, 'failedFetchDashboardStats')
        error.value = message
        return { error: message }
      }

      const next = emptyStats()

      // Process users (server-side grouped counts)
      if (usersResult.data) {
        const rows = usersResult.data as unknown as UserTypeCountRow[]
        for (const row of rows) {
          next.users.total += row.count
          if (row.user_type === 'student') next.users.students = row.count
          else if (row.user_type === 'teacher') next.users.teachers = row.count
          else if (row.user_type === 'manager') next.users.managers = row.count
          else if (row.user_type === 'admin') next.users.admins = row.count
        }
      }

      next.organizations = organizationsResult.count ?? 0

      const sessionsToday = sessionsTodayResult.data ?? []
      next.practiceSessionsToday = sessionsToday.length
      next.activeStudentsToday = new Set(sessionsToday.map((s) => s.student_id)).size

      stats.value = next
      lastFetched.value = Date.now()

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchDashboardStats')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  function $reset() {
    stats.value = emptyStats()
    isLoading.value = false
    error.value = null
    lastFetched.value = null
  }

  return {
    stats,
    isLoading,
    error,
    fetchStats,
    $reset,
  }
})
