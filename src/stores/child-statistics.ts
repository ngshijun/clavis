import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { toMYTDateString, mytDateToUTCDate, utcDateToString } from '@/lib/date'
import { useChildLinkStore } from './child-link'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'
import type { Database } from '@/types/database.types'
import type { SubTopicHierarchy } from '@/types/supabase-helpers'
import { type DateRangeFilter, createSessionLookupMethods } from '@/lib/sessionFilters'
import { fetchSessionSummaries, fetchFullSessionDetails } from '@/lib/sessionFetching'
import { useCascadingFilters } from '@/composables/useCascadingFilters'
import type {
  QuestionOption,
  PracticeAnswer,
  SessionQuestion,
  PracticeSessionSummary,
  PracticeSessionFull,
} from '@/types/session'
import { assembleSessionFull } from '@/lib/questionHelpers'

export type { DateRangeFilter, QuestionOption, PracticeAnswer, SessionQuestion }
export type ChildPracticeSession = PracticeSessionSummary
export type ChildPracticeSessionFull = PracticeSessionFull

type SubscriptionTier = Database['public']['Enums']['subscription_tier']

// Cache TTL for child subscription status
const SUBSCRIPTION_CACHE_TTL = 2 * 60 * 1000 // 2 minutes
// Cache TTL for child statistics (re-fetch when navigating back after this period)
const STATISTICS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export interface ChildSubscriptionStatus {
  tier: SubscriptionTier
  canViewDetailedResults: boolean // Pro and Max tiers only
}

export interface ChildStatistics {
  childId: string
  childName: string
  sessions: ChildPracticeSession[]
}

export type MoodType = Database['public']['Enums']['mood_type']

export interface ChildDailyStatus {
  id: string
  date: string // YYYY-MM-DD
  mood: MoodType | null
  hasPracticed: boolean
}

export interface DailySessionCount {
  date: string // YYYY-MM-DD
  count: number
}

