import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/stores/auth'
import { useCelebrationQueue } from '@/composables/useCelebrationQueue'
import type { Database } from '@/types/database.types'

export type Badge = Database['public']['Tables']['badges']['Row']
export type StudentBadge = Database['public']['Tables']['student_badges']['Row']
export type BadgeTier = Database['public']['Enums']['badge_tier']

export interface BadgeProgress {
  badge_id: string
  current_value: number
  target_value: number
  progress_pct: number
}

export const TIER_ORDER: BadgeTier[] = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'master',
  'grandmaster',
]

export const tierConfig: Record<
  BadgeTier,
  {
    color: string
    bgColor: string
    borderColor: string
    textColor: string
    mutedBgColor: string
    mutedBorderColor: string
    hoverShadow: string
    glowBg: string
    gradientFrom: string
    gradientTo: string
    ringColor: string
  }
> = {
  bronze: {
    color: 'text-amber-700',
    bgColor: 'bg-amber-200 dark:bg-amber-900/40',
    borderColor: 'border-amber-600 dark:border-amber-600',
    textColor: 'text-amber-900 dark:text-amber-100',
    mutedBgColor: 'bg-amber-100 dark:bg-amber-950/30',
    mutedBorderColor: 'border-amber-400 dark:border-amber-900',
    hoverShadow: 'hover:shadow-amber-600/30',
    glowBg: 'bg-amber-500/40 dark:bg-amber-700/40',
    gradientFrom: 'from-amber-300/60 dark:from-amber-900/60',
    gradientTo: 'to-amber-100/30 dark:to-amber-950/30',
    ringColor: 'ring-amber-500/50 dark:ring-amber-700/50',
  },
  silver: {
    color: 'text-slate-500',
    bgColor: 'bg-slate-200 dark:bg-slate-700/50',
    borderColor: 'border-slate-400 dark:border-slate-500',
    textColor: 'text-slate-800 dark:text-slate-100',
    mutedBgColor: 'bg-slate-100 dark:bg-slate-800/40',
    mutedBorderColor: 'border-slate-300 dark:border-slate-700',
    hoverShadow: 'hover:shadow-slate-400/30',
    glowBg: 'bg-slate-400/40 dark:bg-slate-500/40',
    gradientFrom: 'from-slate-300/60 dark:from-slate-700/60',
    gradientTo: 'to-slate-50/30 dark:to-slate-900/30',
    ringColor: 'ring-slate-400/50 dark:ring-slate-500/50',
  },
  gold: {
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/40',
    borderColor: 'border-yellow-500 dark:border-yellow-600',
    textColor: 'text-yellow-900 dark:text-yellow-100',
    mutedBgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    mutedBorderColor: 'border-yellow-200 dark:border-yellow-900',
    hoverShadow: 'hover:shadow-yellow-500/30',
    glowBg: 'bg-yellow-400/40 dark:bg-yellow-600/40',
    gradientFrom: 'from-yellow-200/60 dark:from-yellow-900/60',
    gradientTo: 'to-yellow-50/30 dark:to-yellow-950/30',
    ringColor: 'ring-yellow-400/50 dark:ring-yellow-700/50',
  },
  platinum: {
    color: 'text-sky-500',
    bgColor: 'bg-sky-100 dark:bg-sky-900/40',
    borderColor: 'border-sky-400 dark:border-sky-700',
    textColor: 'text-sky-900 dark:text-sky-100',
    mutedBgColor: 'bg-sky-50 dark:bg-sky-950/30',
    mutedBorderColor: 'border-sky-200 dark:border-sky-900',
    hoverShadow: 'hover:shadow-sky-500/30',
    glowBg: 'bg-sky-400/40 dark:bg-sky-600/40',
    gradientFrom: 'from-sky-200/60 dark:from-sky-900/60',
    gradientTo: 'to-sky-50/30 dark:to-sky-950/30',
    ringColor: 'ring-sky-400/50 dark:ring-sky-700/50',
  },
  diamond: {
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/40',
    borderColor: 'border-cyan-400 dark:border-cyan-700',
    textColor: 'text-cyan-900 dark:text-cyan-100',
    mutedBgColor: 'bg-cyan-50 dark:bg-cyan-950/30',
    mutedBorderColor: 'border-cyan-200 dark:border-cyan-900',
    hoverShadow: 'hover:shadow-cyan-500/30',
    glowBg: 'bg-cyan-400/40 dark:bg-cyan-600/40',
    gradientFrom: 'from-cyan-200/60 dark:from-cyan-900/60',
    gradientTo: 'to-cyan-50/30 dark:to-cyan-950/30',
    ringColor: 'ring-cyan-400/50 dark:ring-cyan-700/50',
  },
  master: {
    color: 'text-purple-500',
    bgColor: 'bg-purple-100 dark:bg-purple-900/40',
    borderColor: 'border-purple-400 dark:border-purple-700',
    textColor: 'text-purple-900 dark:text-purple-100',
    mutedBgColor: 'bg-purple-50 dark:bg-purple-950/30',
    mutedBorderColor: 'border-purple-200 dark:border-purple-900',
    hoverShadow: 'hover:shadow-purple-500/30',
    glowBg: 'bg-purple-400/40 dark:bg-purple-600/40',
    gradientFrom: 'from-purple-200/60 dark:from-purple-900/60',
    gradientTo: 'to-purple-50/30 dark:to-purple-950/30',
    ringColor: 'ring-purple-400/50 dark:ring-purple-700/50',
  },
  grandmaster: {
    color: 'text-rose-500',
    bgColor: 'bg-rose-100 dark:bg-rose-900/40',
    borderColor: 'border-rose-400 dark:border-rose-700',
    textColor: 'text-rose-900 dark:text-rose-100',
    mutedBgColor: 'bg-rose-50 dark:bg-rose-950/30',
    mutedBorderColor: 'border-rose-200 dark:border-rose-900',
    hoverShadow: 'hover:shadow-rose-500/30',
    glowBg: 'bg-rose-400/40 dark:bg-rose-600/40',
    gradientFrom: 'from-rose-200/60 dark:from-rose-900/60',
    gradientTo: 'to-rose-50/30 dark:to-rose-950/30',
    ringColor: 'ring-rose-400/50 dark:ring-rose-700/50',
  },
}

