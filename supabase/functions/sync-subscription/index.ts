import '@supabase/functions-js/edge-runtime.d.ts'
import { stripe, corsHeaders, errorResponse } from '../_shared/stripe.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import {
  syncSubscriptionToDatabase,
  extractPeriodDates,
  extractStripeId,
} from '../_shared/sync-helpers.ts'
import { getAuthenticatedUser, verifyParent, verifyParentStudentLink } from '../_shared/auth.ts'

/**
 * Sync Subscription Edge Function
 *
 * Fetches the current subscription state from Stripe and syncs to database.
 * Used for:
 * - After checkout redirect (verify payment succeeded)
 * - Manual reconciliation
 * - When webhook may have failed
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    await verifyParent(user.id)

    const { studentId, sessionId } = await req.json()

    if (!studentId) {
      return errorResponse('Missing studentId', 400)
    }

    await verifyParentStudentLink(user.id, studentId)

    let stripeSubscriptionId: string | null = null

    // If sessionId is provided (from checkout redirect), get subscription from session
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription'],
      })

      if (session.payment_status !== 'paid') {
        return errorResponse('Payment not completed', 400)
      }

      stripeSubscriptionId = extractStripeId(session.subscription)
    }

    // If no sessionId, try to get subscription from database
    if (!stripeSubscriptionId) {
      const { data: existingSub } = await supabaseAdmin
        .from('child_subscriptions')
        .select('stripe_subscription_id')
        .eq('student_id', studentId)
        .eq('parent_id', user.id)
        .single()

      stripeSubscriptionId = existingSub?.stripe_subscription_id || null
    }

    if (!stripeSubscriptionId) {
      return errorResponse('No subscription found for this student', 404)
    }

    // Fetch current subscription from Stripe (expand latest_invoice for period dates)
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ['latest_invoice'],
    })

    // Verify the subscription's Stripe customer belongs to the authenticated
    // parent. Without this check, any authenticated parent could pass an
    // arbitrary sessionId/subscription_id and trigger sync/metadata-write
    // side effects on someone else's subscription.
    const subscriptionCustomerId = extractStripeId(subscription.customer)

    const { data: parentProfile } = await supabaseAdmin
      .from('parent_profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (
      !parentProfile?.stripe_customer_id ||
      parentProfile.stripe_customer_id !== subscriptionCustomerId
    ) {
      return errorResponse('Subscription does not belong to this user', 403)
    }

    // Ensure metadata has parent/student IDs for sync. Safe to trust the
    // caller's IDs here because the customer-ownership check above
    // guarantees this subscription belongs to them.
    if (!subscription.metadata.supabase_parent_id || !subscription.metadata.supabase_student_id) {
      // Update Stripe subscription with metadata if missing
      await stripe.subscriptions.update(stripeSubscriptionId, {
        metadata: {
          supabase_parent_id: user.id,
          supabase_student_id: studentId,
        },
      })
      // Re-fetch with updated metadata
      subscription.metadata.supabase_parent_id = user.id
      subscription.metadata.supabase_student_id = studentId
    }

    // Sync to database using shared helper
    const syncResult = await syncSubscriptionToDatabase(subscription, supabaseAdmin)

    if (!syncResult.success) {
      return errorResponse(syncResult.error || 'Sync failed', 500)
    }

    // Return synced subscription data
    const { periodStart, periodEnd } = extractPeriodDates(subscription)
    return new Response(
      JSON.stringify({
        synced: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          currentPeriodStart: periodStart ? new Date(periodStart * 1000).toISOString() : null,
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    if (error instanceof Response) return error
    return errorResponse('Failed to sync subscription', 500, error)
  }
})
