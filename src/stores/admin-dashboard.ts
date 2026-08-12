import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'
import { toMYTDateString } from '@/lib/date'
import type { Database } from '@/types/database.types'

// Cache TTL for dashboard stats (5 minutes - balances freshness with avoiding redundant queries)
const STATS_CACHE_TTL = 5 * 60 * 1000

type OrgOverviewRowRaw = Database['public']['Functions']['get_org_overview']['Returns'][number]

export interface OrgOverviewRow {
  organizationId: string
  organizationName: string
  managerCount: number
  teacherCount: number
  /** Seats in use = student profiles in the org (decision 34). */
  studentCount: number
  classCount: number
  assessmentCount: number
  lastActivityAt: string | null
}

/** Parsed shape of the `get_platform_totals` jsonb payload (P4A-HANDOFF §E). */
export interface PlatformTotals {
  orgCount: number
  managerCount: number
  teacherCount: number
  /** Total seats in use across the platform. */
  studentCount: number
  assessmentCount: number
  classCount: number
  lastActivityAt: string | null
}

interface PlatformTotalsJson {
  org_count: number
  manager_count: number
  teacher_count: number
  student_count: number
  assessment_count: number
  class_count: number
  last_activity_at: string | null
}

export interface TodayStats {
  activeStudentsToday: number
  practiceSessionsToday: number
}

/**
 * Platform-admin dashboard: per-org seat/usage overview + platform totals
 * (both via the P4a admin-only RPCs) plus today's practice activity.
 */
export const useAdminDashboardStore = defineStore('adminDashboard', () => {
  const orgOverview = ref<OrgOverviewRow[]>([])
  const totals = ref<PlatformTotals | null>(null)
  const today = ref<TodayStats>({ activeStudentsToday: 0, practiceSessionsToday: 0 })

  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const lastFetched = ref<number | null>(null)

  function isCacheStale(): boolean {
    if (!lastFetched.value) return true
    return Date.now() - lastFetched.value > STATS_CACHE_TTL
  }

  async function fetchStats(force = false): Promise<{ error: string | null }> {
    // Skip if cache is still valid and not forced
    if (!force && !isCacheStale()) {
      return { error: null }
    }

    isLoading.value = true
    error.value = null

    try {
      const todayMYT = toMYTDateString()

      const [overviewResult, totalsResult, sessionsTodayResult] = await Promise.all([
        supabase.rpc('get_org_overview'),
        supabase.rpc('get_platform_totals'),

        // Practice sessions created today (MYT boundaries). student_id is selected so
        // "active students today" can be derived as the distinct student count.
        supabase
          .from('practice_sessions')
          .select('student_id')
          .gte('created_at', `${todayMYT}T00:00:00+08:00`)
          .lt('created_at', `${todayMYT}T23:59:59.999+08:00`),
      ])

      const firstError = overviewResult.error ?? totalsResult.error ?? sessionsTodayResult.error
      if (firstError) throw firstError

      orgOverview.value = (overviewResult.data ?? []).map((row: OrgOverviewRowRaw) => ({
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        managerCount: row.manager_count,
        teacherCount: row.teacher_count,
        studentCount: row.student_count,
        classCount: row.class_count,
        assessmentCount: row.assessment_count,
        lastActivityAt: row.last_activity_at ?? null,
      }))

      const rawTotals = totalsResult.data as unknown as PlatformTotalsJson
      totals.value = {
        orgCount: rawTotals.org_count,
        managerCount: rawTotals.manager_count,
        teacherCount: rawTotals.teacher_count,
        studentCount: rawTotals.student_count,
        assessmentCount: rawTotals.assessment_count,
        classCount: rawTotals.class_count,
        lastActivityAt: rawTotals.last_activity_at ?? null,
      }

      const sessionsToday = sessionsTodayResult.data ?? []
      today.value = {
        practiceSessionsToday: sessionsToday.length,
        activeStudentsToday: new Set(sessionsToday.map((s) => s.student_id)).size,
      }

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
    orgOverview.value = []
    totals.value = null
    today.value = { activeStudentsToday: 0, practiceSessionsToday: 0 }
    isLoading.value = false
    error.value = null
    lastFetched.value = null
  }

  return {
    orgOverview,
    totals,
    today,
    isLoading,
    error,
    fetchStats,
    $reset,
  }
})
