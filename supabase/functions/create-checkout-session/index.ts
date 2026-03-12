import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { stripe, corsHeaders, errorResponse } from '../_shared/stripe.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { getAuthenticatedUser, verifyParent, verifyParentStudentLink } from '../_shared/auth.ts'

interface RequestBody {
  priceId: string
  studentId: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    await verifyParent(user.id)

    const { priceId, studentId }: RequestBody = await req.json()

    if (!priceId || !studentId) {
      return errorResponse('Missing required fields', 400)
    }

    // Validate priceId against subscription_plans to prevent arbitrary price injection
    const { data: validPlan } = await supabaseAdmin
      .from('subscription_plans')
      .select('id, stripe_price_id')
      .eq('stripe_price_id', priceId)
      .single()

    if (!validPlan) {
      return errorResponse('Invalid price ID', 400)
    }

    // Block deprecated tiers from being purchased
    if (validPlan.id === 'max') {
      return errorResponse('This plan is no longer available', 400)
    }

    // Construct redirect URLs server-side to prevent open redirect attacks
    const appUrl = Deno.env.get('APP_URL')
    if (!appUrl) {
      return errorResponse('Server misconfiguration: APP_URL not set', 500)
    }
    const successUrl = `${appUrl}/parent/subscription?success=true`
    const cancelUrl = `${appUrl}/parent/subscription?canceled=true`

    await verifyParentStudentLink(user.id, studentId)

    // Get or create Stripe customer
    const { data: parentProfile } = await supabaseAdmin
      .from('parent_profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    let stripeCustomerId = parentProfile?.stripe_customer_id

    if (!stripeCustomerId) {
      // Create new Stripe customer
      const { data: parentInfo } = await supabaseAdmin
        .from('profiles')
        .select('name, email')
        .eq('id', user.id)
        .single()

      const customer = await stripe.customers.create({
        email: parentInfo?.email ?? undefined,
        name: parentInfo?.name ?? undefined,
        metadata: {
          supabase_parent_id: user.id,
        },
      })

      stripeCustomerId = customer.id

      // Save Stripe customer ID
      await supabaseAdmin
        .from('parent_profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id)
    }

    // Check for existing active Stripe subscription for this student
    const { data: existingSubscription } = await supabaseAdmin
      .from('child_subscriptions')
      .select('stripe_subscription_id, tier')
      .eq('student_id', studentId)
      .eq('is_active', true)
      .single()

    if (existingSubscription?.stripe_subscription_id) {
      return errorResponse('Student already has an active subscription. Use modify subscription instead.', 400)
    }

    // Get student name for description
    const { data: studentInfo } = await supabaseAdmin
      .from('profiles')
      .select('name')
      .eq('id', studentId)
      .single()

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          supabase_parent_id: user.id,
          supabase_student_id: studentId,
          student_name: studentInfo?.name || 'Unknown',
        },
      },
      metadata: {
        supabase_parent_id: user.id,
        supabase_student_id: studentId,
      },
    })

    return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    if (error instanceof Response) return error
    return errorResponse('Failed to create checkout session', 500, error)
  }
})
