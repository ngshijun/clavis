import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SubscriptionChangeContext {
  subscription: { stripe_subscription_id: string }
  stripeSubscription: Stripe.Subscription
  currentPriceId: string
  newPriceId: string
  currentAmount: number
  newAmount: number
  isUpgrade: boolean
}

/**
 * Normalize a Stripe expandable field — which may be a raw ID string, an
 * expanded object with `.id`, or absent — into a plain string or null.
 * Replaces the `typeof x === 'string' ? x : x.id` idiom across the codebase.
 */
export function extractStripeId(
  ref: string | { id: string } | null | undefined,
): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

/**
 * Pick the line item that represents the actual subscription charge for the
 * NEW (post-change) plan. On a proration invoice (upgrade with
 * `proration_behavior: 'always_invoice'`) the lines typically look like:
 *
 *   [0] proration credit  → old price, NEGATIVE amount, proration=true
 *   [1] proration charge  → new price, POSITIVE amount, proration=true
 *   [2] full-period charge → new price, POSITIVE amount, proration=false
 *
 * Naively picking `lines.data[0]` misattributes `payment_history.tier` to the
 * OLD plan. We pick the highest-amount non-proration line first, falling back
 * through proration lines, then to lines[0] for fully degenerate invoices.
 */
export function findRepresentativeLineItem(
  invoice: Stripe.Invoice,
): Stripe.InvoiceLineItem | null {
  const lines = invoice.lines?.data ?? []
  if (lines.length === 0) return null

  const isProration = (line: Stripe.InvoiceLineItem): boolean =>
    line.parent?.subscription_item_details?.proration === true

  // Prefer the largest positive non-proration line (the "real" charge).
  const nonProration = lines
    .filter((line) => !isProration(line) && line.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  if (nonProration[0]) return nonProration[0]

  // Fallback: largest positive proration line (still represents the new plan).
  const positiveProration = lines
    .filter((line) => isProration(line) && line.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  if (positiveProration[0]) return positiveProration[0]

  return lines[0]
}

/**
 * Extract billing period timestamps from a Subscription object.
 * In Stripe Clover API (2025+), `current_period_start` and `current_period_end`
 * were removed from the Subscription object. The equivalent data is on the
 * expanded `latest_invoice`'s line items (lines.data[0].period).
 *
 * Note: invoice.period_start/period_end are the invoice's own period (equals
 * subscription start date for the first invoice), NOT the billing cycle period.
 *
 * Callers must expand `latest_invoice` when retrieving the subscription.
 */
export function extractPeriodDates(subscription: Stripe.Subscription): {
  periodStart: number | null
  periodEnd: number | null
} {
  const latestInvoice =
    typeof subscription.latest_invoice === 'object' ? subscription.latest_invoice : null

  const lineItemPeriod = latestInvoice?.lines?.data?.[0]?.period

  return {
    periodStart: lineItemPeriod?.start ?? null,
    periodEnd: lineItemPeriod?.end ?? null,
  }
}

/**
 * Shared validation and lookup for subscription modification.
 * Used by both modify-subscription and preview-upgrade.
 * Throws a Response on validation failure.
 */
export async function resolveSubscriptionChange(
  userId: string,
  studentId: string,
  newPriceId: string,
  supabaseAdmin: SupabaseClient,
  stripe: Stripe,
  errorResponse: (msg: string, status: number) => Response,
  verifyParentStudentLink: (parentId: string, studentId: string) => Promise<void>,
  expandFields?: string[],
): Promise<SubscriptionChangeContext> {
  const [{ data: validPlan }] = await Promise.all([
    supabaseAdmin
      .from('subscription_plans')
      .select('id')
      .eq('stripe_price_id', newPriceId)
      .single(),
    verifyParentStudentLink(userId, studentId),
  ])

  if (!validPlan) {
    throw errorResponse('Invalid price ID', 400)
  }
  if (validPlan.id === 'max') {
    throw errorResponse('This plan is no longer available', 400)
  }

  const { data: subscription } = await supabaseAdmin
    .from('child_subscriptions')
    .select('stripe_subscription_id')
    .eq('student_id', studentId)
    .eq('parent_id', userId)
    .single()

  if (!subscription?.stripe_subscription_id) {
    throw errorResponse('No active subscription found', 404)
  }

  const [stripeSubscription, newPrice] = await Promise.all([
    stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id,
      { expand: expandFields ?? ['items.data.price'] },
    ),
    stripe.prices.retrieve(newPriceId),
  ])

  const currentPrice = stripeSubscription.items.data[0]?.price
  const currentPriceId = currentPrice?.id
  if (currentPriceId === newPriceId) {
    throw errorResponse('Already on this plan', 400)
  }

  const currentAmount = currentPrice?.unit_amount ?? 0
  const newAmount = newPrice.unit_amount ?? 0

  return {
    subscription,
    stripeSubscription,
    currentPriceId,
    newPriceId,
    currentAmount,
    newAmount,
    isUpgrade: newAmount > currentAmount,
  }
}

/**
 * Syncs a Stripe subscription object to the child_subscriptions table.
 * This is the single source of truth for subscription sync logic.
 * Used by:
 * - Webhook handlers (backup/reconciliation)
 * - Direct API responses (immediate sync)
 * - Manual sync operations
 */
export async function syncSubscriptionToDatabase(
  subscription: Stripe.Subscription,
  supabaseAdmin: SupabaseClient
): Promise<{ success: boolean; error?: string }> {
  const parentId = subscription.metadata.supabase_parent_id
  const studentId = subscription.metadata.supabase_student_id

  if (!parentId || !studentId) {
    // Try to find by stripe_subscription_id as fallback
    const { data: existingSub } = await supabaseAdmin
      .from('child_subscriptions')
      .select('parent_id, student_id')
      .eq('stripe_subscription_id', subscription.id)
      .single()

    if (!existingSub) {
      return {
        success: false,
        error: `Missing metadata in subscription ${subscription.id} and no existing record found`,
      }
    }

    // Use existing record's IDs
    return syncWithIds(subscription, existingSub.parent_id, existingSub.student_id, supabaseAdmin)
  }

  return syncWithIds(subscription, parentId, studentId, supabaseAdmin)
}

async function syncWithIds(
  subscription: Stripe.Subscription,
  parentId: string,
  studentId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ success: boolean; error?: string }> {
  const priceId = subscription.items.data[0]?.price.id

  // Get tier from price ID
  const { data: plan } = await supabaseAdmin
    .from('subscription_plans')
    .select('id')
    .eq('stripe_price_id', priceId)
    .single()

  // Keep access during 'past_due' as a grace period while Stripe retries payment
  const isActive = ['active', 'trialing', 'past_due'].includes(subscription.status)

  // The price drifted out of subscription_plans (renamed price, env/account
  // mismatch, or a new Stripe plan not yet seeded). For a live/paying
  // subscription this is the entitlement source of truth, so we must NOT
  // silently downgrade a paying customer to 'core' while Stripe keeps charging
  // the higher amount. Fail instead so the webhook handler throws and Stripe
  // retries / surfaces it for investigation. (Cancellations flow through
  // syncSubscriptionDeletion, not this path.)
  if (!plan && isActive) {
    console.error(
      `No plan found for price ${priceId} on active subscription ${subscription.id} (student ${studentId}). ` +
        `Refusing to downgrade to 'core'. Check subscription_plans table.`,
    )
    return {
      success: false,
      error: `Unresolved Stripe price ${priceId} for active subscription ${subscription.id}`,
    }
  }

  const tier = plan?.id || 'core'

  // Extract period dates from expanded latest_invoice (Clover API)
  const { periodStart, periodEnd } = extractPeriodDates(subscription)

  const currentPeriodStart = periodStart
    ? new Date(periodStart * 1000).toISOString()
    : null
  const currentPeriodEnd = periodEnd
    ? new Date(periodEnd * 1000).toISOString()
    : null
  const startDate = subscription.start_date
    ? new Date(subscription.start_date * 1000).toISOString()
    : new Date().toISOString()

  // next_billing_date is the end of current period (when next charge happens)
  // unless subscription is set to cancel at period end
  const nextBillingDate =
    subscription.cancel_at_period_end || !periodEnd
      ? null
      : new Date(periodEnd * 1000).toISOString()

  // Check if subscription has a schedule - if not, clear scheduled fields
  // This handles the case when a schedule executes and the tier changes
  const hasSchedule = !!subscription.schedule

  // Upsert child subscription
  const { error } = await supabaseAdmin
    .from('child_subscriptions')
    .upsert(
      {
        parent_id: parentId,
        student_id: studentId,
        tier: tier,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        stripe_status: subscription.status,
        is_active: isActive,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: subscription.cancel_at_period_end,
        start_date: startDate,
        next_billing_date: nextBillingDate,
        updated_at: new Date().toISOString(),
        // Clear scheduled fields if no schedule exists (schedule has executed)
        ...(hasSchedule ? {} : {
          scheduled_tier: null,
          scheduled_change_date: null,
          stripe_schedule_id: null,
        }),
      },
      {
        onConflict: 'student_id',
      }
    )

  if (error) {
    console.error('Error syncing subscription to database:', error)
    return { success: false, error: error.message }
  }

  console.log(
    `Subscription ${subscription.id} synced for student ${studentId}, tier: ${tier}, status: ${subscription.status}`
  )
  return { success: true }
}

/**
 * Syncs subscription data when it's been deleted/cancelled in Stripe.
 * Downgrades to basic tier while keeping the record active.
 */
export async function syncSubscriptionDeletion(
  subscriptionId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from('child_subscriptions')
    .update({
      tier: 'core',
      stripe_subscription_id: null,
      stripe_price_id: null,
      stripe_status: 'canceled',
      is_active: true, // Keep active on core tier
      cancel_at_period_end: false,
      current_period_start: null,
      current_period_end: null,
      next_billing_date: null,
      // Clear scheduled fields
      scheduled_tier: null,
      scheduled_change_date: null,
      stripe_schedule_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId)

  if (error) {
    console.error('Error syncing subscription deletion:', error)
    return { success: false, error: error.message }
  }

  console.log(`Subscription ${subscriptionId} deleted, downgraded to core`)
  return { success: true }
}
