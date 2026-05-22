<script setup lang="ts">
import { computed } from 'vue'
import { useT } from '@/composables/useT'
import { useAuthStore } from '@/stores/auth'
import { useBadgesStore, tierConfig, type Badge } from '@/stores/badges'
import { getBadgeIconUrl } from '@/lib/storage'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge as UiBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CirclePoundSterling, Lock, Check, Hourglass, CircleDashed } from 'lucide-vue-next'
import { formatDate } from '@/lib/date'
import type { Database } from '@/types/database.types'

type SubscriptionTier = Database['public']['Enums']['subscription_tier']

const props = defineProps<{
  open: boolean
  badge: Badge | null
}>()

defineEmits<{
  'update:open': [value: boolean]
}>()

const t = useT()
const authStore = useAuthStore()
const badgesStore = useBadgesStore()

const SUB_TIER_ORDER: Record<SubscriptionTier, number> = {
  core: 0,
  plus: 1,
  pro: 2,
  max: 3,
}

const studentSubscriptionTier = computed<SubscriptionTier>(
  () => authStore.user?.studentProfile?.subscriptionTier ?? 'core',
)

const unlockedRecord = computed(() => {
  if (!props.badge) return null
  return badgesStore.unlocked.find((u) => u.badge_id === props.badge!.id) ?? null
})

const progressRecord = computed(() => {
  if (!props.badge) return null
  return badgesStore.progress.find((p) => p.badge_id === props.badge!.id) ?? null
})

const isUnlocked = computed(() => unlockedRecord.value !== null)

const isTierGated = computed(() => {
  if (!props.badge || isUnlocked.value) return false
  return SUB_TIER_ORDER[studentSubscriptionTier.value] < SUB_TIER_ORDER[props.badge.required_tier]
})

const cfg = computed(() => (props.badge ? tierConfig[props.badge.tier] : null))

const badgeStrings = computed(() => {
  if (!props.badge) return { name: '', description: '' }
  const badges = t.value.student.badges as Record<
    string,
    { name: string; description: string } | undefined
  >
  return badges[props.badge.slug] ?? { name: props.badge.slug, description: '' }
})

const tierLabel = computed(() => {
  if (!props.badge) return ''
  return t.value.student.achievements.tierSections[props.badge.tier]
})

const requiredTierLabel = computed(() => {
  if (!props.badge) return ''
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

const statusLabel = computed(() => {
  if (isUnlocked.value) return t.value.student.badgeDetailDialog.statusUnlocked
  if (isTierGated.value) return requiredTierLabel.value
  if (progressRecord.value) return t.value.student.badgeDetailDialog.statusInProgress
  return t.value.student.badgeDetailDialog.statusLocked
})

const statusIcon = computed(() => {
  if (isUnlocked.value) return Check
  if (isTierGated.value) return Lock
  if (progressRecord.value) return Hourglass
  return CircleDashed
})
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => $emit('update:open', v)">
    <DialogContent class="overflow-hidden p-0 sm:max-w-md">
      <template v-if="props.badge && cfg">
        <!-- Hero zone: tier-tinted backdrop with dramatic badge reveal -->
        <div class="relative overflow-hidden border-b" :class="[cfg.borderColor]">
          <!-- Layered gradient backdrop -->
          <div
            class="absolute inset-0 bg-gradient-to-b opacity-80"
            :class="[cfg.gradientFrom, cfg.gradientTo]"
          />
          <!-- Radial highlight at center-top (only when unlocked) -->
          <div
            v-if="isUnlocked"
            class="absolute left-1/2 top-0 size-56 -translate-x-1/2 -translate-y-20 rounded-full blur-3xl"
            :class="cfg.glowBg"
          />

          <div class="relative flex flex-col items-center gap-4 px-6 pb-6 pt-10">
            <!-- Status pill -->
            <div
              class="inline-flex items-center gap-1.5 rounded-full border bg-background/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider shadow-sm backdrop-blur"
              :class="[cfg.borderColor, cfg.color]"
            >
              <component :is="statusIcon" class="size-3.5" />
              <span>{{ statusLabel }}</span>
            </div>

            <!-- Large badge icon (circular) — subtle pulsing glow when unlocked -->
            <div class="relative size-40">
              <div
                v-if="isUnlocked"
                class="absolute inset-0 animate-pulse rounded-full blur-2xl"
                :class="cfg.glowBg"
              />
              <div
                class="relative size-full overflow-hidden rounded-full border-2 drop-shadow-xl"
                :class="[cfg.borderColor, cfg.bgColor]"
              >
                <img
                  :src="getBadgeIconUrl(props.badge.icon_path)"
                  :alt="badgeStrings.name"
                  class="size-full select-none object-cover text-transparent"
                  :class="{ 'opacity-50 grayscale': !isUnlocked }"
                />
              </div>
              <div v-if="isTierGated" class="absolute inset-0 flex items-center justify-center">
                <div class="rounded-full bg-background/80 p-3 backdrop-blur-sm">
                  <Lock class="size-9 text-muted-foreground" />
                </div>
              </div>
            </div>

            <!-- Name + tier chip -->
            <div class="flex flex-col items-center gap-1.5 text-center">
              <h2 class="text-xl font-bold tracking-tight">{{ badgeStrings.name }}</h2>
              <UiBadge variant="outline" :class="cfg.color">
                {{ tierLabel }}
              </UiBadge>
            </div>
          </div>
        </div>

        <!-- Body zone: editorial layout with italic quoted criteria -->
        <div class="flex flex-col gap-4 p-6 pt-5">
          <DialogHeader class="sr-only">
            <DialogTitle>{{ badgeStrings.name }}</DialogTitle>
            <DialogDescription>{{ badgeStrings.description }}</DialogDescription>
          </DialogHeader>

          <!-- Criteria as an italic quoted lead -->
          <p class="text-balance text-center text-base font-medium italic leading-relaxed">
            “{{ badgeStrings.description }}”
          </p>

          <!-- Reward as an inline amber pill, centered -->
          <div v-if="props.badge.coin_reward > 0" class="flex justify-center">
            <div
              class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
            >
              <CirclePoundSterling class="size-4" />
              <span>+{{ props.badge.coin_reward }}</span>
            </div>
          </div>

          <!-- Progress row: bar + fraction on one line (only for in-progress) -->
          <div v-if="!isUnlocked && !isTierGated && progressRecord" class="flex items-center gap-3">
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full bg-primary transition-all duration-700"
                :style="{ width: `${progressRecord.progress_pct}%` }"
              />
            </div>
            <span class="text-xs font-medium tabular-nums text-muted-foreground">
              {{
                t.student.badgeDetailDialog.progressValue(
                  progressRecord.current_value,
                  progressRecord.target_value,
                )
              }}
            </span>
          </div>

          <!-- State caption: unlocked date / tier-gate hint / not started -->
          <div
            v-if="isUnlocked && unlockedRecord"
            class="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
          >
            <Check class="size-3.5 text-green-600 dark:text-green-400" />
            <span>{{
              t.student.badgeDetailDialog.unlockedOn(formatDate(unlockedRecord.unlocked_at))
            }}</span>
          </div>
          <p v-else-if="isTierGated" class="text-balance text-center text-xs text-muted-foreground">
            {{ t.student.badgeDetailDialog.tierGatedHint }}
          </p>
          <p v-else-if="!progressRecord" class="text-center text-xs text-muted-foreground">
            {{ t.student.badgeDetailDialog.notStarted }}
          </p>

          <Button class="mt-1 w-full" @click="$emit('update:open', false)">
            {{ t.student.badgeDetailDialog.close }}
          </Button>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>
