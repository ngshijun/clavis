<script setup lang="ts">
import { watch, computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

import { computeLevel } from '@/lib/xp'
import { CLOSENESS_LABELS, CLOSENESS_THRESHOLDS } from '@/stores/friends'
import { useStudentProfileDialog } from '@/composables/useStudentProfileDialog'
import ProfilePetCard from '@/components/shared/ProfilePetCard.vue'
import BestSubjectsList from '@/components/shared/BestSubjectsList.vue'
import WeeklyActivityStrip from '@/components/shared/WeeklyActivityStrip.vue'
import { getInitials } from '@/lib/utils'
import { getAvatarUrl } from '@/lib/storage'
import { formatDate, formatRelativeDate } from '@/lib/date'
import { Loader2, Trophy, Flame, CalendarHeart, Handshake } from 'lucide-vue-next'
import type { Friend } from '@/stores/friends'
import { useT } from '@/composables/useT'

const t = useT()

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  friend: Friend | null
}>()

const { profile, pet, bestSubjects, weeklyActivity, isLoading, fetchProfile } =
  useStudentProfileDialog()

const friendLevel = computed(() => computeLevel(profile.value?.xp ?? 0))

watch([open, () => props.friend?.friendId], ([isOpen, friendId]) => {
  if (isOpen && friendId) {
    fetchProfile(friendId)
  }
})

