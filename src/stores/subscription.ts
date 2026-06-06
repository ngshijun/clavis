import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import type { Database } from '@/types/database.types'
import { handleError, errorMessages } from '@/lib/errors'

export type SubscriptionTier = Database['public']['Enums']['subscription_tier']
type SubscriptionPlanRow = Database['public']['Tables']['subscription_plans']['Row']
type ChildSubscriptionRow = Database['public']['Tables']['child_subscriptions']['Row']

export interface SubscriptionPlan {
  id: SubscriptionTier
  name: string
  price: number // monthly price
  originalPrice?: number // promotional "was" price (UI only)
  sessionsPerDay: number
  features: string[]
  highlighted?: boolean
  stripePriceId?: string
}

export interface StripeSubscriptionDetails {
  stripeSubscriptionId: string | null
  stripePriceId: string | null
  stripeStatus: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export interface UpgradePreview {
  isUpgrade: boolean
  amountDue?: number
  currency?: string
  lineItems?: Array<{
    description: string
    amount: number
    currency: string
    proration: boolean
  }>
  currentPlan: {
    name: string
    priceId: string
    amount: number
  }
  newPlan: {
    name: string
    priceId: string
    amount: number
  }
  effectiveDate?: string
  newBillingCycleStart?: string
  newBillingCycleEnd?: string
}

export interface ScheduledChange {
  scheduledTier: SubscriptionTier
  scheduledChangeDate: string
  stripeScheduleId?: string
}

export interface ChildSubscription {
  childId: string
  tier: SubscriptionTier
  startDate: string
  nextBillingDate?: string
  isActive: boolean
  stripe?: StripeSubscriptionDetails
  scheduledChange?: ScheduledChange
}

/** Narrow an unknown (Json column) value to a string[] of feature labels. */
function toFeatureList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

/**
 * Validate the preview-upgrade edge function response into an UpgradePreview.
 * Returns null when the payload is missing the required shape so callers can
 * surface an error instead of consuming an unchecked cast.
 */
function parseUpgradePreview(data: unknown): UpgradePreview | null {
  if (typeof data !== 'object' || data === null) return null
  const obj = data as Record<string, unknown>
  if (typeof obj.isUpgrade !== 'boolean') return null
  if (typeof obj.currentPlan !== 'object' || obj.currentPlan === null) return null
  if (typeof obj.newPlan !== 'object' || obj.newPlan === null) return null
  // Shape validated above; the edge function owns the full contract.
  return data as UpgradePreview
}

// Cache TTL constants
const PLANS_CACHE_TTL = 10 * 60 * 1000 // 10 minutes - plans rarely change
const SUBSCRIPTIONS_CACHE_TTL = 2 * 60 * 1000 // 2 minutes - subscriptions may change more often

export const useSubscriptionStore = defineStore('subscription', () => {
  const authStore = useAuthStore()

  // Define subscription plans (fetched from DB)
  const plans = ref<SubscriptionPlan[]>([])
  const childSubscriptions = ref<ChildSubscription[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const isProcessingPayment = ref(false)
  const processingTier = ref<SubscriptionTier | null>(null)
  const paymentError = ref<string | null>(null)

  // Cache timestamps for staleness tracking
  const plansLastFetched = ref<number | null>(null)
  const subscriptionsLastFetched = ref<number | null>(null)

  // Whether a successful children-subscriptions fetch has ever populated the
  // store. Distinguishes "confirmed Core (DB row genuinely absent)" from
  // "unknown (fetch hasn't landed / failed)" so the UI can avoid asserting a
  // paying child is a free Core user during a fetch gap.
  const subscriptionsFetched = ref(false)

  /**
   * Check if plans cache is still valid
   */
  function isPlansStale(): boolean {
    if (!plansLastFetched.value || plans.value.length === 0) return true
    return Date.now() - plansLastFetched.value > PLANS_CACHE_TTL
  }

  /**
   * Check if subscriptions cache is still valid
   */
  function isSubscriptionsStale(): boolean {
    if (!subscriptionsLastFetched.value) return true
    return Date.now() - subscriptionsLastFetched.value > SUBSCRIPTIONS_CACHE_TTL
  }

  /**
   * Fetch subscription plans from the database (with caching)
   */
  async function fetchPlans(force = false): Promise<{ error: string | null }> {
    // Skip if cache is still valid and not forced
    if (!force && !isPlansStale()) {
      return { error: null }
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_monthly', { ascending: true })

      if (fetchError) throw fetchError

      const promoOriginalPrices: Partial<Record<SubscriptionTier, number>> = {
        plus: 19.99,
        pro: 39.99,
      }

      plans.value = (data ?? []).map((row: SubscriptionPlanRow) => ({
        id: row.id,
        name: row.name,
        price: row.price_monthly,
        originalPrice: promoOriginalPrices[row.id],
        sessionsPerDay: row.sessions_per_day,
        features: toFeatureList(row.features),
        highlighted: row.is_highlighted ?? false,
        stripePriceId: row.stripe_price_id ?? undefined,
      }))

      plansLastFetched.value = Date.now()
      return { error: null }
    } catch (err) {
      console.error('Error fetching subscription plans:', err)
      const message = handleError(err, 'failedFetchPlans')
      return { error: message }
    }
  }

  /**
   * Fetch subscriptions for all linked children (with caching)
   */
  async function fetchChildrenSubscriptions(
    childIds?: string[],
    force = false,
  ): Promise<{ error: string | null }> {
    if (!authStore.user || !authStore.isParent) {
      return { error: errorMessages().notAuthenticatedAsParent }
    }

    // Use provided childIds, or fall back to IDs from existing subscriptions (for internal re-fetches)
    const ids = childIds ?? childSubscriptions.value.map((s) => s.childId)

    if (ids.length === 0) {
      childSubscriptions.value = []
      subscriptionsFetched.value = true
      return { error: null }
    }

    // Skip if cache is still valid and not forced
    if (!force && !isSubscriptionsStale() && childSubscriptions.value.length > 0) {
      return { error: null }
    }

    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('child_subscriptions')
        .select('*')
        .eq('parent_id', authStore.user.id)
        .in('student_id', ids)

      if (fetchError) throw fetchError

      // Map existing subscriptions
      const subscriptionMap = new Map<string, ChildSubscriptionRow>()
      for (const row of data ?? []) {
        subscriptionMap.set(row.student_id, row)
      }

      // Build subscription array for all children (default to basic if not found)
      childSubscriptions.value = ids.map((childId) => {
        const existing = subscriptionMap.get(childId)
        if (existing) {
          const subscription: ChildSubscription = {
            childId: existing.student_id,
            tier: existing.tier,
            startDate: existing.start_date,
            nextBillingDate: existing.next_billing_date ?? undefined,
            isActive: existing.is_active ?? true,
            stripe: {
              stripeSubscriptionId: existing.stripe_subscription_id,
              stripePriceId: existing.stripe_price_id,
              stripeStatus: existing.stripe_status,
              currentPeriodStart: existing.current_period_start,
              currentPeriodEnd: existing.current_period_end,
              cancelAtPeriodEnd: existing.cancel_at_period_end ?? false,
            },
          }

          // Add scheduled change info if present
          if (existing.scheduled_tier && existing.scheduled_change_date) {
            subscription.scheduledChange = {
              scheduledTier: existing.scheduled_tier,
              scheduledChangeDate: existing.scheduled_change_date,
              stripeScheduleId: existing.stripe_schedule_id ?? undefined,
            }
          }

          return subscription
        }
        // Default to basic subscription
        return {
          childId,
          tier: 'core' as SubscriptionTier,
          startDate: new Date().toISOString(),
          isActive: true,
        }
      })

      subscriptionsLastFetched.value = Date.now()
      subscriptionsFetched.value = true
      return { error: null }
    } catch (err) {
      console.error('Error fetching children subscriptions:', err)
      const message = handleError(err, 'failedFetchSubscriptions')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  // Get subscription for a specific child
  function getChildSubscription(childId: string): ChildSubscription {
    const existing = childSubscriptions.value.find((s) => s.childId === childId)
    if (existing) return existing

    // Return default basic subscription if not found
    return {
      childId,
      tier: 'core',
      startDate: new Date().toISOString(),
      isActive: true,
    }
  }

  // Get plan for a specific child
  function getChildPlan(childId: string): SubscriptionPlan | undefined {
    const subscription = getChildSubscription(childId)
    return plans.value.find((p) => p.id === subscription.tier)
  }

  /**
   * Check if a child has an active Stripe subscription
   */
  function hasActiveStripeSubscription(childId: string): boolean {
    const subscription = getChildSubscription(childId)
    return !!subscription.stripe?.stripeSubscriptionId
  }

  /**
   * Create a Stripe Checkout session for a new subscription
   */
  async function createCheckoutSession(
    childId: string,
    tier: SubscriptionTier,
  ): Promise<{ url: string | null; error: string | null }> {
    if (!authStore.user || !authStore.isParent) {
      return { url: null, error: errorMessages().notAuthenticatedAsParent }
    }

    if (tier === 'core') {
      return { url: null, error: errorMessages().cannotCheckoutCoreTier }
    }

    // Get price ID for tier
    const plan = plans.value.find((p) => p.id === tier)
    if (!plan?.stripePriceId) {
      return { url: null, error: errorMessages().planNotConfiguredForPayments }
    }

    isProcessingPayment.value = true
    processingTier.value = tier
    paymentError.value = null

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'create-checkout-session',
        {
          body: {
            priceId: plan.stripePriceId,
            studentId: childId,
          },
        },
      )

      if (invokeError) throw invokeError
      if (data.error) throw new Error(data.error)

      return { url: data.url, error: null }
    } catch (err) {
      const message = handleError(err, 'failedCreateCheckout')
      paymentError.value = message
      return { url: null, error: message }
    } finally {
      isProcessingPayment.value = false
      processingTier.value = null
    }
  }

  /**
   * Open Stripe Customer Portal for billing management
   */
  async function openCustomerPortal(): Promise<{ url: string | null; error: string | null }> {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'create-portal-session',
        { body: {} },
      )

      if (invokeError) throw invokeError
      if (data.error) throw new Error(data.error)

      return { url: data.url, error: null }
    } catch (err) {
      const message = handleError(err, 'failedOpenBillingPortal')
      return { url: null, error: message }
    }
  }

