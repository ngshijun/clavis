import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'
import { toMYTDateString, toMYTMonthKey, mytDateToUTCDate, utcDateToString } from '@/lib/date'

// Cache TTL for dashboard stats (5 minutes - balances freshness with avoiding redundant queries)
const STATS_CACHE_TTL = 5 * 60 * 1000

/** Create a Map with keys for the last 12 months (MYT), initialized with defaultValue */
function initializeMonthlyMap<T>(defaultValue: () => T): Map<string, T> {
  const currentMonth = toMYTMonthKey()
  const [cy, cm] = currentMonth.split('-').map(Number)
  const map = new Map<string, T>()
  for (let i = 11; i >= 0; i--) {
    const date = new Date(Date.UTC(cy!, cm! - 1 - i, 1))
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    map.set(key, defaultValue())
  }
  return map
}

/** Convert a YYYY-MM key to a display label like "Jan 2026" */
function monthKeyToLabel(monthKey: string): string {
  const [year, monthNum] = monthKey.split('-')
  const date = new Date(Number(year), Number(monthNum) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export interface MonthlyRevenue {
  month: string // YYYY-MM format
  label: string // e.g., "Jan 2026"
  amount: number // in currency units (not cents)
}

export interface MonthlyUpgrades {
  month: string // YYYY-MM format
  label: string // e.g., "Jan 2026"
  plus: number
  pro: number
  max: number
}

export interface TierDistribution {
  tier: string // 'core' | 'plus' | 'pro' | 'max'
  label: string
  count: number
  color: string
}

export interface DashboardStats {
  revenue: {
    total: number
    currentMonth: number
    previousMonth: number
    change: string
    currency: string
    monthly: MonthlyRevenue[] // Last 12 months
  }
  upgrades: MonthlyUpgrades[] // Last 12 months
  tierDistribution: TierDistribution[]
  users: {
    total: number
    students: number
    parents: number
    admins: number
  }
  activeStudentsToday: number
  practiceSessionsToday: number
}

export const useAdminDashboardStore = defineStore('adminDashboard', () => {
  const stats = ref<DashboardStats>({
    revenue: {
      total: 0,
      currentMonth: 0,
      previousMonth: 0,
      change: '0%',
      currency: 'MYR',
      monthly: [],
    },
    upgrades: [],
    tierDistribution: [],
    users: {
      total: 0,
      students: 0,
      parents: 0,
      admins: 0,
    },
    activeStudentsToday: 0,
    practiceSessionsToday: 0,
  })

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

  // Get today's date in YYYY-MM-DD format (Asia/Kuala_Lumpur timezone)
  function getTodayString(): string {
    return toMYTDateString()
  }

  // Get first day of current month (MYT, returned as UTC ISO string)
  function getCurrentMonthStart(): string {
    const [y, m] = toMYTMonthKey().split('-').map(Number)
    // 1st of month midnight MYT = UTC -8 hours
    return new Date(Date.UTC(y!, m! - 1, 1, -8)).toISOString()
  }

  // Get first and last day of previous month (MYT, returned as UTC ISO strings)
  function getPreviousMonthRange(): { start: string; end: string } {
    const [y, m] = toMYTMonthKey().split('-').map(Number)
    // Previous month start: 1st of (month-1), midnight MYT
    const start = new Date(Date.UTC(y!, m! - 2, 1, -8))
    // Previous month end: last day of (month-1), 23:59:59.999 MYT
    const end = new Date(Date.UTC(y!, m! - 1, 0, 15, 59, 59, 999))
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    }
  }

  // Get range for last 12 months including current month (MYT, returned as UTC ISO string)
  function getLast12MonthsStart(): string {
    const [y, m] = toMYTMonthKey().split('-').map(Number)
    return new Date(Date.UTC(y!, m! - 12, 1, -8)).toISOString()
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
      const today = getTodayString()
      const currentMonthStart = getCurrentMonthStart()
      const previousMonth = getPreviousMonthRange()
      const last12MonthsStart = getLast12MonthsStart()

      // Fetch all stats in parallel
      const [
        usersResult,
        activeStudentsResult,
        practiceSessionsResult,
        totalRevenueResult,
        currentMonthRevenueResult,
        previousMonthRevenueResult,
        monthlyRevenueResult,
        monthlyUpgradesResult,
        tierDistributionResult,
      ] = await Promise.all([
        // Total users by type (server-side aggregation)
        supabase.from('profiles').select('user_type, user_type.count()'),

        // Active students today (rows in daily_statuses with date = today)
        supabase
          .from('daily_statuses')
          .select('id', { count: 'exact', head: true })
          .eq('date', today),

        // Practice sessions created today (MYT boundaries)
        supabase
          .from('practice_sessions')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', `${today}T00:00:00+08:00`)
          .lt('created_at', `${today}T23:59:59.999+08:00`),

        // Total revenue (server-side sum, grouped by currency)
        supabase
          .from('payment_history')
          .select('currency, amount_cents.sum()')
          .eq('status', 'succeeded'),

        // Current month revenue (server-side sum)
        supabase
          .from('payment_history')
          .select('amount_cents.sum()')
          .eq('status', 'succeeded')
          .gte('created_at', currentMonthStart),

        // Previous month revenue (server-side sum)
        supabase
          .from('payment_history')
          .select('amount_cents.sum()')
          .eq('status', 'succeeded')
          .gte('created_at', previousMonth.start)
          .lte('created_at', previousMonth.end),

        // Monthly revenue for last 12 months (batch fetch to avoid 1000-row cap)
        (async () => {
          const BATCH = 1000
          const rows: { amount_cents: number | null; created_at: string | null }[] = []
          let from = 0
          let hasMore = true
          while (hasMore) {
            const { data, error } = await supabase
              .from('payment_history')
              .select('amount_cents, created_at')
              .eq('status', 'succeeded')
              .gte('created_at', last12MonthsStart)
              .order('created_at', { ascending: true })
              .range(from, from + BATCH - 1)
            if (error) return { data: null, error }
            rows.push(...(data ?? []))
            hasMore = (data?.length ?? 0) === BATCH
            from += BATCH
          }
          return { data: rows, error: null }
        })(),

        // Monthly upgrades by tier for last 12 months (batch fetch to avoid 1000-row cap)
        (async () => {
          const BATCH = 1000
          const rows: { tier: string | null; created_at: string | null }[] = []
          let from = 0
          let hasMore = true
          while (hasMore) {
            const { data, error } = await supabase
              .from('payment_history')
              .select('tier, created_at')
              .eq('status', 'succeeded')
              .in('tier', ['plus', 'pro', 'max'])
              .gte('created_at', last12MonthsStart)
              .order('created_at', { ascending: true })
              .range(from, from + BATCH - 1)
            if (error) return { data: null, error }
            rows.push(...(data ?? []))
            hasMore = (data?.length ?? 0) === BATCH
            from += BATCH
          }
          return { data: rows, error: null }
        })(),

        // Subscription tier distribution (server-side aggregation)
        supabase.from('student_profiles').select('subscription_tier, subscription_tier.count()'),
      ])

      // Check for errors
      if (usersResult.error) {
        const message = handleError(usersResult.error, 'Failed to fetch dashboard stats.')
        error.value = message
        return { error: message }
      }

      // Process users (server-side grouped counts)
      if (usersResult.data) {
        const rows = usersResult.data as unknown as { user_type: string; count: number }[]
        let total = 0
        for (const row of rows) {
          total += row.count
          if (row.user_type === 'student') stats.value.users.students = row.count
          else if (row.user_type === 'parent') stats.value.users.parents = row.count
          else if (row.user_type === 'admin') stats.value.users.admins = row.count
        }
        stats.value.users.total = total
      }

      // Process active students
      stats.value.activeStudentsToday = activeStudentsResult.count ?? 0

      // Process practice sessions
      stats.value.practiceSessionsToday = practiceSessionsResult.count ?? 0

      // Process revenue (server-side sums)
      if (totalRevenueResult.data) {
        const rows = totalRevenueResult.data as unknown as { currency: string; sum: number }[]
        const firstRow = rows[0]
        stats.value.revenue.total = (firstRow?.sum ?? 0) / 100
        stats.value.revenue.currency = firstRow?.currency?.toUpperCase() || 'MYR'
      }

      if (currentMonthRevenueResult.data) {
        const rows = currentMonthRevenueResult.data as unknown as { sum: number }[]
        stats.value.revenue.currentMonth = (rows[0]?.sum ?? 0) / 100
      }

      if (previousMonthRevenueResult.data) {
        const rows = previousMonthRevenueResult.data as unknown as { sum: number }[]
        stats.value.revenue.previousMonth = (rows[0]?.sum ?? 0) / 100
      }

      // Calculate percentage change
      const current = stats.value.revenue.currentMonth
      const previous = stats.value.revenue.previousMonth
      if (previous === 0) {
        stats.value.revenue.change = current > 0 ? '+100%' : '0%'
      } else {
        const change = ((current - previous) / previous) * 100
        const sign = change >= 0 ? '+' : ''
        stats.value.revenue.change = `${sign}${change.toFixed(1)}%`
      }

      // Process monthly revenue for chart
      if (monthlyRevenueResult.data) {
        const monthlyMap = initializeMonthlyMap(() => 0)

        for (const payment of monthlyRevenueResult.data) {
          if (payment.created_at) {
            const key = toMYTMonthKey(new Date(payment.created_at))
            const existing = monthlyMap.get(key) ?? 0
            monthlyMap.set(key, existing + (payment.amount_cents ?? 0))
          }
        }

        stats.value.revenue.monthly = Array.from(monthlyMap.entries()).map(([month, cents]) => ({
          month,
          label: monthKeyToLabel(month),
          amount: cents / 100,
        }))
      }

      // Process monthly upgrades for stacked bar chart
      if (monthlyUpgradesResult.data) {
        const upgradesMap = initializeMonthlyMap(() => ({ plus: 0, pro: 0, max: 0 }))

        for (const upgrade of monthlyUpgradesResult.data) {
          if (upgrade.created_at && upgrade.tier) {
            const key = toMYTMonthKey(new Date(upgrade.created_at))
            const existing = upgradesMap.get(key)
            if (existing) {
              const tier = upgrade.tier as 'plus' | 'pro' | 'max'
              existing[tier] = (existing[tier] ?? 0) + 1
            }
          }
        }

        stats.value.upgrades = Array.from(upgradesMap.entries()).map(([month, counts]) => ({
          month,
          label: monthKeyToLabel(month),
          plus: counts.plus,
          pro: counts.pro,
          max: counts.max,
        }))
      }

      // Process subscription tier distribution (server-side grouped counts)
      if (tierDistributionResult.data) {
        const tierColors: Record<string, string> = {
          core: 'var(--chart-4)',
          plus: 'var(--chart-1)',
          pro: 'var(--chart-2)',
          max: 'var(--chart-3)',
        }
        const tierLabels: Record<string, string> = {
          core: 'Core',
          plus: 'Plus',
          pro: 'Pro',
          max: 'Max',
        }
        const rows = tierDistributionResult.data as unknown as {
          subscription_tier: string
          count: number
        }[]
        const tierCounts = new Map<string, number>()
        for (const row of rows) {
          if (row.subscription_tier) {
            tierCounts.set(row.subscription_tier, row.count)
          }
        }
        stats.value.tierDistribution = ['core', 'plus', 'pro', 'max'].map((tier) => ({
          tier,
          label: tierLabels[tier] ?? tier,
          count: tierCounts.get(tier) ?? 0,
          color: tierColors[tier] ?? 'var(--chart-5)',
        }))
      }

      // Update cache timestamp
      lastFetched.value = Date.now()

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to fetch dashboard stats.')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  // Update revenue (for when Stripe is integrated)
  function updateRevenue(total: number, change: string) {
    stats.value.revenue.total = total
    stats.value.revenue.change = change
  }

  function $reset() {
    stats.value = {
      revenue: {
        total: 0,
        currentMonth: 0,
        previousMonth: 0,
        change: '0%',
        currency: 'MYR',
        monthly: [],
      },
      upgrades: [],
      tierDistribution: [],
      users: {
        total: 0,
        students: 0,
        parents: 0,
        admins: 0,
      },
      activeStudentsToday: 0,
      practiceSessionsToday: 0,
    }
    isLoading.value = false
    error.value = null
    lastFetched.value = null
  }

  return {
    stats,
    isLoading,
    error,
    fetchStats,
    updateRevenue,
    $reset,
  }
})