const closenessProgress = computed(() => {
  if (!props.friend) return 0
  const level = props.friend.closenessLevel
  const xp = props.friend.closenessXp
  const currentThreshold = CLOSENESS_THRESHOLDS[level]
  const nextThreshold = CLOSENESS_THRESHOLDS[level + 1]
  if (!nextThreshold) return 100
  return Math.round(((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100)
})

const nextLevelLabel = computed(() => {
  if (!props.friend) return ''
  const nextLevel = props.friend.closenessLevel + 1
  return CLOSENESS_LABELS[nextLevel] ?? null
})

const xpToNextLevel = computed(() => {
  if (!props.friend) return 0
  const nextThreshold = CLOSENESS_THRESHOLDS[props.friend.closenessLevel + 1]
  if (!nextThreshold) return 0
  return nextThreshold - props.friend.closenessXp
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
      <template v-if="friend">
        <DialogHeader>
          <div class="flex items-center gap-4 overflow-hidden">
            <Avatar class="size-16 shrink-0">
              <AvatarImage :src="getAvatarUrl(friend.avatarPath)" :alt="friend.name" />
              <AvatarFallback class="text-lg">{{ getInitials(friend.name) }}</AvatarFallback>
            </Avatar>
            <div class="min-w-0">
              <DialogTitle class="truncate text-xl">{{ friend.name }}</DialogTitle>
              <div class="mt-1 flex items-center gap-2">
                <Badge variant="outline" class="gap-1">
                  <Handshake class="size-3" />
                  {{ friend.closenessLabel }}
                </Badge>
                <Badge variant="secondary" class="gap-1">
                  <CalendarHeart class="size-3" />
                  {{ t.shared.friendProfileDialog.friendsSince(formatDate(friend.friendSince)) }}
                </Badge>
                <Badge variant="secondary" class="gap-1">
                  {{
                    t.shared.friendProfileDialog.active(
                      formatRelativeDate(friend.lastActive, t.shared.relativeDate),
                    )
                  }}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <Loader2 class="size-6 animate-spin text-muted-foreground" />
        </div>

        <div v-else class="space-y-4">
          <!-- Friendship Section -->
          <div
            class="rounded-lg border border-purple-200 bg-gradient-to-br from-purple-50 to-fuchsia-50 p-4 dark:border-purple-900/50 dark:from-purple-950/30 dark:to-fuchsia-950/30"
          >
            <div class="mb-3 flex items-center justify-between">
              <p class="text-xs font-medium text-muted-foreground">
                {{ t.shared.friendProfileDialog.closeness }}
              </p>
              <Handshake class="size-4 text-muted-foreground" />
            </div>
            <div class="flex items-baseline gap-2">
              <p class="text-2xl font-bold">Lv.{{ friend.closenessLevel }}</p>
              <p class="text-sm text-muted-foreground">{{ friend.closenessLabel }}</p>
            </div>
            <div class="mt-3">
              <Progress :model-value="closenessProgress" class="h-2" />
              <p v-if="nextLevelLabel" class="mt-1 text-xs text-muted-foreground">
                {{ t.shared.friendProfileDialog.sendCoinsToGrow(xpToNextLevel, nextLevelLabel) }}
              </p>
              <p v-else class="mt-1 text-xs text-muted-foreground">
                {{ t.shared.friendProfileDialog.maxLevelReached }}
              </p>
            </div>
            <p class="mt-3 text-sm">
              <span
                v-if="friend.sentToday && friend.receivedToday"
                class="font-medium text-green-600 dark:text-green-400"
              >
                {{ t.shared.friendProfileDialog.bothSentCoins }}
              </span>
              <span v-else-if="friend.sentToday" class="text-muted-foreground">
                {{ t.shared.friendProfileDialog.youSentCoins(friend.name) }}
              </span>
              <span v-else-if="friend.receivedToday" class="text-muted-foreground">
                {{ t.shared.friendProfileDialog.theysentCoins(friend.name) }}
              </span>
              <span v-else class="text-muted-foreground">
                {{ t.shared.friendProfileDialog.neitherSent }}
              </span>
            </p>
          </div>

          <!-- Stats Row (matches leaderboard dialog) -->
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg border bg-muted/30 p-3 text-center">
              <p class="text-xs text-muted-foreground">{{ t.shared.friendProfileDialog.level }}</p>
              <p class="text-xl font-bold">{{ friendLevel }}</p>
            </div>
            <div class="rounded-lg border bg-muted/30 p-3 text-center">
              <p class="text-xs text-muted-foreground">{{ t.shared.friendProfileDialog.xp }}</p>
              <p class="text-xl font-bold">{{ (profile?.xp ?? 0).toLocaleString() }}</p>
            </div>
            <div class="rounded-lg border bg-muted/30 p-3 text-center">
              <p class="text-xs text-muted-foreground">{{ t.shared.friendProfileDialog.coins }}</p>
              <p class="text-xl font-bold text-amber-600 dark:text-amber-400">
                {{ profile?.coins.toLocaleString() ?? '-' }}
              </p>
            </div>
          </div>

          <!-- Dashboard-style grid: Pet (1col, 2rows) | Best Subjects / Weekly Activity -->
          <div class="grid grid-cols-3 grid-rows-2 gap-4">
            <!-- Pet (left column, spans 2 rows) -->
            <ProfilePetCard :pet="pet" :no-pet-label="t.shared.friendProfileDialog.noPetSelected" />

            <!-- Best Subjects (top right, spans 2 cols) -->
            <div
              class="col-span-2 rounded-lg border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 p-4 dark:border-sky-900/50 dark:from-sky-950/30 dark:to-blue-950/30"
            >
              <div class="mb-5 flex items-center justify-between">
                <p class="text-xs font-medium text-muted-foreground">
                  {{ t.shared.friendProfileDialog.topSubjects }}
                </p>
                <Trophy class="size-4 text-muted-foreground" />
              </div>
              <BestSubjectsList
                :subjects="bestSubjects"
                :empty-label="t.shared.friendProfileDialog.notYetUnlocked"
              />
            </div>

            <!-- Streak + Weekly Activity (bottom right, spans 2 cols) -->
            <div
              class="col-span-2 rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-4 dark:border-orange-900/50 dark:from-orange-950/30 dark:to-amber-950/30"
            >
              <div class="mb-5 flex items-center justify-between">
                <p class="text-xs font-medium text-muted-foreground">
                  {{ t.shared.friendProfileDialog.practiceStreak }}
                </p>
                <Flame class="size-4 text-muted-foreground" />
              </div>
              <WeeklyActivityStrip
                :current-streak="profile?.currentStreak ?? 0"
                :weekly-activity="weeklyActivity"
                :days-label="t.shared.studentProfileDialog.days"
              />
            </div>
          </div>

          <!-- Member Since -->
          <p v-if="profile?.memberSince" class="text-xs text-muted-foreground">
            {{ t.shared.friendProfileDialog.memberSince(formatDate(profile.memberSince)) }}
          </p>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>