export const useChildStatisticsStore = defineStore('childStatistics', () => {
  const childLinkStore = useChildLinkStore()
  const authStore = useAuthStore()

  const childrenStatistics = ref<ChildStatistics[]>([])
  const childBadgeSummaries = ref<Record<string, { lifetime: number; this_week: number }>>({})
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Cache for child subscription statuses (keyed by childId)
  const subscriptionStatusCache = ref<
    Map<string, { status: ChildSubscriptionStatus; lastFetched: number }>
  >(new Map())

  // Statistics page filter + pagination state (persisted across navigation)
  // Note: selectedChildId is persisted via localStorage in the component (user preference)
  const {
    filters: statisticsFilters,
    pagination: statisticsPagination,
    setGradeLevel: setStatisticsGradeLevel,
    setSubject: setStatisticsSubject,
    setTopic: setStatisticsTopic,
    setSubTopic: setStatisticsSubTopic,
    setDateRange: setStatisticsDateRange,
    setPageIndex: setStatisticsPageIndex,
    setPageSize: setStatisticsPageSize,
    resetFilters: _resetStatisticsFilters,
  } = useCascadingFilters({ defaultDateRange: 'alltime' })

  // Track when each child's statistics were last fetched (for TTL-based cache)
  const childStatsLastFetched = ref<Map<string, number>>(new Map())

  /**
   * Fetch practice sessions for a specific child (lazy loading)
   */
  async function fetchChildStatistics(childId: string): Promise<{ error: string | null }> {
    if (!authStore.user || !authStore.isParent) {
      return { error: errorMessages().notAuthenticatedAsParent }
    }

    // Check if child is linked
    const child = childLinkStore.linkedChildren.find((c) => c.id === childId)
    if (!child) {
      return { error: errorMessages().childNotLinked }
    }

    // Skip if cache is still valid
    const lastFetched = childStatsLastFetched.value.get(childId)
    if (lastFetched && Date.now() - lastFetched < STATISTICS_CACHE_TTL) {
      return { error: null }
    }

    isLoading.value = true
    error.value = null

    try {
      const [sessions, badgeSummaryRes] = await Promise.all([
        fetchSessionSummaries(childId),
        supabase.rpc('get_child_badge_summary', { p_child_id: childId }),
      ])

      if (badgeSummaryRes.data && badgeSummaryRes.data.length > 0) {
        const row = badgeSummaryRes.data[0]
        childBadgeSummaries.value = {
          ...childBadgeSummaries.value,
          [childId]: { lifetime: row.lifetime, this_week: row.this_week },
        }
      }

      // Update or add this child's statistics
      const existingIndex = childrenStatistics.value.findIndex((s) => s.childId === childId)
      const childStats: ChildStatistics = {
        childId,
        childName: child.name,
        sessions,
      }

      if (existingIndex >= 0) {
        childrenStatistics.value[existingIndex] = childStats
      } else {
        childrenStatistics.value.push(childStats)
      }

      // Update cache timestamp
      childStatsLastFetched.value.set(childId, Date.now())

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchStatistics')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Check if subscription status cache is stale for a specific child
   */
  function isSubscriptionCacheStale(childId: string): boolean {
    const cached = subscriptionStatusCache.value.get(childId)
    if (!cached) return true
    return Date.now() - cached.lastFetched > SUBSCRIPTION_CACHE_TTL
  }

  /**
   * Get subscription status for a child (with caching)
   */
  async function getChildSubscriptionStatus(
    childId: string,
    force = false,
  ): Promise<ChildSubscriptionStatus> {
    // Return cached status if still valid
    if (!force && !isSubscriptionCacheStale(childId)) {
      const cached = subscriptionStatusCache.value.get(childId)
      if (cached) return cached.status
    }

    if (!authStore.user || !authStore.isParent) {
      const status: ChildSubscriptionStatus = { tier: 'core', canViewDetailedResults: false }
      subscriptionStatusCache.value.set(childId, { status, lastFetched: Date.now() })
      return status
    }

    try {
      // Read the child's subscription tier directly from student_profiles
      const { data: profileData } = await supabase
        .from('student_profiles')
        .select('subscription_tier')
        .eq('id', childId)
        .maybeSingle()

      const tier = (profileData?.subscription_tier as SubscriptionTier) ?? 'core'
      const canViewDetailedResults = tier === 'plus' || tier === 'pro' || tier === 'max'

      const status: ChildSubscriptionStatus = { tier, canViewDetailedResults }
      subscriptionStatusCache.value.set(childId, { status, lastFetched: Date.now() })
      return status
    } catch (err) {
      console.error('Error getting child subscription status:', err)
      const status: ChildSubscriptionStatus = { tier: 'core', canViewDetailedResults: false }
      subscriptionStatusCache.value.set(childId, { status, lastFetched: Date.now() })
      return status
    }
  }

  /**
   * Fetch full session details by child ID and session ID
   * Uses parallel queries for better performance
   */
  async function getSessionById(
    childId: string,
    sessionId: string,
  ): Promise<{
    session: ChildPracticeSessionFull | null
    error: string | null
    subscriptionRequired?: boolean
  }> {
    if (!authStore.user || !authStore.isParent) {
      return { session: null, error: errorMessages().notAuthenticatedAsParent }
    }

    // Verify the child is linked to this parent
    const isLinked = childLinkStore.linkedChildren.some((c) => c.id === childId)
    if (!isLinked) {
      return { session: null, error: errorMessages().childNotLinked }
    }

    // Check subscription status (cached)
    const subscriptionStatus = await getChildSubscriptionStatus(childId)
    const canViewDetails = subscriptionStatus.canViewDetailedResults

    try {
      if (canViewDetails) {
        // Full details: fetch session + answers + questions via shared helper
        const session = await fetchFullSessionDetails(childId, sessionId)
        if (!session) return { session: null, error: errorMessages().sessionNotFound }
        return { session, error: null }
      }

      // Subscription-gated: fetch session summary only (no answers/questions)
      const { data: sessionData, error: fetchError } = await supabase
        .from('practice_sessions')
        .select(
          `
          id,
          total_questions,
          correct_count,
          total_time_seconds,
          created_at,
          completed_at,
          ai_summary,
          sub_topics (
            id,
            name,
            topics (
              id,
              name,
              subjects (
                id,
                name,
                grade_levels (
                  id,
                  name
                )
              )
            )
          )
        `,
        )
        .eq('id', sessionId)
        .eq('student_id', childId)
        .single()

      if (fetchError) throw fetchError
      if (!sessionData) return { session: null, error: errorMessages().sessionNotFound }

      const subTopic = sessionData.sub_topics as unknown as SubTopicHierarchy
      const session: ChildPracticeSessionFull = assembleSessionFull(
        sessionData,
        subTopic,
        [],
        [],
        sessionData.correct_count ?? 0,
        sessionData.total_time_seconds ?? 0,
      )

      return { session, error: null, subscriptionRequired: true }
    } catch (err) {
      const message = handleError(err, 'failedFetchSession')
      return { session: null, error: message }
    }
  }

  // Get statistics only for linked children
  const linkedChildrenStatistics = computed(() => {
    const linkedIds = childLinkStore.linkedChildren.map((c) => c.id)
    return childrenStatistics.value.filter((stat) => linkedIds.includes(stat.childId))
  })

  // Get statistics for a specific child
  function getChildStatistics(childId: string) {
    return childrenStatistics.value.find((stat) => stat.childId === childId)
  }

  // Cascading filter lookup methods (shared pattern)
  const { getFilteredSessions, getGradeLevels, getSubjects, getTopics, getSubTopics } =
    createSessionLookupMethods((childId: string) => getChildStatistics(childId)?.sessions)

  // Get recent sessions for a child (sorted by date descending)
  function getRecentSessions(
    childId: string,
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
    subTopicName?: string,
    dateRange?: DateRangeFilter,
    limit?: number,
  ): ChildPracticeSession[] {
    const sessions = getFilteredSessions(
      childId,
      gradeLevelName,
      subjectName,
      topicName,
      subTopicName,
      dateRange,
    )
    const sorted = [...sessions].sort((a, b) => {
      const dateA = new Date(a.completedAt ?? a.createdAt).getTime()
      const dateB = new Date(b.completedAt ?? b.createdAt).getTime()
      return dateB - dateA
    })
    return limit ? sorted.slice(0, limit) : sorted
  }

  /**
   * Fetch daily statuses for a child for a specific month
   */
  async function fetchChildDailyStatuses(
    childId: string,
    year: number,
    month: number, // 1-12
  ): Promise<{ statuses: ChildDailyStatus[]; error: string | null }> {
    if (!authStore.user || !authStore.isParent) {
      return { statuses: [], error: errorMessages().notAuthenticatedAsParent }
    }

    // Verify the child is linked to this parent
    const isLinked = childLinkStore.linkedChildren.some((c) => c.id === childId)
    if (!isLinked) {
      return { statuses: [], error: errorMessages().childNotLinked }
    }

    // Calculate date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    try {
      const { data, error: fetchError } = await supabase
        .from('daily_statuses')
        .select('id, date, mood, has_practiced')
        .eq('student_id', childId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })

      if (fetchError) {
        return {
          statuses: [],
          error: handleError(fetchError, 'failedFetchDailyStatuses'),
        }
      }

      const statuses: ChildDailyStatus[] = (data ?? []).map((d) => ({
        id: d.id,
        date: d.date,
        mood: d.mood,
        hasPracticed: d.has_practiced ?? false,
      }))

      return { statuses, error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchDailyStatuses')
      return { statuses: [], error: message }
    }
  }

  /**
   * Get daily session counts for a child for the last N days
   */
  function getDailySessionCounts(childId: string, days: number = 30): DailySessionCount[] {
    const stats = getChildStatistics(childId)
    const sessions = stats?.sessions ?? []

    const todayUTC = mytDateToUTCDate(toMYTDateString())

    // Create a map for the last N days initialized to 0
    const countsMap = new Map<string, number>()
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(todayUTC)
      date.setUTCDate(date.getUTCDate() - i)
      countsMap.set(utcDateToString(date), 0)
    }

    // Count completed sessions per day (group by MYT date)
    sessions
      .filter((s) => s.status === 'completed' && s.completedAt)
      .forEach((session) => {
        const dateStr = toMYTDateString(new Date(session.completedAt!))
        if (countsMap.has(dateStr)) {
          countsMap.set(dateStr, (countsMap.get(dateStr) ?? 0) + 1)
        }
      })

    // Convert to array sorted by date
    return Array.from(countsMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  function resetStatisticsFilters() {
    _resetStatisticsFilters({ dateRange: 'today' })
  }

  // Reset store state (call on logout)
  function $reset() {
    childrenStatistics.value = []
    isLoading.value = false
    error.value = null
    childStatsLastFetched.value.clear()
    subscriptionStatusCache.value.clear()
    resetStatisticsFilters()
  }

  return {
    // State
    childrenStatistics,
    childBadgeSummaries,
    isLoading,
    error,

    // Statistics filters
    statisticsFilters,
    setStatisticsDateRange,
    setStatisticsGradeLevel,
    setStatisticsSubject,
    setStatisticsTopic,
    setStatisticsSubTopic,
    resetStatisticsFilters,

    // Statistics pagination
    statisticsPagination,
    setStatisticsPageIndex,
    setStatisticsPageSize,

    // Computed
    linkedChildrenStatistics,

    // Actions
    fetchChildStatistics,
    getChildStatistics,
    getFilteredSessions,
    getGradeLevels,
    getSubjects,
    getTopics,
    getSubTopics,
    getRecentSessions,
    getSessionById,
    getChildSubscriptionStatus,
    fetchChildDailyStatuses,
    getDailySessionCounts,
    $reset,
  }
})
