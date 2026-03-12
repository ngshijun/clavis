import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { stripe, corsHeaders, errorResponse } from '../_shared/stripe.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { getAuthenticatedUser, verifyParentStudentLink } from '../_shared/auth.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)

    const { studentId, newPriceId } = await req.json()

    if (!studentId || !newPriceId) {
      return errorResponse('Missing required fields', 400)
    }

    // Validate newPriceId against subscription_plans
    const { data: validPlan } = await supabaseAdmin
      .from('subscription_plans')
      .select('id')
      .eq('stripe_price_id', newPriceId)
      .single()

    if (!validPlan) {
      return errorResponse('Invalid price ID', 400)
    }

    // Block deprecated tiers
    if (validPlan.id === 'max') {
      return errorResponse('This plan is no longer available', 400)
    }

    await verifyParentStudentLink(user.id, studentId)

    // Get current subscription
    const { data: subscription } = await supabaseAdmin
      .from('child_subscriptions')
      .select('stripe_subscription_id')
      .eq('student_id', studentId)
      .eq('parent_id', user.id)
      .single()

    if (!subscription?.stripe_subscription_id) {
      return errorResponse('No active subscription found', 404)
    }

    // Retrieve the current subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id,
      { expand: ['items.data.price', 'customer'] }
    )

    const currentPriceId = stripeSubscription.items.data[0]?.price.id
    if (currentPriceId === newPriceId) {
      return errorResponse('Already on this plan', 400)
    }

    // Get price amounts to determine upgrade vs downgrade
    const [currentPrice, newPrice] = await Promise.all([
      stripe.prices.retrieve(currentPriceId),
      stripe.prices.retrieve(newPriceId),
    ])

    const currentAmount = currentPrice.unit_amount ?? 0
    const newAmount = newPrice.unit_amount ?? 0
    const isUpgrade = newAmount > currentAmount

    if (!isUpgrade) {
      // For downgrades, no immediate payment - scheduled for next cycle
      return new Response(
        JSON.stringify({
          isUpgrade: false,
          message: 'Downgrade will be applied at the end of your current billing cycle',
          effectiveDate: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
          currentPlan: {
            priceId: currentPriceId,
            amount: currentAmount,
            currency: currentPrice.currency,
          },
          newPlan: {
            priceId: newPriceId,
            amount: newAmount,
            currency: newPrice.currency,
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

    const prorationDate = Math.floor(Date.now() / 1000)

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
        proration_date: prorationDate,
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
        message: `You'll be charged ${(previewInvoice.amount_due / 100).toFixed(2)} ${previewInvoice.currency.toUpperCase()} today. Your new billing cycle starts immediately.`,
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
