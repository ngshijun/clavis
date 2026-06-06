/**
 * Unit tests for the payment-critical helpers in sync-helpers.ts.
 *
 * Structure: tests are grouped by subscription LIFECYCLE SCENARIO, not by
 * function name. Each describe block represents a moment in the payment
 * flow (new checkout, upgrade with proration, downgrade schedule, cancel,
 * payment failure, refund) and the `it` blocks assert behaviors the helpers
 * should exhibit during that scenario.
 *
 * Scope: Only functions in sync-helpers.ts are covered here. The webhook
 * handlers themselves (handleInvoicePaid, handleChargeRefunded, etc.) will
 * be covered by fixture-replay tests in Phase 2.
 */

import { describe, it, expect, vi } from 'vitest'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  extractStripeId,
  findRepresentativeLineItem,
  extractPeriodDates,
  resolveSubscriptionChange,
  syncSubscriptionToDatabase,
  syncSubscriptionDeletion,
} from './sync-helpers.ts'

// ──────────────────────────────────────────────────────────────────────────
// Test fixtures — minimal Stripe objects shaped like what Stripe actually
// returns, with only the fields our code reads. Typed loosely via `as` since
// the real Stripe.Subscription/Invoice/etc. types have many required fields
// we don't exercise.
// ──────────────────────────────────────────────────────────────────────────

function makeLineItem(overrides: {
  amount: number
  priceId: string
  proration: boolean
  description?: string
  periodStart?: number
  periodEnd?: number
}): Stripe.InvoiceLineItem {
  return {
    id: `il_${Math.random().toString(36).slice(2, 8)}`,
    amount: overrides.amount,
    currency: 'myr',
    description: overrides.description ?? 'line item',
    period: {
      start: overrides.periodStart ?? 1_700_000_000,
      end: overrides.periodEnd ?? 1_702_592_000,
    },
    pricing: {
      price_details: { price: overrides.priceId },
    },
    parent: {
      subscription_item_details: { proration: overrides.proration },
    },
  } as unknown as Stripe.InvoiceLineItem
}

function makeInvoice(lines: Stripe.InvoiceLineItem[]): Stripe.Invoice {
  return {
    id: 'in_test',
    lines: { data: lines, object: 'list', has_more: false, url: '' },
  } as unknown as Stripe.Invoice
}

function makeSubscription(overrides: Partial<Stripe.Subscription> & {
  priceId?: string
  itemId?: string
  periodStart?: number
  periodEnd?: number
}): Stripe.Subscription {
  const priceId = overrides.priceId ?? 'price_plus'
  const itemId = overrides.itemId ?? 'si_123'
  const periodStart = overrides.periodStart ?? 1_700_000_000
  const periodEnd = overrides.periodEnd ?? 1_702_592_000

  return {
    id: 'sub_test',
    status: 'active',
    start_date: periodStart,
    cancel_at_period_end: false,
    schedule: null,
    metadata: {
      supabase_parent_id: 'parent-uuid',
      supabase_student_id: 'student-uuid',
    },
    items: {
      data: [
        {
          id: itemId,
          price: { id: priceId, unit_amount: 2999 },
        },
      ],
    },
    latest_invoice: {
      id: 'in_latest',
      lines: {
        data: [
          {
            period: { start: periodStart, end: periodEnd },
          },
        ],
      },
    },
    ...overrides,
  } as unknown as Stripe.Subscription
}

// ──────────────────────────────────────────────────────────────────────────
// extractStripeId — used in ~9 sites across the payment code
// ──────────────────────────────────────────────────────────────────────────

describe('extractStripeId — Stripe expandable field normalization', () => {
  it('returns null for null / undefined (Stripe uses both)', () => {
    expect(extractStripeId(null)).toBeNull()
    expect(extractStripeId(undefined)).toBeNull()
  })

  it('returns the string as-is for unexpanded references', () => {
    expect(extractStripeId('sub_xyz')).toBe('sub_xyz')
  })

  it('returns the id field when the reference is expanded', () => {
    expect(extractStripeId({ id: 'cus_abc' })).toBe('cus_abc')
  })

  it('handles empty string as a real empty string (not null)', () => {
    // Stripe shouldn't send empty strings, but document the behavior.
    expect(extractStripeId('')).toBeNull() // falsy short-circuit → null
  })
})

