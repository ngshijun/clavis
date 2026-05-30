<script setup lang="ts">
import { computed } from 'vue'
import { useT } from '@/composables/useT'
import { useAuthStore } from '@/stores/auth'
import { tierConfig, type Badge, type BadgeProgress } from '@/stores/badges'
import { getBadgeIconUrl } from '@/lib/storage'
import { Lock } from 'lucide-vue-next'
import type { Database } from '@/types/database.types'

type SubscriptionTier = Database['public']['Enums']['subscription_tier']

type BadgeCardState = 'unlocked' | 'tier-gated' | 'locked-progress' | 'locked'

const props = defineProps<{
  badge: Badge
  unlocked: boolean
  unlockedAt?: string | null
  seenAt?: string | null
  progress?: BadgeProgress | null
}>()

defineEmits<{
  select: [badge: Badge]
}>()

const t = useT()
const authStore = useAuthStore()

const SUB_TIER_ORDER: Record<SubscriptionTier, number> = {
  core: 0,
  plus: 1,
  pro: 2,
  max: 3,
}

const studentSubscriptionTier = computed<SubscriptionTier>(
  () => authStore.user?.studentProfile?.subscriptionTier ?? 'core',
)

const isTierGatedLocked = computed(
  () =>
    !props.unlocked &&
    SUB_TIER_ORDER[studentSubscriptionTier.value] < SUB_TIER_ORDER[props.badge.required_tier],
)

const state = computed<BadgeCardState>(() => {
  if (props.unlocked) return 'unlocked'
  if (isTierGatedLocked.value) return 'tier-gated'
  if (props.progress) return 'locked-progress'
  return 'locked'
})

// True when the badge is unlocked but the student hasn't acknowledged it yet
// (no seen_at timestamp). Cleared when they open the detail dialog.
const isNew = computed(() => props.unlocked && !props.seenAt)

const cfg = computed(() => tierConfig[props.badge.tier])

const requiredTierLabel = computed(() => {
  switch (props.badge.required_tier) {
    case 'plus':
      return t.value.student.achievements.requiresPlus
    case 'pro':
      return t.value.student.achievements.requiresPro
    case 'max':
      return t.value.student.achievements.requiresMax
    default:
      return ''
  }
})

const badgeStrings = computed(() => {
  const slug = props.badge.slug
  const badges = t.value.student.badges as Record<
    string,
    { name: string; description: string } | undefined
  >
  return badges[slug] ?? { name: slug, description: '' }
})
</script>

<template>
  <button
    type="button"
    class="group flex cursor-pointer flex-col items-center gap-1.5 transition-transform duration-300 hover:-translate-y-0.5"
    :aria-label="badgeStrings.name"
    @click="$emit('select', badge)"
  >
    <!-- Circle (wrapper carries the NEW ribbon so it isn't clipped) -->
    <div class="relative">
      <div
        :class="[
          'relative size-32 overflow-hidden rounded-full border-2 transition-shadow',
          state === 'unlocked'
            ? [cfg.bgColor, cfg.borderColor, 'group-hover:shadow-lg', cfg.hoverShadow]
            : 'border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-muted',
        ]"
      >
        <img
          :src="getBadgeIconUrl(badge.icon_path)"
          :alt="badgeStrings.name"
          loading="lazy"
          class="size-full select-none object-cover text-transparent"
          :class="{ 'opacity-50 grayscale': state !== 'unlocked' }"
        />

        <!-- Tier-gated overlay -->
        <div
          v-if="state === 'tier-gated'"
          class="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-background/85"
        >
          <Lock class="size-5 text-muted-foreground" />
          <p class="text-[10px] font-medium leading-tight">{{ requiredTierLabel }}</p>
        </div>
      </div>

      <!-- NEW ribbon — unlocked but not yet acknowledged -->
      <span
        v-if="isNew"
        class="absolute -right-1 -top-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow"
      >
        {{ t.student.achievements.newBadge }}
      </span>
    </div>

    <!-- Name -->
    <p
      class="line-clamp-2 w-full text-center text-sm font-medium leading-tight"
      :class="state === 'unlocked' ? cfg.textColor : 'text-gray-400 dark:text-gray-600'"
    >
      {{ badgeStrings.name }}
    </p>

    <!-- Progress bar (locked-progress state) -->
    <div v-if="state === 'locked-progress' && progress" class="w-full px-2">
      <div class="h-1 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full bg-primary transition-all"
          :style="{ width: `${progress.progress_pct}%` }"
        />
      </div>
    </div>
  </button>
</template>
