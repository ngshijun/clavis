import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { getMYTDayBoundsISO } from '@/lib/date'
import { useAuthStore } from './auth'
import type { Database } from '@/types/database.types'
import { canViewDetailedResults as tierCanViewDetailedResults } from '@/lib/tierConfig'

type SubscriptionTier = Database['public']['Enums']['subscription_tier']

const FALLBACK_SESSIONS_PER_DAY = 3

// Cache TTLs
const SUBSCRIPTION_CACHE_TTL = 2 * 60 * 1000 // 2 minutes
const SESSION_LIMIT_CACHE_TTL = 30 * 1000 // 30 seconds
const SUBSCRIPTION_PLANS_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export interface StudentSubscriptionStatus {
  isLinkedToParent: boolean
  tier: SubscriptionTier
  sessionsPerDay: number
  canViewDetailedResults: boolean // Plus tier and above
}

export interface SessionLimitStatus {
  canStartSession: boolean
  sessionsToday: number
  sessionLimit: number
  remainingSessions: number
}

export const useStudentSubscriptionStore = defineStore('studentSubscription', () => {
  const subscriptionStatusCache = ref<{
    status: StudentSubscriptionStatus | null
    lastFetched: number | null
  }>({
    status: null,
    lastFetched: null,
  })

  const sessionLimitCache = ref<{
    status: SessionLimitStatus | null
    lastFetched: number | null
  }>({
    status: null,
    lastFetched: null,
  })

  const subscriptionPlansCache = ref<{
    plans: Map<string, number> // tier -> sessions_per_day
    lastFetched: number | null
  }>({
    plans: new Map(),
    lastFetched: null,
  })

  function isSubscriptionPlansCacheStale(): boolean {
    if (!subscriptionPlansCache.value.lastFetched) return true
    return Date.now() - subscriptionPlansCache.value.lastFetched > SUBSCRIPTION_PLANS_CACHE_TTL
  }

  async function fetchSubscriptionPlans(): Promise<void> {
    if (!isSubscriptionPlansCacheStale() && subscriptionPlansCache.value.plans.size > 0) {
      return
    }
    try {
      const { data } = await supabase.from('subscription_plans').select('id, sessions_per_day')
      if (data) {
        const plans = new Map<string, number>()
        for (const plan of data) {
          plans.set(plan.id, plan.sessions_per_day ?? FALLBACK_SESSIONS_PER_DAY)
        }
        subscriptionPlansCache.value = { plans, lastFetched: Date.now() }
      }
    } catch (err) {
      console.error('Failed to fetch subscription plans:', err)
    }
  }

  function getSessionsPerDayForTier(tier: string): number {
    return subscriptionPlansCache.value.plans.get(tier) ?? FALLBACK_SESSIONS_PER_DAY
  }

  async function getBasicTierSessionsPerDay(): Promise<number> {
    await fetchSubscriptionPlans()
    return getSessionsPerDayForTier('core')
  }

  function isSubscriptionCacheStale(): boolean {
    if (!subscriptionStatusCache.value.status || !subscriptionStatusCache.value.lastFetched) {
      return true
    }
    return Date.now() - subscriptionStatusCache.value.lastFetched > SUBSCRIPTION_CACHE_TTL
  }

  async function getStudentSubscriptionStatus(force = false): Promise<StudentSubscriptionStatus> {
    if (!force && !isSubscriptionCacheStale() && subscriptionStatusCache.value.status) {
      return subscriptionStatusCache.value.status
    }

    const authStore = useAuthStore()

    if (!authStore.user || authStore.user.userType !== 'student') {
      const basicSessionsPerDay = await getBasicTierSessionsPerDay()
      const status: StudentSubscriptionStatus = {
        isLinkedToParent: false,
        tier: 'core',
        sessionsPerDay: basicSessionsPerDay,
        canViewDetailedResults: false,
      }
      subscriptionStatusCache.value = { status, lastFetched: Date.now() }
      return status
    }

    try {
      const [profileResult, linksResult] = await Promise.all([
        supabase
          .from('student_profiles')
          .select('subscription_tier')
          .eq('id', authStore.user.id)
          .maybeSingle(),
        supabase
          .from('parent_student_links')
          .select('parent_id')
          .eq('student_id', authStore.user.id)
          .limit(1),
        fetchSubscriptionPlans().catch((err) => {
          console.warn('Failed to fetch subscription plans:', err)
        }),
      ])

      const tier = (profileResult.data?.subscription_tier as SubscriptionTier) ?? 'core'
      const isLinkedToParent = (linksResult.data?.length ?? 0) > 0
      const sessionsPerDay = getSessionsPerDayForTier(tier)
      const canViewDetailedResults = tierCanViewDetailedResults(tier)

      const status: StudentSubscriptionStatus = {
        isLinkedToParent,
        tier,
        sessionsPerDay,
        canViewDetailedResults,
      }
      subscriptionStatusCache.value = { status, lastFetched: Date.now() }
      return status
    } catch (err) {
      console.warn('Could not verify subscription, using default plan:', err)
      const basicSessionsPerDay = await getBasicTierSessionsPerDay()
      const status: StudentSubscriptionStatus = {
        isLinkedToParent: false,
        tier: 'core',
        sessionsPerDay: basicSessionsPerDay,
        canViewDetailedResults: false,
      }
      subscriptionStatusCache.value = { status, lastFetched: Date.now() }
      return status
    }
  }

  function isSessionLimitCacheStale(): boolean {
    if (!sessionLimitCache.value.status || !sessionLimitCache.value.lastFetched) return true
    return Date.now() - sessionLimitCache.value.lastFetched > SESSION_LIMIT_CACHE_TTL
  }

  function invalidateSessionLimitCache(): void {
    sessionLimitCache.value = { status: null, lastFetched: null }
  }

  async function checkSessionLimit(
    force = false,
    preloadedSubscriptionStatus?: StudentSubscriptionStatus,
  ): Promise<SessionLimitStatus> {
    const authStore = useAuthStore()

    if (!authStore.user || authStore.user.userType !== 'student') {
      return {
        canStartSession: false,
        sessionsToday: 0,
        sessionLimit: 0,
        remainingSessions: 0,
      }
    }

    if (!force && !isSessionLimitCacheStale() && sessionLimitCache.value.status) {
      return sessionLimitCache.value.status
    }

    const subscriptionStatus = preloadedSubscriptionStatus ?? (await getStudentSubscriptionStatus())

    const { start: todayStart, end: todayEnd } = getMYTDayBoundsISO()

    const { count, error: countError } = await supabase
      .from('practice_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', authStore.user.id)
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd)

    if (countError) {
      console.error('Error counting sessions:', countError)
      return {
        canStartSession: true,
        sessionsToday: 0,
        sessionLimit: subscriptionStatus.sessionsPerDay,
        remainingSessions: subscriptionStatus.sessionsPerDay,
      }
    }

    const sessionsToday = count ?? 0
    const remainingSessions = Math.max(0, subscriptionStatus.sessionsPerDay - sessionsToday)

    const status: SessionLimitStatus = {
      canStartSession: sessionsToday < subscriptionStatus.sessionsPerDay,
      sessionsToday,
      sessionLimit: subscriptionStatus.sessionsPerDay,
      remainingSessions,
    }

    sessionLimitCache.value = { status, lastFetched: Date.now() }
    return status
  }

  function $reset(): void {
    subscriptionStatusCache.value = { status: null, lastFetched: null }
    sessionLimitCache.value = { status: null, lastFetched: null }
    subscriptionPlansCache.value = { plans: new Map(), lastFetched: null }
  }

  return {
    getStudentSubscriptionStatus,
    checkSessionLimit,
    invalidateSessionLimitCache,
    fetchSubscriptionPlans,
    getSessionsPerDayForTier,
    getBasicTierSessionsPerDay,
    $reset,
  }
})
