import '@supabase/functions-js/edge-runtime.d.ts'
import { stripe, WEBHOOK_SECRET } from '../_shared/stripe.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import {
  syncSubscriptionToDatabase,
  syncSubscriptionDeletion,
  findRepresentativeLineItem,
  extractStripeId,
} from '../_shared/sync-helpers.ts'
import type Stripe from 'stripe'

/**
 * Stripe webhook handler — single entry point for all Stripe → Clavis data sync.
 *
 * ## Idempotency model
 *
 * Stripe delivers webhooks at-least-once. To prevent duplicate processing we
 * CLAIM the event before running its handler, rather than committing after:
 *
 * 1. We `insert` `event.id` into `processed_webhook_events` BEFORE dispatching.
 *    The table's PK on `event_id` makes this an atomic claim — if a concurrent
 *    delivery (or a prior delivery) already claimed it, the insert raises a
 *    unique violation (23505) and we skip without re-running the handler.
 *
 * 2. If the handler then throws, we RELEASE the claim (delete the row) so
 *    Stripe's retry re-runs the handler from scratch on the next delivery.
 *
 * 3. Claiming first (not committing after) closes the window where a handler
 *    succeeds but the commit insert fails/is killed: previously the event would
 *    never be recorded and Stripe's retry would re-run side effects. Now the
 *    only way an event re-runs is if we explicitly released it after a throw.
 *
 * 4. Domain handlers are additionally designed to be naturally idempotent via
 *    state-based upserts (keyed on `stripe_subscription_id` / `stripe_invoice_id`)
 *    and commutative metadata merges (refund/dispute keyed on `refund_charge_id`
 *    / `dispute_id`), so a release-then-retry is data-safe regardless of order.
 *
 * Per Stripe's official best practices (docs.stripe.com/webhooks/best-practices):
 * > "You can guard against duplicated event receipts by logging the event IDs
 * >  you've processed, and then not processing already-logged events."
 *
 * ## Operational replay procedure
 *
 * If you ever need to replay a past event to fix drifted data:
 *
 *   1. Find the event in Stripe Dashboard → Developers → Events
 *   2. Delete its log row:
 *        DELETE FROM processed_webhook_events WHERE event_id = 'evt_xxx';
 *   3. Click "Resend" on the event in Stripe Dashboard
 *
 * The handler will re-run with current code. Only do this when you understand
 * what the handler will do — state is overwritten, not merged.
 */

/**
 * Atomically claim an event for processing by inserting its ID. The PK on
 * `event_id` makes this the dedup gate: a successful insert means we own the
 * event; a 23505 unique violation means another delivery already claimed it
 * (concurrently or previously) and we must skip.
 *
 * Returns `true` if we claimed it (caller should run the handler), `false` if
 * it was already claimed (caller should skip).
 */
async function claimEvent(eventId: string, eventType: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('processed_webhook_events')
    .insert({ event_id: eventId, event_type: eventType })
  if (error) {
    if (error.code === '23505') {
      return false
    }
    console.error('Error claiming event:', error)
    throw error
  }
  return true
}

/**
 * Release a previously-claimed event after its handler threw, so Stripe's
 * retry can re-run the handler. Best-effort: a failed release just means the
 * event stays claimed and the retry is skipped (handler side effects were
 * partial), which is logged for manual replay.
 */
