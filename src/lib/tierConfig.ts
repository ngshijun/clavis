import type { Database } from '@/types/database.types'

export type SubscriptionTier = Database['public']['Enums']['subscription_tier']

export const tierConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  core: {
    label: 'Core',
    color: 'text-gray-700 dark:text-gray-300',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
  plus: {
    label: 'Plus',
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900/50',
  },
  pro: {
    label: 'Pro',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/50',
  },
  // Deprecated but kept for existing subscribers
  max: {
    label: 'Max',
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-100 dark:bg-purple-900/50',
  },
}

/**
 * Canonical tier ordering, lowest to highest.
 * `max` is deprecated but kept for existing subscribers; ranked above `pro`.
 */
export const tierOrder: readonly SubscriptionTier[] = ['core', 'plus', 'pro', 'max'] as const

/** Per-feature entitlements. Single source of truth for tier-gated capabilities. */
export interface TierFeatures {
  /** Detailed per-question session results (Plus and above). */
  canViewDetailedResults: boolean
  /** AI-generated session summary (Plus and above). */
  canViewAiSummary: boolean
}

export const TIER_FEATURES: Record<SubscriptionTier, TierFeatures> = {
  core: { canViewDetailedResults: false, canViewAiSummary: false },
  plus: { canViewDetailedResults: true, canViewAiSummary: true },
  pro: { canViewDetailedResults: true, canViewAiSummary: true },
  max: { canViewDetailedResults: true, canViewAiSummary: true },
}

/** Numeric rank of a tier within `tierOrder` (-1 if unknown). */
export function tierRank(tier: SubscriptionTier): number {
  return tierOrder.indexOf(tier)
}

/** Whether the given tier can view detailed per-question session results. */
export function canViewDetailedResults(tier: SubscriptionTier): boolean {
  return TIER_FEATURES[tier]?.canViewDetailedResults ?? false
}

/** Whether the given tier can view the AI-generated session summary. */
export function canViewAiSummary(tier: SubscriptionTier): boolean {
  return TIER_FEATURES[tier]?.canViewAiSummary ?? false
}