  /**
   * Sync subscription state from Stripe to database.
   * Used after checkout redirect and for manual reconciliation.
   */
  async function syncSubscription(
    childId: string,
    sessionId?: string,
  ): Promise<{ error: string | null }> {
    isProcessingPayment.value = true
    paymentError.value = null

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('sync-subscription', {
        body: {
          studentId: childId,
          sessionId: sessionId,
        },
      })

      if (invokeError) throw invokeError
      if (data.error) throw new Error(data.error)

      // Refresh subscriptions to get synced data
      await fetchChildrenSubscriptions()
      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedSyncSubscription')
      paymentError.value = message
      return { error: message }
    } finally {
      isProcessingPayment.value = false
    }
  }

  /**
   * Preview an upgrade to see prorated costs before confirming
   */
  async function previewUpgrade(
    childId: string,
    newTier: SubscriptionTier,
  ): Promise<{ preview: UpgradePreview | null; error: string | null }> {
    if (!authStore.user || !authStore.isParent) {
      return { preview: null, error: errorMessages().notAuthenticatedAsParent }
    }

    const plan = plans.value.find((p) => p.id === newTier)
    if (!plan?.stripePriceId) {
      return { preview: null, error: errorMessages().planNotConfiguredForPayments }
    }

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('preview-upgrade', {
        body: {
          studentId: childId,
          newPriceId: plan.stripePriceId,
        },
      })

      if (invokeError) throw invokeError
      if (data.error) throw new Error(data.error)

      const preview = parseUpgradePreview(data)
      if (!preview) {
        return { preview: null, error: errorMessages().failedPreviewUpgrade }
      }
      return { preview, error: null }
    } catch (err) {
      const message = handleError(err, 'failedPreviewUpgrade')
      return { preview: null, error: message }
    }
  }

  /**
   * Extract the server-supplied error message from a FunctionsHttpError.
   * supabase-js stashes the raw Response in `err.context`; without this,
   * structured error bodies (e.g., the 402 from modify-subscription on a
   * declined card) collapse into handleError's generic fallback.
   */
  async function extractFunctionErrorMessage(err: unknown): Promise<string | null> {
    if (typeof err !== 'object' || err === null) return null
    const ctx = (err as { context?: { response?: Response } }).context
    if (!ctx?.response) return null
    try {
      const body = await ctx.response.clone().json()
      if (body && typeof body === 'object' && 'error' in body) {
        return String((body as { error: unknown }).error)
      }
    } catch {
      // Body wasn't JSON — fall through to null.
    }
    return null
  }

  /**
   * Modify an existing Stripe subscription (upgrade/downgrade)
   * - Upgrades: Applied immediately with proration
   * - Downgrades: Scheduled for next billing cycle
   */
  async function modifySubscription(
    childId: string,
    newTier: SubscriptionTier,
  ): Promise<{
    error: string | null
    type?: 'immediate' | 'scheduled'
    scheduledDate?: string
    message?: string
  }> {
    if (newTier === 'core') {
      // Downgrade to basic = cancel at period end (user keeps access until period ends)
      const result = await cancelStripeSubscription(childId, false)
      return { ...result, type: 'scheduled' }
    }

    const plan = plans.value.find((p) => p.id === newTier)
    if (!plan?.stripePriceId) {
      return { error: errorMessages().planNotConfiguredForPayments }
    }

    isProcessingPayment.value = true
    processingTier.value = newTier
    paymentError.value = null

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('modify-subscription', {
        body: {
          studentId: childId,
          newPriceId: plan.stripePriceId,
        },
      })

      if (invokeError) {
        // Stripe decline / 3DS / etc. — surface the server's specific message
        // instead of collapsing into a generic "failed to modify subscription".
        const serverMessage = await extractFunctionErrorMessage(invokeError)
        if (serverMessage) {
          paymentError.value = serverMessage
          return { error: serverMessage }
        }
        throw invokeError
      }
      if (data.error) throw new Error(data.error)

      // Refresh subscriptions to get updated data (non-blocking, non-critical)
      // If refresh fails, the modification still succeeded - just log a warning
      try {
        await fetchChildrenSubscriptions(undefined, true) // Force refresh
      } catch (refreshErr) {
        console.warn('Failed to refresh subscriptions after modification:', refreshErr)
        // Invalidate cache so next access will fetch fresh data
        subscriptionsLastFetched.value = null
      }

      return {
        error: null,
        type: data.type,
        scheduledDate: data.scheduledDate,
        message: data.message,
      }
    } catch (err) {
      const message = handleError(err, 'failedModifySubscription')
      paymentError.value = message
      return { error: message }
    } finally {
      isProcessingPayment.value = false
      processingTier.value = null
    }
  }

  /**
   * Cancel a Stripe subscription
   */
  async function cancelStripeSubscription(
    childId: string,
    immediately: boolean = false,
  ): Promise<{ error: string | null }> {
    isProcessingPayment.value = true
    processingTier.value = 'core'
    paymentError.value = null

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('cancel-subscription', {
        body: {
          studentId: childId,
          cancelImmediately: immediately,
        },
      })

      if (invokeError) throw invokeError
      if (data.error) throw new Error(data.error)

      // Force-refresh: the subscription state changed server-side (schedule
      // released, cancel_at_period_end flipped), so the in-memory cache is
      // guaranteed stale. Without `force: true` a recent fetch (e.g. from a
      // prior downgrade in the same session) would short-circuit this call
      // and the UI would keep showing the old status.
      await fetchChildrenSubscriptions(undefined, true)
      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedCancelSubscription')
      paymentError.value = message
      return { error: message }
    } finally {
      isProcessingPayment.value = false
      processingTier.value = null
    }
  }

  /**
   * Reverse a pending downgrade (scheduled downgrade or cancel-at-period-end)
   * so the subscription stays on its current plan. Server detects which state
   * is active; client doesn't need to distinguish.
   *
   * The edge function is still named `keep-current-plan` — that's the internal
   * implementation name. User-facing copy and this API are named after the
   * action ("cancel the downgrade") rather than the outcome ("keep the plan").
   */
  async function cancelDowngrade(childId: string): Promise<{ error: string | null }> {
    isProcessingPayment.value = true
    paymentError.value = null

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('keep-current-plan', {
        body: { studentId: childId },
      })

      if (invokeError) throw invokeError
      if (data.error) throw new Error(data.error)

      await fetchChildrenSubscriptions(undefined, true)
      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedCancelDowngrade')
      paymentError.value = message
      return { error: message }
    } finally {
      isProcessingPayment.value = false
    }
  }

  // Get total monthly cost across all children
  const totalMonthlyCost = computed(() => {
    return childSubscriptions.value.reduce((total, sub) => {
      const plan = plans.value.find((p) => p.id === sub.tier)
      return total + (plan?.price ?? 0)
    }, 0)
  })

  // Check if any child has an active Stripe subscription (for showing billing portal)
  const hasAnyStripeSubscription = computed(() => {
    return childSubscriptions.value.some((sub) => sub.stripe?.stripeSubscriptionId)
  })

  // True once a children-subscriptions fetch has successfully populated the
  // store. The UI should treat a fabricated Core default as authoritative only
  // when this is true; otherwise the tier is unknown (fetch pending/failed).
  const hasFetchedSubscriptions = computed(() => subscriptionsFetched.value)

  // Reset user-specific state (call on logout)
  // Note: plans is shared data and doesn't need reset
  function $reset() {
    childSubscriptions.value = []
    subscriptionsFetched.value = false
    subscriptionsLastFetched.value = null
    isLoading.value = false
    error.value = null
    isProcessingPayment.value = false
    processingTier.value = null
    paymentError.value = null
  }

  /** Plans visible to users (excludes deprecated Max tier) */
  const visiblePlans = computed(() => plans.value.filter((p) => p.id !== 'max'))

  return {
    // State
    plans,
    visiblePlans,
    childSubscriptions,
    isLoading,
    error,
    isProcessingPayment,
    processingTier,
    paymentError,

    // Computed
    totalMonthlyCost,
    hasAnyStripeSubscription,
    hasFetchedSubscriptions,

    // Actions
    fetchPlans,
    fetchChildrenSubscriptions,
    getChildSubscription,
    getChildPlan,
    hasActiveStripeSubscription,

    // Stripe Actions
    createCheckoutSession,
    openCustomerPortal,
    syncSubscription,
    previewUpgrade,
    modifySubscription,
    cancelStripeSubscription,
    cancelDowngrade,
    $reset,
  }
})