async function releaseEvent(eventId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('processed_webhook_events')
    .delete()
    .eq('event_id', eventId)
  if (error) {
    console.error(`Failed to release event ${eventId} after handler error:`, error)
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

    // Atomically claim the event BEFORE running its handler. A failed claim
    // (23505) means another delivery already processed/claimed it — skip.
    if (!(await claimEvent(event.id, event.type))) {
      console.log(`Event ${event.id} already processed, skipping`)
      return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Dispatch to domain handler. If it throws, release the claim so Stripe's
    // retry can re-run the (idempotent) handler from scratch.
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

        case 'charge.refunded':
          await handleChargeRefunded(event.data.object as Stripe.Charge)
          break

        case 'charge.dispute.created':
          await handleDisputeCreated(event.data.object as Stripe.Dispute)
          break

        case 'charge.dispute.closed':
          await handleDisputeClosed(event.data.object as Stripe.Dispute)
          break

        default:
          console.log(`Unhandled event type: ${event.type}`)
      }
    } catch (handlerError) {
      await releaseEvent(event.id)
      throw handlerError
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response('Webhook processing failed', { status: 500 })
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
  // Re-fetch with latest_invoice expanded — Clover API removed period fields from Subscription
  const fullSubscription = await stripe.subscriptions.retrieve(subscription.id, {
    expand: ['latest_invoice'],
  })
  const result = await syncSubscriptionToDatabase(fullSubscription, supabaseAdmin)
  if (!result.success) {
    throw new Error(`Sync failed: ${result.error}`)
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // Stale-replay safety: syncSubscriptionDeletion updates WHERE stripe_subscription_id = :id.
  // If the customer has since re-subscribed, the row holds a newer subscription ID and the
  // update is a no-op — the stale event can't clobber the new subscription. Don't refactor
  // this to update by student_id without adding an explicit monotonic guard.
  const result = await syncSubscriptionDeletion(subscription.id, supabaseAdmin)
  if (!result.success) {
    throw new Error(`Deletion sync failed: ${result.error}`)
  }
}

/**
 * Extract subscription ID from a Clover-era Invoice object.
 * In Clover API versions, `invoice.subscription` was moved to
 * `invoice.parent.subscription_details.subscription`.
 */
function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = extractStripeId(invoice.parent?.subscription_details?.subscription)
  if (fromParent) return fromParent

  const lineItem = invoice.lines?.data?.[0]
  const fromLineItem = extractStripeId(lineItem?.parent?.subscription_item_details?.subscription)
  if (fromLineItem) return fromLineItem

  return extractStripeId(lineItem?.subscription)
}

/**
 * Resolve the invoice ID a dispute relates to. Disputes carry only a charge
 * ID, so we have to fetch the charge from Stripe to pull its invoice ID.
 */
async function resolveDisputeInvoiceId(dispute: Stripe.Dispute): Promise<string | null> {
  const chargeId = extractStripeId(dispute.charge)
  if (!chargeId) return null
  const charge = await stripe.charges.retrieve(chargeId)
  return extractStripeId(charge.invoice)
}

/**
 * Read the existing metadata for a payment_history row, merge in new fields
 * under a stable, idempotent key, and write status + merged metadata back.
 *
 * Re-delivery safety: Stripe delivers at-least-once and may re-deliver
 * different events (refund, dispute opened, dispute closed) out of order. A
 * blind top-level spread merge is order-sensitive — a re-delivered older event
 * could clobber a newer one's keys. Instead each caller writes its payload
 * under a deterministic `mergeKey` (refund → `refund_charge_id`, dispute →
 * `dispute_id`), so re-applying the same event is a no-op overwrite of its own
 * sub-object and applying events in any order converges to the same metadata.
 *
 * `status` reflects the latest applied event; for the refund/dispute lifecycle
 * the terminal status is itself idempotent (a re-delivered "dispute created"
 * after "dispute closed" only re-writes the `disputes[id]` sub-object — handle
 * status ordering at the call site if needed).
 */
async function patchPaymentHistoryByInvoice(
  invoiceId: string,
  status: string,
  mergeBucket: string,
  mergeKey: string,
  payload: Record<string, unknown>,
  context: string,
): Promise<void> {
  const { data: existing, error: selectError } = await supabaseAdmin
    .from('payment_history')
    .select('id, metadata')
    .eq('stripe_invoice_id', invoiceId)
    .maybeSingle()

  if (selectError) {
    throw new Error(`Error looking up payment for ${context}: ${selectError.message}`)
  }
  if (!existing) {
    console.warn(`${context} for invoice ${invoiceId} — no matching payment_history row`)
    return
  }

  const previousMetadata = (existing.metadata ?? {}) as Record<string, unknown>
  const previousBucket = (previousMetadata[mergeBucket] ?? {}) as Record<string, unknown>

  // Merge this event's payload under its stable id key. Re-delivery overwrites
  // the SAME sub-object (commutative); distinct events land in distinct keys.
  const nextMetadata = {
    ...previousMetadata,
    [mergeBucket]: {
      ...previousBucket,
      [mergeKey]: payload,
    },
  }

  const { error } = await supabaseAdmin
    .from('payment_history')
    .update({
      status,
      metadata: nextMetadata,
    })
    .eq('id', existing.id)

  if (error) {
    throw new Error(`Error recording ${context} for invoice ${invoiceId}: ${error.message}`)
  }
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

  // Pick the line item representing the NEW plan's charge, not the proration
  // credit that appears first on upgrade invoices. See sync-helpers.ts for
  // the disambiguation rules.
  const representativeLine = findRepresentativeLineItem(invoice)
  const priceId = representativeLine?.pricing?.price_details?.price
  const { data: plan } = priceId
    ? await supabaseAdmin
        .from('subscription_plans')
        .select('id')
        .eq('stripe_price_id', priceId)
        .single()
    : { data: null }

  if (!plan) {
    console.warn(`No plan found for price ${priceId}, tier will be null`)
  }

  // Use Stripe's authoritative payment timestamp instead of DB-default now(),
  // so the displayed payment date matches the Stripe event (not webhook insert lag)
  const paidAtTs = invoice.status_transitions?.paid_at ?? invoice.created
  const paidAt = new Date(paidAtTs * 1000).toISOString()

  // Upsert (not insert) so Stripe retries and manual replays converge on the
  // same row. Also handles failed-then-paid transitions where the failed row
  // is rewritten to succeeded on the follow-up invoice.paid event.
  const { error } = await supabaseAdmin.from('payment_history').upsert(
    {
      parent_id: parentId,
      student_id: studentId,
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: subscriptionId,
      amount_cents: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
      tier: plan?.id || null,
      description: representativeLine?.description || 'Subscription payment',
      created_at: paidAt,
      metadata: {
        invoice_number: invoice.number,
        billing_reason: invoice.billing_reason,
      },
    },
    { onConflict: 'stripe_invoice_id' },
  )

  if (error) {
    throw new Error(`Error recording payment for invoice ${invoice.id}: ${error.message}`)
  }

  console.log(`Payment recorded for invoice ${invoice.id}`)
}

/**
 * Refund handler. Stripe fires `charge.refunded` for both full and partial
 * refunds — we encode the distinction in status so admins can tell them apart.
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const invoiceId = extractStripeId(charge.invoice)
  if (!invoiceId) {
    console.log(`Refunded charge ${charge.id} has no invoice — skipping`)
    return
  }

  const status = charge.amount_refunded >= charge.amount ? 'refunded' : 'partially_refunded'
  await patchPaymentHistoryByInvoice(
    invoiceId,
    status,
    'refunds',
    charge.id,
    { refunded_amount_cents: charge.amount_refunded, refund_charge_id: charge.id },
    'refund',
  )
  console.log(`Refund recorded for invoice ${invoiceId} (${status})`)
}

/**
 * Dispute opened. Stripe handles the fund hold and any subscription
 * cancellation via separate `customer.subscription.deleted` events — we
 * only flag the payment row.
 */
async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const invoiceId = await resolveDisputeInvoiceId(dispute)
  if (!invoiceId) {
    console.log(`Disputed charge ${extractStripeId(dispute.charge)} has no invoice — skipping`)
    return
  }

  await patchPaymentHistoryByInvoice(
    invoiceId,
    'disputed',
    'disputes',
    dispute.id,
    { dispute_id: dispute.id, dispute_reason: dispute.reason, dispute_status: dispute.status },
    'dispute',
  )
  console.log(`Dispute recorded for invoice ${invoiceId} (${dispute.reason})`)
}

