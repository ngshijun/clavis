import '@supabase/functions-js/edge-runtime.d.ts'
import { stripe, WEBHOOK_SECRET } from '../_shared/stripe.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import {
  syncSubscriptionToDatabase,
  syncSubscriptionDeletion,
} from '../_shared/sync-helpers.ts'
import type Stripe from 'stripe'

/**
 * Atomically claim a webhook event for processing (INSERT-first idempotency).
 * Returns: 'claimed' (proceed), 'duplicate' (skip, return 200), 'error' (return 500)
 */
async function tryClaimEvent(eventId: string, eventType: string): Promise<'claimed' | 'duplicate' | 'error'> {
  const { error } = await supabaseAdmin
    .from('processed_webhook_events')
    .insert({ event_id: eventId, event_type: eventType })
  if (error) {
    if (error.code === '23505') return 'duplicate'
    console.error('Error claiming event:', error)
    return 'error'
  }
  return 'claimed'
}

/**
 * Release a claimed event so it can be retried on next webhook delivery.
 */
async function releaseEvent(eventId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('processed_webhook_events')
    .delete()
    .eq('event_id', eventId)
  if (error) {
    console.error(`Failed to release event ${eventId}:`, error)
  }
}

Deno.serve(async (req: Request) => {
  // Stripe webhooks are server-to-server — no CORS needed
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('No signature', { status: 400 })
  }

  try {
    const body = await req.text()
    const event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET)

    console.log(`Webhook event: ${event.type}, ID: ${event.id}`)

    // Atomic idempotency: claim the event before processing
    const claimResult = await tryClaimEvent(event.id, event.type)
    if (claimResult === 'duplicate') {
      console.log(`Event ${event.id} already claimed, skipping`)
      return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (claimResult === 'error') {
      return new Response('Database error', { status: 500 })
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
          break

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionUpdate(event.data.object as Stripe.Subscription)
          break

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
          break

        case 'invoice.paid':
          await handleInvoicePaid(event.data.object as Stripe.Invoice)
          break

        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object as Stripe.Invoice)
          break

        default:
          console.log(`Unhandled event type: ${event.type}`)
      }
    } catch (handlerError) {
      // Handler failed — release the claim so Stripe can retry
      console.error(`Handler failed for event ${event.id}:`, handlerError)
      await releaseEvent(event.id)
      return new Response('Handler failed', { status: 500 })
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response('Webhook processing failed', { status: 400 })
  }
})

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') return

  const parentId = session.metadata?.supabase_parent_id
  const studentId = session.metadata?.supabase_student_id

  if (!parentId || !studentId) {
    throw new Error('Missing metadata in checkout session')
  }

  // Subscription details will be synced via subscription.created webhook
  console.log(`Checkout completed for parent ${parentId}, student ${studentId}`)
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const result = await syncSubscriptionToDatabase(subscription, supabaseAdmin)
  if (!result.success) {
    throw new Error(`Sync failed: ${result.error}`)
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const result = await syncSubscriptionDeletion(subscription.id, supabaseAdmin)
  if (!result.success) {
    throw new Error(`Deletion sync failed: ${result.error}`)
  }
}

/**
 * Extract a subscription ID from a value that may be a string ID or expanded Subscription object.
 */
function extractSubscriptionId(raw: string | Stripe.Subscription | null | undefined): string | null {
  if (!raw) return null
  return typeof raw === 'string' ? raw : raw.id
}

/**
 * Extract subscription ID from a Clover-era Invoice object.
 * In Clover API versions, `invoice.subscription` was moved to
 * `invoice.parent.subscription_details.subscription`.
 */
function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  // Primary: invoice.parent.subscription_details.subscription (Clover-era)
  const fromParent = extractSubscriptionId(invoice.parent?.subscription_details?.subscription)
  if (fromParent) return fromParent

  // Fallback: line item's parent.subscription_item_details.subscription
  const lineItem = invoice.lines?.data?.[0]
  const fromLineItem = extractSubscriptionId(lineItem?.parent?.subscription_item_details?.subscription)
  if (fromLineItem) return fromLineItem

  // Last resort: line item's top-level subscription field (may exist in some versions)
  return extractSubscriptionId(lineItem?.subscription)
}

