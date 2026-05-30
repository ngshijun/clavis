<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useT } from '@/composables/useT'
import { useBadgesStore, tierConfig, TIER_ORDER, type Badge } from '@/stores/badges'
import { useAuthStore } from '@/stores/auth'
import { Check, Lock, Loader2, ArrowLeft, ArrowRight, X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { getBadgeIconUrl } from '@/lib/storage'
import { toast } from 'vue-sonner'
import type { Database } from '@/types/database.types'

type SubscriptionTier = Database['public']['Enums']['subscription_tier']

const open = defineModel<boolean>('open', { default: false })

const t = useT()
const badgesStore = useBadgesStore()
const authStore = useAuthStore()

const SUB_TIER_ORDER: Record<SubscriptionTier, number> = {
  core: 0,
  plus: 1,
  pro: 2,
  max: 3,
}

const selectedIds = ref<string[]>([])
const isSaving = ref(false)
const hideLocked = ref(false)

// Seed selection when the dialog opens.
watch(open, (isOpen) => {
  if (isOpen) {
    selectedIds.value = [...badgesStore.featuredIds]
  }
})

const unlockedIds = computed(() => new Set(badgesStore.unlocked.map((u) => u.badge_id)))

const studentTier = computed<SubscriptionTier>(
  () => authStore.user?.studentProfile?.subscriptionTier ?? 'core',
)

// Grouped by tier, unlocked first within each group. Tier groups with zero
// visible badges after filtering are dropped entirely.
const grouped = computed(() => {
  const byTier = new Map<string, Badge[]>()
  for (const b of badgesStore.catalog) {
    if (hideLocked.value && !unlockedIds.value.has(b.id)) continue
    if (!byTier.has(b.tier)) byTier.set(b.tier, [])
    byTier.get(b.tier)!.push(b)
  }
  return TIER_ORDER.filter((t) => byTier.has(t)).map((tier) => ({
    tier,
    badges: (byTier.get(tier) ?? []).sort((a, b) => {
      const au = unlockedIds.value.has(a.id) ? 0 : 1
      const bu = unlockedIds.value.has(b.id) ? 0 : 1
      if (au !== bu) return au - bu
      return a.slug.localeCompare(b.slug)
    }),
  }))
})

function getStrings(slug: string) {
  const badges = t.value.student.badges as Record<
    string,
    { name: string; description: string } | undefined
  >
  return badges[slug] ?? { name: slug, description: '' }
}

function isTierGated(badge: Badge): boolean {
  return SUB_TIER_ORDER[studentTier.value] < SUB_TIER_ORDER[badge.required_tier]
}

function isSelectable(badge: Badge): boolean {
  return unlockedIds.value.has(badge.id)
}

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id)
}

function toggle(badge: Badge) {
  if (!isSelectable(badge)) return
  const i = selectedIds.value.indexOf(badge.id)
  if (i >= 0) {
    selectedIds.value.splice(i, 1)
    return
  }
  if (selectedIds.value.length >= 3) {
    toast.error(t.value.student.profile.featuredBadgesMaxReached)
    return
  }
  selectedIds.value.push(badge.id)
}

// Resolve selected ids to Badge objects (drops any ids not in the catalog).
const selectedBadges = computed<(Badge | null)[]>(() => {
  const slots: (Badge | null)[] = [null, null, null]
  selectedIds.value.slice(0, 3).forEach((id, i) => {
    slots[i] = badgesStore.catalogById.get(id) ?? null
  })
  return slots
})

function removeAt(idx: number) {
  selectedIds.value.splice(idx, 1)
}

function swap(a: number, b: number) {
  if (a < 0 || b < 0 || a >= selectedIds.value.length || b >= selectedIds.value.length) return
  const tmp = selectedIds.value[a]!
  selectedIds.value[a] = selectedIds.value[b]!
  selectedIds.value[b] = tmp
}