/**
 * Dispute closed. Status depends on the outcome:
 *   - 'won'                     → back to succeeded (money was retained)
 *   - 'lost' / 'warning_closed' → dispute_lost (money permanently taken)
 *   - other terminal statuses   → leave as disputed (rare — manual review)
 */
async function handleDisputeClosed(dispute: Stripe.Dispute) {
  const nextStatus =
    dispute.status === 'won'
      ? 'succeeded'
      : dispute.status === 'lost' || dispute.status === 'warning_closed'
        ? 'dispute_lost'
        : null

  if (!nextStatus) {
    console.log(`Dispute ${dispute.id} closed with status ${dispute.status} — no-op`)
    return
  }

  const invoiceId = await resolveDisputeInvoiceId(dispute)
  if (!invoiceId) return

  // Merge into the same `disputes[dispute.id]` sub-object the created handler
  // wrote, keyed on dispute.id so re-delivery is commutative. Carry dispute_id
  // forward so the sub-object stays self-describing even if "closed" is
  // delivered/replayed before "created".
  await patchPaymentHistoryByInvoice(
    invoiceId,
    nextStatus,
    'disputes',
    dispute.id,
    { dispute_id: dispute.id, dispute_reason: dispute.reason, dispute_status: dispute.status },
    'dispute close',
  )
  console.log(`Dispute ${dispute.id} closed → ${nextStatus}`)
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = extractInvoiceSubscriptionId(invoice)
  if (!subscriptionId) {
    throw new Error(`No subscription ID on failed payment invoice ${invoice.id}`)
  }

  const { parentId, studentId } = await resolveInvoiceMetadata(invoice, subscriptionId)

  const failedAt = new Date(invoice.created * 1000).toISOString()

  const { error } = await supabaseAdmin.from('payment_history').upsert(
    {
      parent_id: parentId,
      student_id: studentId,
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: subscriptionId,
      amount_cents: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
      description: 'Payment failed',
      created_at: failedAt,
      metadata: {
        invoice_number: invoice.number,
        attempt_count: invoice.attempt_count,
      },
    },
    { onConflict: 'stripe_invoice_id' },
  )

  if (error) {
    throw new Error(`Error recording failed payment for invoice ${invoice.id}: ${error.message}`)
  }

  console.log(`Failed payment recorded for invoice ${invoice.id}`)
}