export const useBadgesStore = defineStore('badges', () => {
  const catalog = shallowRef<Badge[]>([])
  const unlocked = ref<StudentBadge[]>([])
  const progress = ref<BadgeProgress[]>([])
  const featuredIds = ref<string[]>([])
  const isLoading = ref(false)
  const hasLoaded = ref(false)
  const error = ref<string | null>(null)

  const authStore = useAuthStore()
  const celebrationQueue = useCelebrationQueue()

  // Lookup: badge by id for fast access from student_badges rows
  const catalogById = computed(() => {
    const m = new Map<string, Badge>()
    for (const b of catalog.value) m.set(b.id, b)
    return m
  })

  // Unread indicator: count of unlocks with seen_at = null
  const unreadCount = computed(() => unlocked.value.filter((u) => u.seen_at === null).length)

  // Top 3 badges closest to unlock (excluding tier-gated)
  const closestUnlockable = computed<BadgeProgress[]>(() => {
    return [...progress.value]
      .filter((p) => p.progress_pct < 100)
      .sort((a, b) => b.progress_pct - a.progress_pct)
      .slice(0, 3)
  })

  // Featured badges hydrated from catalog — order-preserving.
  const featuredBadges = computed<Badge[]>(() => {
    return featuredIds.value
      .map((id) => catalogById.value.get(id))
      .filter((b): b is Badge => b !== undefined)
  })

  async function loadAll(): Promise<void> {
    if (!authStore.user) return
    isLoading.value = true
    error.value = null

    try {
      const [catalogRes, unlockedRes, progressRes, featuredRes] = await Promise.all([
        supabase
          .from('badges')
          .select('*')
          .eq('is_active', true)
          .order('tier')
          .order('display_order')
          .order('created_at'),
        supabase.from('student_badges').select('*').eq('student_id', authStore.user.id),
        supabase.rpc('get_student_badge_progress', {
          p_student_id: authStore.user.id,
        }),
        supabase
          .from('student_profiles')
          .select('featured_badges')
          .eq('id', authStore.user.id)
          .single(),
      ])

      if (catalogRes.error) throw catalogRes.error
      if (unlockedRes.error) throw unlockedRes.error
      if (progressRes.error) throw progressRes.error
      if (featuredRes.error) throw featuredRes.error

      catalog.value = catalogRes.data ?? []
      unlocked.value = unlockedRes.data ?? []
      progress.value = (progressRes.data ?? []) as BadgeProgress[]
      featuredIds.value = featuredRes.data?.featured_badges ?? []
      hasLoaded.value = true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'failed to load badges'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Mark a single unlocked badge as seen. Used when the student opens
   * the badge detail dialog — gives per-badge dismissal so the unread
   * count only drops as each new badge is reviewed.
   */
  async function markBadgeSeen(badgeId: string): Promise<void> {
    if (!authStore.user) return
    const record = unlocked.value.find((u) => u.badge_id === badgeId && u.seen_at === null)
    if (!record) return // already seen or not unlocked — no-op

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('student_badges')
      .update({ seen_at: now })
      .eq('student_id', authStore.user.id)
      .eq('badge_id', badgeId)
      .is('seen_at', null)

    if (!updateError) {
      record.seen_at = now
    }
  }

  async function markAllSeen(): Promise<void> {
    if (!authStore.user) return
    const unread = unlocked.value.filter((u) => u.seen_at === null)
    if (unread.length === 0) return

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('student_badges')
      .update({ seen_at: now })
      .eq('student_id', authStore.user.id)
      .is('seen_at', null)

    if (!updateError) {
      // Mirror into local state
      for (const u of unread) u.seen_at = now
    }
  }

  /**
   * Called by store integrations (practice, pets) after RPC responses.
   * Updates the unlocked list and pushes each badge into the celebration queue.
   */
  function handleNewlyUnlocked(badges: Badge[]): void {
    if (!badges || badges.length === 0) return
    if (!authStore.user) return

    const now = new Date().toISOString()
    // Collect any badges not already in the catalog cache, then reassign
    // catalog in one shot — shallowRef only tracks .value replacement, not
    // in-place mutations like .push().
    const unfamiliar = badges.filter((b) => !catalogById.value.has(b.id))
    if (unfamiliar.length > 0) {
      catalog.value = [...catalog.value, ...unfamiliar]
    }
    for (const b of badges) {
      // Insert into local unlocked list (unseen — dialog is the "seeing")
      unlocked.value.push({
        student_id: authStore.user.id,
        badge_id: b.id,
        unlocked_at: now,
        seen_at: null,
      })
    }

    celebrationQueue.enqueue(badges.map((badge) => ({ type: 'badgeUnlock' as const, badge })))
  }

  /** Persist the student's featured badge selection (up to 3). */
  async function setFeaturedBadges(ids: string[]): Promise<{ error: string | null }> {
    if (!authStore.user) return { error: 'not authenticated' }
    const { data, error: rpcError } = await supabase.rpc('set_featured_badges', {
      p_badges: ids,
    })
    if (rpcError) return { error: rpcError.message }
    featuredIds.value = (data as string[] | null) ?? []
    return { error: null }
  }

  async function refreshProgress(): Promise<void> {
    if (!authStore.user) return
    const { data, error: rpcError } = await supabase.rpc('get_student_badge_progress', {
      p_student_id: authStore.user.id,
    })
    if (!rpcError) {
      progress.value = (data ?? []) as BadgeProgress[]
    }
  }

  function $reset(): void {
    catalog.value = []
    unlocked.value = []
    progress.value = []
    featuredIds.value = []
    hasLoaded.value = false
    isLoading.value = false
    error.value = null
  }

  return {
    catalog,
    unlocked,
    progress,
    featuredIds,
    featuredBadges,
    isLoading,
    hasLoaded,
    error,
    catalogById,
    unreadCount,
    closestUnlockable,
    loadAll,
    markAllSeen,
    markBadgeSeen,
    handleNewlyUnlocked,
    setFeaturedBadges,
    refreshProgress,
    $reset,
  }
})