/**
 * Resolve parentId and studentId from an invoice using a 3-tier fallback:
 * 1. Invoice's parent subscription_details metadata (Clover-era)
 * 2. Stripe subscription metadata (API call)
 * 3. Existing child_subscriptions DB record
 */
async function resolveInvoiceMetadata(
  invoice: Stripe.Invoice,
  subscriptionId: string,
): Promise<{ parentId: string; studentId: string | null }> {
  const invoiceMetadata = invoice.parent?.subscription_details?.metadata
  let parentId = invoiceMetadata?.supabase_parent_id
  let studentId = invoiceMetadata?.supabase_student_id

  if (!parentId || !studentId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    parentId = parentId || subscription.metadata.supabase_parent_id
    studentId = studentId || subscription.metadata.supabase_student_id
  }

  if (!parentId || !studentId) {
    const { data: existingSub } = await supabaseAdmin
      .from('child_subscriptions')
      .select('parent_id, student_id')
      .eq('stripe_subscription_id', subscriptionId)
      .single()

    if (existingSub) {
      parentId = parentId || existingSub.parent_id
      studentId = studentId || existingSub.student_id
    }
  }

  if (!parentId) {
    throw new Error(`Missing parent_id for invoice ${invoice.id}, subscription ${subscriptionId}`)
  }

  return { parentId, studentId: studentId || null }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = extractInvoiceSubscriptionId(invoice)

  if (!subscriptionId) {
    throw new Error(`No subscription ID found on invoice ${invoice.id}`)
  }

  const { parentId, studentId } = await resolveInvoiceMetadata(invoice, subscriptionId)

  // Get tier from line item's price (Clover-era: pricing.price_details.price)
  const priceId = invoice.lines?.data?.[0]?.pricing?.price_details?.price
  const { data: plan } = await supabaseAdmin
    .from('subscription_plans')
    .select('id')
    .eq('stripe_price_id', priceId)
    .single()

  if (!plan) {
    console.warn(`No plan found for price ${priceId}, tier will be null`)
  }

  // Record payment
  const { error } = await supabaseAdmin.from('payment_history').insert({
    parent_id: parentId,
    student_id: studentId,
    stripe_invoice_id: invoice.id,
    stripe_subscription_id: subscriptionId,
    amount_cents: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
    tier: plan?.id || null,
    description: invoice.lines?.data?.[0]?.description || 'Subscription payment',
    metadata: {
      invoice_number: invoice.number,
      billing_reason: invoice.billing_reason,
    },
  })

  if (error) {
    throw new Error(`Error recording payment for invoice ${invoice.id}: ${error.message}`)
  }

  console.log(`Payment recorded for invoice ${invoice.id}`)
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = extractInvoiceSubscriptionId(invoice)
  if (!subscriptionId) {
    throw new Error(`No subscription ID on failed payment invoice ${invoice.id}`)
  }

  const { parentId, studentId } = await resolveInvoiceMetadata(invoice, subscriptionId)

  // Record failed payment
  const { error } = await supabaseAdmin.from('payment_history').insert({
    parent_id: parentId,
    student_id: studentId,
    stripe_invoice_id: invoice.id,
    stripe_subscription_id: subscriptionId,
    amount_cents: invoice.amount_due,
    currency: invoice.currency,
    status: 'failed',
    description: 'Payment failed',
    metadata: {
      invoice_number: invoice.number,
      attempt_count: invoice.attempt_count,
    },
  })

  if (error) {
    throw new Error(`Error recording failed payment for invoice ${invoice.id}: ${error.message}`)
  }

  console.log(`Failed payment recorded for invoice ${invoice.id}`)
}
