import '@supabase/functions-js/edge-runtime.d.ts'
import { stripe, corsHeaders, errorResponse } from '../_shared/stripe.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { resolveSubscriptionChange, extractPeriodDates } from '../_shared/sync-helpers.ts'
import { getAuthenticatedUser, verifyParent, verifyParentStudentLink } from '../_shared/auth.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    await verifyParent(user.id)

    const { studentId, newPriceId } = await req.json()

    if (!studentId || !newPriceId) {
      return errorResponse('Missing required fields', 400)
    }

    const {
      subscription,
      stripeSubscription,
      currentPriceId,
      currentAmount,
      newAmount,
      isUpgrade,
    } = await resolveSubscriptionChange(
      user.id,
      studentId,
      newPriceId,
      supabaseAdmin,
      stripe,
      errorResponse,
      verifyParentStudentLink,
      ['items.data.price', 'customer', 'latest_invoice'],
    )

    const { periodEnd } = extractPeriodDates(stripeSubscription)

    if (!isUpgrade) {
      // For downgrades, no immediate payment - scheduled for next cycle
      return new Response(
        JSON.stringify({
          isUpgrade: false,
          // No message — client builds the downgrade notice from effectiveDate via locale.
          effectiveDate: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          currentPlan: {
            priceId: currentPriceId,
            amount: currentAmount,
            currency: stripeSubscription.currency,
          },
          newPlan: {
            priceId: newPriceId,
            amount: newAmount,
            currency: stripeSubscription.currency,
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // For upgrades, preview the proration invoice
    const customerId =
      typeof stripeSubscription.customer === 'string'
        ? stripeSubscription.customer
        : stripeSubscription.customer.id

    // Mirror modify-subscription's update call shape so the preview matches what
    // will actually happen on commit. In Clover flexible mode, `proration_date`
    // is not allowed together with `billing_cycle_anchor: 'now'` — Stripe rejects
    // with a 400. When the anchor resets to now, "now" is inherently the
    // proration cutoff, so there's nothing to specify.
    const previewInvoice = await stripe.invoices.createPreview({
      customer: customerId,
      subscription: subscription.stripe_subscription_id,
      subscription_details: {
        items: [
          {
            id: stripeSubscription.items.data[0].id,
            price: newPriceId,
          },
        ],
        billing_cycle_anchor: 'now',
        proration_behavior: 'create_prorations',
      },
    })

    const lineItems = previewInvoice.lines.data.map((line) => ({
      description: line.description,
      amount: line.amount,
      currency: line.currency,
      proration: line.proration,
    }))

    // Get plan names for display
    const [currentPlan, newPlan] = await Promise.all([
      supabaseAdmin
        .from('subscription_plans')
        .select('name')
        .eq('stripe_price_id', currentPriceId)
        .single(),
      supabaseAdmin
        .from('subscription_plans')
        .select('name')
        .eq('stripe_price_id', newPriceId)
        .single(),
    ])

    return new Response(
      JSON.stringify({
        isUpgrade: true,
        amountDue: previewInvoice.amount_due,
        currency: previewInvoice.currency,
        lineItems,
        currentPlan: {
          name: currentPlan.data?.name || 'Current Plan',
          priceId: currentPriceId,
          amount: currentAmount,
        },
        newPlan: {
          name: newPlan.data?.name || 'New Plan',
          priceId: newPriceId,
          amount: newAmount,
        },
        // No server-built `message` — client composes via locale strings.
        newBillingCycleStart: new Date().toISOString(),
        newBillingCycleEnd: previewInvoice.lines.data[0]?.period?.end
          ? new Date(previewInvoice.lines.data[0].period.end * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    if (error instanceof Response) return error
    return errorResponse('Failed to preview upgrade', 500, error)
  }
})