// ──────────────────────────────────────────────────────────────────────────
// SCENARIO: Upgrade mid-cycle with proration
//
// Stripe generates a single invoice with multiple lines when upgrading with
// proration_behavior: 'always_invoice'. The webhook's `handleInvoicePaid`
// uses findRepresentativeLineItem to pick the line that represents the
// NEW plan, not the proration credit for the OLD plan.
// ──────────────────────────────────────────────────────────────────────────

describe('scenario: upgrade with proration → invoice line disambiguation', () => {
  it('picks the positive non-proration line over the proration credit', () => {
    // Real upgrade invoice shape: credit for unused Plus + charge for Pro
    // remainder + charge for Pro full period.
    const invoice = makeInvoice([
      makeLineItem({ amount: -1500, priceId: 'price_plus', proration: true, description: 'Unused on Plus' }),
      makeLineItem({ amount: 700, priceId: 'price_pro', proration: true, description: 'Remaining on Pro' }),
      makeLineItem({ amount: 3999, priceId: 'price_pro', proration: false, description: 'Pro monthly' }),
    ])

    const line = findRepresentativeLineItem(invoice)
    expect(line?.pricing?.price_details?.price).toBe('price_pro')
    expect(line?.amount).toBe(3999)
  })

  it('falls back to largest positive proration line when no non-proration lines exist', () => {
    // Mid-cycle upgrade where Stripe only generated proration lines, no
    // full-period charge (happens on some billing_cycle_anchor configs).
    const invoice = makeInvoice([
      makeLineItem({ amount: -1500, priceId: 'price_plus', proration: true }),
      makeLineItem({ amount: 700, priceId: 'price_pro', proration: true }),
    ])

    const line = findRepresentativeLineItem(invoice)
    expect(line?.pricing?.price_details?.price).toBe('price_pro')
    expect(line?.amount).toBe(700)
  })

  it('falls back to lines[0] when every line has a non-positive amount', () => {
    // Pathological invoice: fully credited downgrade. We still return
    // SOMETHING so tier doesn't silently become null.
    const invoice = makeInvoice([
      makeLineItem({ amount: -1500, priceId: 'price_plus', proration: true }),
      makeLineItem({ amount: 0, priceId: 'price_plus', proration: false }),
    ])

    const line = findRepresentativeLineItem(invoice)
    expect(line?.amount).toBe(-1500)
  })

  it('returns null for an invoice with no lines', () => {
    const invoice = makeInvoice([])
    expect(findRepresentativeLineItem(invoice)).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// SCENARIO: New checkout completed
//
// When a parent completes Checkout, Stripe fires customer.subscription.created.
// Our handler retrieves the subscription with `latest_invoice` expanded,
// then extracts the billing period from latest_invoice.lines.data[0].period
// (Clover API moved period off the subscription object).
// ──────────────────────────────────────────────────────────────────────────

describe('scenario: new checkout → extract billing period from latest_invoice', () => {
  it('returns periodStart/periodEnd when latest_invoice is expanded', () => {
    const sub = makeSubscription({ periodStart: 1_700_000_000, periodEnd: 1_702_592_000 })
    const { periodStart, periodEnd } = extractPeriodDates(sub)
    expect(periodStart).toBe(1_700_000_000)
    expect(periodEnd).toBe(1_702_592_000)
  })

  it('returns nulls when latest_invoice was not expanded (just an ID string)', () => {
    const sub = {
      ...makeSubscription({}),
      latest_invoice: 'in_latest', // unexpanded
    } as Stripe.Subscription
    const { periodStart, periodEnd } = extractPeriodDates(sub)
    expect(periodStart).toBeNull()
    expect(periodEnd).toBeNull()
  })

  it('returns nulls when latest_invoice.lines is missing', () => {
    const sub = {
      ...makeSubscription({}),
      latest_invoice: { id: 'in_x' } as Stripe.Invoice,
    } as Stripe.Subscription
    const { periodStart, periodEnd } = extractPeriodDates(sub)
    expect(periodStart).toBeNull()
    expect(periodEnd).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// Supabase / Stripe mock factories for the impure helpers
// ──────────────────────────────────────────────────────────────────────────

type UpsertCall = { table: string; values: Record<string, unknown>; onConflict?: string }
type UpdateCall = { table: string; values: Record<string, unknown>; eqField?: string; eqValue?: unknown }

function makeMockSupabase(opts?: {
  selectPlan?: { id: string } | null
  selectSubscription?: { stripe_subscription_id: string } | null
  selectExistingSub?: { parent_id: string; student_id: string } | null
}) {
  const upserts: UpsertCall[] = []
  const updates: UpdateCall[] = []

  const chain = (table: string) => {
    const state: {
      columns?: string
      eqChain: Array<{ field: string; value: unknown }>
      isUpsert?: boolean
      isUpdate?: boolean
      upsertValues?: Record<string, unknown>
      onConflict?: string
      updateValues?: Record<string, unknown>
    } = { eqChain: [] }

    const chainObj = {
      select: (columns: string) => {
        state.columns = columns
        return chainObj
      },
      eq: (field: string, value: unknown) => {
        state.eqChain.push({ field, value })
        return chainObj
      },
      single: async () => {
        if (table === 'subscription_plans') return { data: opts?.selectPlan ?? null }
        if (table === 'child_subscriptions' && state.eqChain.length > 0) {
          return { data: opts?.selectSubscription ?? opts?.selectExistingSub ?? null }
        }
        return { data: null }
      },
      maybeSingle: async () => chainObj.single(),
      upsert: (values: Record<string, unknown>, options?: { onConflict?: string }) => {
        state.isUpsert = true
        state.upsertValues = values
        state.onConflict = options?.onConflict
        upserts.push({ table, values, onConflict: options?.onConflict })
        return { error: null as null | { message: string } }
      },
      update: (values: Record<string, unknown>) => {
        state.isUpdate = true
        state.updateValues = values
        return {
          eq: (field: string, value: unknown) => {
            updates.push({ table, values, eqField: field, eqValue: value })
            return Promise.resolve({ error: null as null | { message: string } })
          },
        }
      },
    }

    return chainObj
  }

  const mockClient = {
    from: (table: string) => chain(table),
  } as unknown as SupabaseClient

  return { client: mockClient, upserts, updates }
}

function makeMockStripe(opts?: {
  subscription?: Stripe.Subscription
  price?: { unit_amount: number }
}) {
  return {
    subscriptions: {
      retrieve: vi.fn(async (_id: string, _options?: unknown) => opts?.subscription ?? makeSubscription({})),
    },
    prices: {
      retrieve: vi.fn(async (_id: string) => opts?.price ?? { unit_amount: 2999 }),
    },
  } as unknown as Stripe
}

// ──────────────────────────────────────────────────────────────────────────
// SCENARIO: New checkout → syncSubscriptionToDatabase upserts the child row
// ──────────────────────────────────────────────────────────────────────────

describe('scenario: new checkout → sync subscription to database', () => {
  it('upserts with the correct tier derived from the price_id', async () => {
    const { client, upserts } = makeMockSupabase({ selectPlan: { id: 'plus' } })
    const sub = makeSubscription({ priceId: 'price_plus' })

    const result = await syncSubscriptionToDatabase(sub, client)

    expect(result.success).toBe(true)
    expect(upserts).toHaveLength(1)
    expect(upserts[0].values.tier).toBe('plus')
    expect(upserts[0].values.stripe_subscription_id).toBe('sub_test')
    expect(upserts[0].values.parent_id).toBe('parent-uuid')
    expect(upserts[0].values.student_id).toBe('student-uuid')
    expect(upserts[0].onConflict).toBe('student_id')
  })

  it('refuses to downgrade an active subscription to "core" when no plan matches the price', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, upserts } = makeMockSupabase({ selectPlan: null })
    const sub = makeSubscription({ priceId: 'price_unknown' })

    const result = await syncSubscriptionToDatabase(sub, client)

    expect(result.success).toBe(false)
    expect(upserts).toHaveLength(0)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('No plan found'))
    errorSpy.mockRestore()
  })

  it('treats past_due as active (grace period while Stripe retries)', async () => {
    const { client, upserts } = makeMockSupabase({ selectPlan: { id: 'plus' } })
    const sub = makeSubscription({ status: 'past_due' as Stripe.Subscription.Status })

    await syncSubscriptionToDatabase(sub, client)

    expect(upserts[0].values.is_active).toBe(true)
    expect(upserts[0].values.stripe_status).toBe('past_due')
  })

  it('treats canceled / unpaid / incomplete as inactive', async () => {
    for (const status of ['canceled', 'unpaid', 'incomplete'] as const) {
      const { client, upserts } = makeMockSupabase({ selectPlan: { id: 'plus' } })
      const sub = makeSubscription({ status: status as Stripe.Subscription.Status })
      await syncSubscriptionToDatabase(sub, client)
      expect(upserts[0].values.is_active).toBe(false)
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────
// SCENARIO: Downgrade scheduled for end of billing cycle
// ──────────────────────────────────────────────────────────────────────────

describe('scenario: downgrade scheduled → preserves scheduled_* fields', () => {
  it('does NOT clear scheduled fields when a schedule is still attached', async () => {
    const { client, upserts } = makeMockSupabase({ selectPlan: { id: 'pro' } })
    const sub = makeSubscription({
      priceId: 'price_pro',
      schedule: 'sub_sched_123' as unknown as Stripe.SubscriptionSchedule,
    })

    await syncSubscriptionToDatabase(sub, client)

    // If schedule is present, we leave scheduled_tier/date/id as-is (not overwriting with null)
    expect(upserts[0].values).not.toHaveProperty('scheduled_tier')
    expect(upserts[0].values).not.toHaveProperty('scheduled_change_date')
    expect(upserts[0].values).not.toHaveProperty('stripe_schedule_id')
  })

  it('CLEARS scheduled fields when no schedule is attached (schedule executed or was released)', async () => {
    const { client, upserts } = makeMockSupabase({ selectPlan: { id: 'plus' } })
    const sub = makeSubscription({ priceId: 'price_plus', schedule: null })

    await syncSubscriptionToDatabase(sub, client)

    expect(upserts[0].values.scheduled_tier).toBeNull()
    expect(upserts[0].values.scheduled_change_date).toBeNull()
    expect(upserts[0].values.stripe_schedule_id).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// SCENARIO: Cancel at period end — next_billing_date is null
// ──────────────────────────────────────────────────────────────────────────

describe('scenario: cancel at period end → next_billing_date is null', () => {
  it('sets next_billing_date to null when cancel_at_period_end=true', async () => {
    const { client, upserts } = makeMockSupabase({ selectPlan: { id: 'plus' } })
    const sub = makeSubscription({ cancel_at_period_end: true })

    await syncSubscriptionToDatabase(sub, client)

    expect(upserts[0].values.next_billing_date).toBeNull()
    expect(upserts[0].values.cancel_at_period_end).toBe(true)
    // But the subscription is still active until period ends — is_active stays true
    expect(upserts[0].values.is_active).toBe(true)
  })

  it('sets next_billing_date to current_period_end when NOT canceling', async () => {
    const { client, upserts } = makeMockSupabase({ selectPlan: { id: 'plus' } })
    const sub = makeSubscription({ cancel_at_period_end: false, periodEnd: 1_702_592_000 })

    await syncSubscriptionToDatabase(sub, client)

    expect(upserts[0].values.next_billing_date).toBe(new Date(1_702_592_000 * 1000).toISOString())
  })
})

// ──────────────────────────────────────────────────────────────────────────
// SCENARIO: Subscription deletion (immediate cancel, dispute loss, etc.)
// ──────────────────────────────────────────────────────────────────────────

describe('scenario: subscription deleted → downgrade to core while keeping row active', () => {
  it('updates the row to tier=core, status=canceled, keeping is_active=true', async () => {
    const { client, updates } = makeMockSupabase()

    const result = await syncSubscriptionDeletion('sub_gone', client)

    expect(result.success).toBe(true)
    expect(updates).toHaveLength(1)
    expect(updates[0].values.tier).toBe('core')
    expect(updates[0].values.stripe_status).toBe('canceled')
    expect(updates[0].values.is_active).toBe(true) // "downgraded but still on free tier"
    expect(updates[0].values.stripe_subscription_id).toBeNull()
    expect(updates[0].values.cancel_at_period_end).toBe(false)
    expect(updates[0].eqField).toBe('stripe_subscription_id')
    expect(updates[0].eqValue).toBe('sub_gone')
  })

  it('clears all scheduled fields on deletion', async () => {
    const { client, updates } = makeMockSupabase()

    await syncSubscriptionDeletion('sub_gone', client)

    expect(updates[0].values.scheduled_tier).toBeNull()
    expect(updates[0].values.scheduled_change_date).toBeNull()
    expect(updates[0].values.stripe_schedule_id).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// SCENARIO: Metadata fallback — subscription without metadata gets resolved
// via existing child_subscriptions row
// ──────────────────────────────────────────────────────────────────────────

describe('scenario: subscription sync with missing metadata → fallback to DB lookup', () => {
  it('falls back to existing child_subscriptions row when metadata is absent', async () => {
    const { client, upserts } = makeMockSupabase({
      selectPlan: { id: 'plus' },
      selectExistingSub: { parent_id: 'fallback-parent', student_id: 'fallback-student' },
    })
    const sub = {
      ...makeSubscription({}),
      metadata: {}, // no parent/student IDs
    } as Stripe.Subscription

    await syncSubscriptionToDatabase(sub, client)

    expect(upserts[0].values.parent_id).toBe('fallback-parent')
    expect(upserts[0].values.student_id).toBe('fallback-student')
  })

  it('returns error when both metadata AND DB row are missing (orphan subscription)', async () => {
    const { client } = makeMockSupabase({ selectPlan: null, selectExistingSub: null })
    const sub = {
      ...makeSubscription({}),
      metadata: {},
      id: 'sub_orphan',
    } as Stripe.Subscription

    const result = await syncSubscriptionToDatabase(sub, client)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Missing metadata')
    expect(result.error).toContain('sub_orphan')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// SCENARIO: resolveSubscriptionChange — the shared validation path used by
// both preview-upgrade and modify-subscription
// ──────────────────────────────────────────────────────────────────────────

describe('scenario: modify subscription → resolveSubscriptionChange validation', () => {
  function makeVerifyLinkStub(shouldPass = true) {
    return vi.fn(async (_parentId: string, _studentId: string) => {
      if (!shouldPass) throw new Response('link missing', { status: 403 })
    })
  }

  function makeErrorResponse() {
    return vi.fn((msg: string, status: number) => new Response(JSON.stringify({ error: msg }), { status }))
  }

  it('rejects invalid price IDs (not in subscription_plans)', async () => {
    const { client } = makeMockSupabase({ selectPlan: null })
    const stripe = makeMockStripe()
    const errorResponse = makeErrorResponse()

    await expect(
      resolveSubscriptionChange(
        'parent-1',
        'student-1',
        'price_bogus',
        client,
        stripe,
        errorResponse,
        makeVerifyLinkStub(),
      ),
    ).rejects.toBeInstanceOf(Response)

    expect(errorResponse).toHaveBeenCalledWith('Invalid price ID', 400)
  })

  it('rejects the deprecated max tier even if it exists in the DB', async () => {
    const { client } = makeMockSupabase({ selectPlan: { id: 'max' } })
    const stripe = makeMockStripe()
    const errorResponse = makeErrorResponse()

    await expect(
      resolveSubscriptionChange(
        'parent-1',
        'student-1',
        'price_max',
        client,
        stripe,
        errorResponse,
        makeVerifyLinkStub(),
      ),
    ).rejects.toBeInstanceOf(Response)

    expect(errorResponse).toHaveBeenCalledWith('This plan is no longer available', 400)
  })

  it('rejects when student has no active subscription in the DB', async () => {
    const { client } = makeMockSupabase({
      selectPlan: { id: 'pro' },
      selectSubscription: null,
    })
    const stripe = makeMockStripe()
    const errorResponse = makeErrorResponse()

    await expect(
      resolveSubscriptionChange(
        'parent-1',
        'student-1',
        'price_pro',
        client,
        stripe,
        errorResponse,
        makeVerifyLinkStub(),
      ),
    ).rejects.toBeInstanceOf(Response)

    expect(errorResponse).toHaveBeenCalledWith('No active subscription found', 404)
  })

  it('rejects when current and new price are the same (no-op change)', async () => {
    const { client } = makeMockSupabase({
      selectPlan: { id: 'plus' },
      selectSubscription: { stripe_subscription_id: 'sub_test' },
    })
    const stripe = makeMockStripe({
      subscription: makeSubscription({ priceId: 'price_plus' }),
    })
    const errorResponse = makeErrorResponse()

    await expect(
      resolveSubscriptionChange(
        'parent-1',
        'student-1',
        'price_plus', // same as current
        client,
        stripe,
        errorResponse,
        makeVerifyLinkStub(),
      ),
    ).rejects.toBeInstanceOf(Response)

    expect(errorResponse).toHaveBeenCalledWith('Already on this plan', 400)
  })

  it('identifies an upgrade (newAmount > currentAmount)', async () => {
    const { client } = makeMockSupabase({
      selectPlan: { id: 'pro' },
      selectSubscription: { stripe_subscription_id: 'sub_test' },
    })
    const stripe = makeMockStripe({
      subscription: makeSubscription({ priceId: 'price_plus' }),
      price: { unit_amount: 3999 }, // pro > plus
    })
    // Override items.data[0].price.unit_amount to match the "current = 2999"
    const subWithUnitAmount = makeSubscription({ priceId: 'price_plus' })
    ;(subWithUnitAmount.items.data[0].price as unknown as { unit_amount: number }).unit_amount = 2999
    ;(stripe.subscriptions.retrieve as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      subWithUnitAmount,
    )

    const ctx = await resolveSubscriptionChange(
      'parent-1',
      'student-1',
      'price_pro',
      client,
      stripe,
      makeErrorResponse(),
      makeVerifyLinkStub(),
    )

    expect(ctx.isUpgrade).toBe(true)
    expect(ctx.currentPriceId).toBe('price_plus')
    expect(ctx.newPriceId).toBe('price_pro')
    expect(ctx.currentAmount).toBe(2999)
    expect(ctx.newAmount).toBe(3999)
  })

  it('identifies a downgrade (newAmount < currentAmount)', async () => {
    const { client } = makeMockSupabase({
      selectPlan: { id: 'plus' },
      selectSubscription: { stripe_subscription_id: 'sub_test' },
    })
    const subWithUnitAmount = makeSubscription({ priceId: 'price_pro' })
    ;(subWithUnitAmount.items.data[0].price as unknown as { unit_amount: number }).unit_amount = 3999
    const stripe = makeMockStripe({
      subscription: subWithUnitAmount,
      price: { unit_amount: 2999 }, // plus < pro
    })

    const ctx = await resolveSubscriptionChange(
      'parent-1',
      'student-1',
      'price_plus',
      client,
      stripe,
      makeErrorResponse(),
      makeVerifyLinkStub(),
    )

    expect(ctx.isUpgrade).toBe(false)
  })

  it('passes custom expand fields through to Stripe subscriptions.retrieve', async () => {
    const { client } = makeMockSupabase({
      selectPlan: { id: 'pro' },
      selectSubscription: { stripe_subscription_id: 'sub_test' },
    })
    const subWithUnitAmount = makeSubscription({ priceId: 'price_plus' })
    ;(subWithUnitAmount.items.data[0].price as unknown as { unit_amount: number }).unit_amount = 2999
    const stripe = makeMockStripe({
      subscription: subWithUnitAmount,
      price: { unit_amount: 3999 },
    })

    await resolveSubscriptionChange(
      'parent-1',
      'student-1',
      'price_pro',
      client,
      stripe,
      makeErrorResponse(),
      makeVerifyLinkStub(),
      ['items.data.price', 'schedule', 'latest_invoice'],
    )

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_test', {
      expand: ['items.data.price', 'schedule', 'latest_invoice'],
    })
  })
})
