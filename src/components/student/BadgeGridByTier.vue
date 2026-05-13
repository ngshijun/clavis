<script setup lang="ts">
import { computed, ref } from 'vue'
import { useT } from '@/composables/useT'
import { useBadgesStore, TIER_ORDER, tierConfig } from '@/stores/badges'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import BadgeCard from '@/components/student/BadgeCard.vue'
import BadgeDetailDialog from '@/components/student/BadgeDetailDialog.vue'
import { Medal, Award, Trophy, Shield, Gem, Crown, Sparkles } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { Badge as BadgeRow, BadgeProgress } from '@/stores/badges'
import type { Database } from '@/types/database.types'

type BadgeTier = Database['public']['Enums']['badge_tier']

const t = useT()
const badgesStore = useBadgesStore()

const selectedBadge = ref<BadgeRow | null>(null)
const showDetailDialog = ref(false)

function openDetail(badge: BadgeRow) {
  selectedBadge.value = badge
  showDetailDialog.value = true
  // Fire-and-forget: clears the unread state for this badge if it was new.
  void badgesStore.markBadgeSeen(badge.id)
}

const tierIcons: Record<BadgeTier, Component> = {
  bronze: Medal,
  silver: Award,
  gold: Trophy,
  platinum: Shield,
  diamond: Gem,
  master: Crown,
  grandmaster: Sparkles,
}

const unlockedIdSet = computed(() => new Set(badgesStore.unlocked.map((u) => u.badge_id)))

const unlockedAtMap = computed(() => {
  const m = new Map<string, string>()
  for (const u of badgesStore.unlocked) m.set(u.badge_id, u.unlocked_at)
  return m
})

const seenAtMap = computed(() => {
  const m = new Map<string, string | null>()
  for (const u of badgesStore.unlocked) m.set(u.badge_id, u.seen_at)
  return m
})

const progressMap = computed(() => {
  const m = new Map<string, BadgeProgress>()
  for (const p of badgesStore.progress) m.set(p.badge_id, p)
  return m
})

const groupedByTier = computed<Record<BadgeTier, BadgeRow[]>>(() => {
  const groups = {
    bronze: [],
    silver: [],
    gold: [],
    platinum: [],
    diamond: [],
    master: [],
    grandmaster: [],
  } as Record<BadgeTier, BadgeRow[]>
  for (const b of badgesStore.catalog) {
    groups[b.tier].push(b)
  }
  return groups
})

function unlockedCountFor(tier: BadgeTier): number {
  return groupedByTier.value[tier].filter((b) => unlockedIdSet.value.has(b.id)).length
}
</script>

<template>
  <div class="space-y-5">
    <template v-for="tier in TIER_ORDER" :key="tier">
      <Card
        v-if="groupedByTier[tier].length > 0"
        class="relative overflow-hidden transition-shadow duration-300 hover:shadow-md"
      >
        <!-- Subtle tier-themed accent gradient along the top -->
        <div
          class="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b opacity-50"
          :class="[tierConfig[tier].gradientFrom, tierConfig[tier].gradientTo]"
        />

        <CardHeader class="relative pb-3">
          <div class="flex items-center justify-between gap-3">
            <CardTitle class="flex items-center gap-2.5 text-base">
              <component :is="tierIcons[tier]" class="size-5" :class="tierConfig[tier].color" />
              <span :class="tierConfig[tier].color">
                {{ t.student.achievements.tierSections[tier] }}
              </span>
            </CardTitle>
            <Badge variant="outline" :class="tierConfig[tier].color">
              {{ unlockedCountFor(tier) }} / {{ groupedByTier[tier].length }}
            </Badge>
          </div>
        </CardHeader>
        <CardContent class="relative">
          <div class="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6">
            <BadgeCard
              v-for="badge in groupedByTier[tier]"
              :key="badge.id"
              :badge="badge"
              :unlocked="unlockedIdSet.has(badge.id)"
              :unlocked-at="unlockedAtMap.get(badge.id) ?? null"
              :seen-at="seenAtMap.get(badge.id) ?? null"
              :progress="progressMap.get(badge.id) ?? null"
              @select="openDetail"
            />
          </div>
        </CardContent>
      </Card>
    </template>

    <BadgeDetailDialog
      :open="showDetailDialog"
      :badge="selectedBadge"
      @update:open="showDetailDialog = $event"
    />
  </div>
</template>