async function handleSave() {
  isSaving.value = true
  try {
    const { error } = await badgesStore.setFeaturedBadges(selectedIds.value)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(t.value.student.profile.featuredBadgesSaved)
    open.value = false
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[85vh] flex-col gap-4 overflow-hidden sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t.student.profile.featuredBadgesDialogTitle }}</DialogTitle>
        <DialogDescription>
          {{ t.student.profile.featuredBadgesDialogDesc(selectedIds.length) }}
        </DialogDescription>
      </DialogHeader>

      <!-- Current selection preview (reorderable) -->
      <div class="rounded-lg border bg-muted/30 p-4">
        <p class="mb-3 text-center text-xs text-muted-foreground">
          {{ t.student.profile.featuredBadgesSlotsHint }}
        </p>
        <div class="flex items-start justify-center gap-6">
          <div
            v-for="(badge, idx) in selectedBadges"
            :key="idx"
            class="flex w-20 flex-col items-center gap-1.5"
          >
            <!-- Filled slot -->
            <template v-if="badge">
              <button
                type="button"
                :aria-label="getStrings(badge.slug).name"
                :title="t.student.profile.featuredBadgesRemoveHint"
                :class="
                  cn(
                    'group relative size-20 overflow-hidden rounded-full border-2 transition-all hover:-translate-y-0.5 hover:shadow-md',
                    tierConfig[badge.tier].bgColor,
                    tierConfig[badge.tier].borderColor,
                  )
                "
                @click="removeAt(idx)"
              >
                <img
                  :src="getBadgeIconUrl(badge.icon_path)"
                  :alt="getStrings(badge.slug).name"
                  loading="lazy"
                  class="size-full select-none object-cover text-transparent"
                />
                <!-- Hover X overlay -->
                <div
                  class="absolute inset-0 flex items-center justify-center rounded-full bg-background/80 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X class="size-5 text-destructive" />
                </div>
              </button>
              <!-- Reorder arrows -->
              <div class="flex gap-1">
                <button
                  type="button"
                  :disabled="idx === 0"
                  :aria-label="t.student.profile.featuredBadgesMoveLeft"
                  class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                  @click="swap(idx, idx - 1)"
                >
                  <ArrowLeft class="size-3.5" />
                </button>
                <button
                  type="button"
                  :disabled="idx >= selectedIds.length - 1"
                  :aria-label="t.student.profile.featuredBadgesMoveRight"
                  class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                  @click="swap(idx, idx + 1)"
                >
                  <ArrowRight class="size-3.5" />
                </button>
              </div>
            </template>

            <!-- Empty slot -->
            <template v-else>
              <div
                class="flex size-20 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 text-sm font-semibold text-muted-foreground/50"
              >
                {{ idx + 1 }}
              </div>
              <div class="h-6" />
            </template>
          </div>
        </div>
      </div>

      <!-- Filter toggle -->
      <div class="flex items-center justify-end gap-2">
        <Label for="hide-locked-toggle" class="text-sm text-muted-foreground">
          {{ t.student.profile.featuredBadgesHideLocked }}
        </Label>
        <Switch id="hide-locked-toggle" v-model="hideLocked" />
      </div>

      <div class="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
        <div v-for="group in grouped" :key="group.tier" class="mb-5">
          <p
            class="sticky top-0 z-10 mb-3 bg-background py-1 text-xs font-semibold uppercase tracking-wider"
            :class="tierConfig[group.tier].color"
          >
            {{ group.tier }}
          </p>
          <div class="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6">
            <button
              v-for="badge in group.badges"
              :key="badge.id"
              type="button"
              :disabled="!isSelectable(badge)"
              :aria-label="getStrings(badge.slug).name"
              :class="
                cn(
                  'group relative flex flex-col items-center gap-1.5 transition-all',
                  isSelectable(badge) ? 'cursor-pointer' : 'cursor-not-allowed',
                )
              "
              @click="toggle(badge)"
            >
              <!-- Circle + overlays (tick sits on the outer wrapper so it isn't clipped) -->
              <div class="relative">
                <div
                  :class="
                    cn(
                      'relative size-20 overflow-hidden rounded-full border-2 transition-all',
                      isSelectable(badge)
                        ? [
                            'group-hover:-translate-y-0.5 group-hover:shadow-md',
                            tierConfig[badge.tier].bgColor,
                            tierConfig[badge.tier].borderColor,
                            isSelected(badge.id)
                              ? ['ring-2 ring-offset-2', tierConfig[badge.tier].ringColor]
                              : 'opacity-70 group-hover:opacity-100',
                          ]
                        : 'border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-muted',
                    )
                  "
                >
                  <img
                    :src="getBadgeIconUrl(badge.icon_path)"
                    :alt="getStrings(badge.slug).name"
                    loading="lazy"
                    class="size-full select-none object-cover text-transparent"
                    :class="{ 'opacity-50 grayscale': !isSelectable(badge) }"
                  />

                  <!-- Lock overlay -->
                  <div
                    v-if="!isSelectable(badge)"
                    class="absolute inset-0 flex items-center justify-center rounded-full bg-background/70"
                  >
                    <Lock class="size-4 text-muted-foreground" />
                  </div>

                  <!-- Tier-gated corner indicator -->
                  <span
                    v-if="!isSelectable(badge) && isTierGated(badge)"
                    class="absolute bottom-0 right-0 rounded-tl bg-background/90 px-1 text-[9px] font-medium uppercase"
                  >
                    {{ badge.required_tier }}
                  </span>
                </div>

                <!-- Selection check — outside the overflow-hidden circle so it isn't clipped -->
                <div
                  v-if="isSelected(badge.id)"
                  class="absolute right-0 top-0 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
                >
                  <Check class="size-3" />
                </div>
              </div>

              <!-- Name -->
              <p
                class="line-clamp-2 w-full text-center text-[11px] font-medium leading-tight"
                :class="
                  isSelectable(badge)
                    ? tierConfig[badge.tier].textColor
                    : 'text-gray-400 dark:text-gray-600'
                "
              >
                {{ getStrings(badge.slug).name }}
              </p>
            </button>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="isSaving" @click="open = false">
          {{ t.shared.actions.cancel }}
        </Button>
        <Button :disabled="isSaving" @click="handleSave">
          <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
          {{ t.shared.actions.save }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
