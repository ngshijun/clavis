<script setup lang="ts">
import { watch, computed, ref } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

import { supabase } from '@/lib/supabaseClient'
import { computeLevel } from '@/lib/xp'
import { rarityConfig } from '@/stores/pets'
import { CLOSENESS_LABELS, CLOSENESS_THRESHOLDS } from '@/stores/friends'
import { useStudentProfileDialog } from '@/composables/useStudentProfileDialog'
import { getInitials, getScoreBarColor, getScoreTextColor, MEDAL_EMOJIS } from '@/lib/utils'
import { getAvatarUrl } from '@/lib/storage'
import { formatDate, formatRelativeDate } from '@/lib/date'
import {
  Loader2,
  Star,
  PawPrint,
  Heart,
  Trophy,
  Flame,
  CalendarHeart,
  Handshake,
} from 'lucide-vue-next'
import fireGif from '@/assets/icons/fire.gif'
import type { Friend } from '@/stores/friends'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  friend: Friend | null
}>()

const { profile, pet, bestSubjects, weeklyActivity, isLoading, fetchProfile } =
  useStudentProfileDialog()

const friendXp = ref(0)
const friendLevel = computed(() => computeLevel(friendXp.value))

watch([open, () => props.friend?.friendId], async ([isOpen, friendId]) => {
  if (isOpen && friendId) {
    fetchProfile(friendId)
    const { data } = await supabase
      .from('student_profiles')
      .select('xp')
      .eq('id', friendId)
      .single()
    friendXp.value = data?.xp ?? 0
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
                  Friends since {{ formatDate(friend.friendSince) }}
                </Badge>
                <Badge variant="secondary" class="gap-1">
                  Active {{ formatRelativeDate(friend.lastActive) }}
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
              <p class="text-xs font-medium text-muted-foreground">Closeness</p>
              <Handshake class="size-4 text-muted-foreground" />
            </div>
            <div class="flex items-baseline gap-2">
              <p class="text-2xl font-bold">Lv.{{ friend.closenessLevel }}</p>
              <p class="text-sm text-muted-foreground">{{ friend.closenessLabel }}</p>
            </div>
            <div class="mt-3">
              <Progress :model-value="closenessProgress" class="h-2" />
              <p v-if="nextLevelLabel" class="mt-1 text-xs text-muted-foreground">
                Send coins to each other for {{ xpToNextLevel }} more days to reach
                {{ nextLevelLabel }}
              </p>
              <p v-else class="mt-1 text-xs text-muted-foreground">Max level reached!</p>
            </div>
            <p class="mt-3 text-sm">
              <span
                v-if="friend.sentToday && friend.receivedToday"
                class="font-medium text-green-600 dark:text-green-400"
              >
                You both sent coins today — streak grows!
              </span>
              <span v-else-if="friend.sentToday" class="text-muted-foreground">
                You sent coins — waiting for {{ friend.name }}
              </span>
              <span v-else-if="friend.receivedToday" class="text-muted-foreground">
                {{ friend.name }} sent coins — send back to grow your streak!
              </span>
              <span v-else class="text-muted-foreground"> Neither of you sent coins today </span>
            </p>
          </div>

          <!-- Stats Row (matches leaderboard dialog) -->
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg border bg-muted/30 p-3 text-center">
              <p class="text-xs text-muted-foreground">Level</p>
              <p class="text-xl font-bold">{{ friendLevel }}</p>
            </div>
            <div class="rounded-lg border bg-muted/30 p-3 text-center">
              <p class="text-xs text-muted-foreground">XP</p>
              <p class="text-xl font-bold">{{ friendXp.toLocaleString() }}</p>
            </div>
            <div class="rounded-lg border bg-muted/30 p-3 text-center">
              <p class="text-xs text-muted-foreground">Coins</p>
              <p class="text-xl font-bold text-amber-600 dark:text-amber-400">
                {{ profile?.coins.toLocaleString() ?? '-' }}
              </p>
            </div>
          </div>

          <!-- Dashboard-style grid: Pet (1col, 2rows) | Best Subjects / Weekly Activity -->
          <div class="grid grid-cols-3 grid-rows-2 gap-4">
            <!-- Pet (left column, spans 2 rows) -->
            <div
              v-if="pet"
              class="row-span-2 flex min-h-[24rem] flex-col overflow-hidden rounded-lg border"
            >
              <div
                class="relative flex flex-1 items-center justify-center overflow-hidden px-6"
                :class="rarityConfig[pet.rarity].bgColor"
              >
                <div
                  class="absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 lg:size-56"
                  :class="rarityConfig[pet.rarity].borderColor"
                  style="border-width: 3px; border-style: dashed"
                />
                <div
                  class="absolute left-1/2 top-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10 lg:size-44"
                  :class="rarityConfig[pet.rarity].borderColor"
                  style="border-width: 2px; border-style: dotted"
                />
                <img
                  :src="pet.imageUrl"
                  :alt="pet.name"
                  class="animate-bounce-slow relative z-10 h-full max-h-64 w-auto object-contain drop-shadow-lg"
                />
              </div>
              <div class="flex items-center gap-3 px-5 py-3">
                <PawPrint class="size-5 text-purple-500" />
                <div>
                  <p class="text-sm font-semibold">{{ pet.name }}</p>
                  <div class="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      :class="rarityConfig[pet.rarity].color"
                      class="text-xs"
                    >
                      {{ rarityConfig[pet.rarity].label }}
                    </Badge>
                    <Badge variant="secondary" class="text-xs">
                      <Star class="mr-0.5 size-2.5" />
                      T{{ pet.tier }}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
            <div
              v-else
              class="row-span-2 flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed"
            >
              <div
                class="flex size-24 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/50"
              >
                <Heart class="size-12 text-purple-400" />
              </div>
              <p class="text-lg font-semibold text-muted-foreground">No pet selected</p>
            </div>

            <!-- Best Subjects (top right, spans 2 cols) -->
            <div
              class="col-span-2 rounded-lg border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 p-4 dark:border-sky-900/50 dark:from-sky-950/30 dark:to-blue-950/30"
            >
              <div class="mb-5 flex items-center justify-between">
                <p class="text-xs font-medium text-muted-foreground">Top Subjects</p>
                <Trophy class="size-4 text-muted-foreground" />
              </div>
              <div class="space-y-2">
                <div v-for="index in 3" :key="index" class="flex items-center gap-2">
                  <span class="text-lg leading-none">{{ MEDAL_EMOJIS[index - 1] }}</span>
                  <template v-if="bestSubjects[index - 1]">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-baseline justify-between gap-2">
                        <p class="truncate text-sm font-medium">
                          {{ bestSubjects[index - 1]!.gradeLevelName }} ·
                          {{ bestSubjects[index - 1]!.subjectName }}
                        </p>
                        <span
                          class="shrink-0 text-sm font-bold"
                          :class="getScoreTextColor(bestSubjects[index - 1]!.averageScore)"
                        >
                          {{ bestSubjects[index - 1]!.averageScore }}%
                        </span>
                      </div>
                      <div
                        class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sky-100 dark:bg-sky-900/30"
                      >
                        <div
                          class="h-full rounded-full transition-all"
                          :class="getScoreBarColor(bestSubjects[index - 1]!.averageScore)"
                          :style="{ width: `${bestSubjects[index - 1]!.averageScore}%` }"
                        />
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-muted-foreground/60">Not yet unlocked</p>
                      <div
                        class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sky-100 dark:bg-sky-900/30"
                      />
                    </div>
                  </template>
                </div>
              </div>
            </div>

            <!-- Streak + Weekly Activity (bottom right, spans 2 cols) -->
            <div
              class="col-span-2 rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-4 dark:border-orange-900/50 dark:from-orange-950/30 dark:to-amber-950/30"
            >
              <div class="mb-5 flex items-center justify-between">
                <p class="text-xs font-medium text-muted-foreground">Practice Streak</p>
                <Flame class="size-4 text-muted-foreground" />
              </div>
              <div class="flex items-center gap-3">
                <div class="flex size-14 items-center justify-center">
                  <img
                    v-if="weeklyActivity.some((d) => d.active)"
                    :src="fireGif"
                    alt="fire"
                    class="size-10"
                  />
                  <span v-else class="text-4xl">&#x1F4A4;</span>
                </div>
                <div>
                  <p class="text-2xl font-bold">
                    {{ weeklyActivity.filter((d) => d.active).length }}
                    <span class="text-sm font-normal text-muted-foreground">days this week</span>
                  </p>
                </div>
              </div>
              <div
                v-if="weeklyActivity.length > 0"
                class="mt-4 flex items-center justify-between gap-1"
              >
                <div
                  v-for="(day, i) in weeklyActivity"
                  :key="i"
                  class="flex flex-1 flex-col items-center gap-1"
                >
                  <div
                    class="size-5 rounded-full border"
                    :class="[
                      day.active
                        ? 'border-orange-400 bg-orange-400 dark:border-orange-500 dark:bg-orange-500'
                        : day.isFuture
                          ? 'border-dashed border-gray-300 dark:border-gray-700'
                          : 'border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-muted',
                      day.isToday && !day.active ? 'border-orange-300 dark:border-orange-700' : '',
                    ]"
                  />
                  <span
                    class="text-[10px] leading-none"
                    :class="
                      day.isToday
                        ? 'font-bold text-orange-600 dark:text-orange-400'
                        : 'text-muted-foreground'
                    "
                  >
                    {{ day.label }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Member Since -->
          <p v-if="profile?.memberSince" class="text-xs text-muted-foreground">
            Member since {{ formatDate(profile.memberSince) }}
          </p>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>
