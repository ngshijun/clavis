<script setup lang="ts">
import { watch, computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

import { rarityConfig } from '@/stores/pets'
import { useStudentProfileDialog } from '@/composables/useStudentProfileDialog'
import { getInitials } from '@/lib/utils'
import { getAvatarUrl } from '@/lib/storage'
import { formatDate } from '@/lib/date'
import { Loader2, Star, PawPrint, Heart, Trophy, Flame } from 'lucide-vue-next'
import fireGif from '@/assets/icons/fire.gif'
import type { LeaderboardEntry } from '@/components/student/LeaderboardTable.vue'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  student: (LeaderboardEntry & Record<string, unknown>) | null
  activeTab: 'all-time' | 'weekly'
}>()

const { profile, pet, bestSubjects, weeklyActivity, isLoading, fetchProfile } =
  useStudentProfileDialog()

watch(
  () => ({ isOpen: open.value, studentId: props.student?.id }),
  ({ isOpen, studentId }) => {
    if (isOpen && studentId) {
      fetchProfile(studentId)
    }
  },
)

function getScoreBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getScoreTextColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

const medals = ['🥇', '🥈', '🥉']

// Computed helpers to avoid `as Record<string, unknown>` casts in template
// (prettier's HTML parser chokes on angle brackets in type assertions)
const studentRecord = computed(() => props.student as Record<string, unknown> | null)

const studentLevel = computed(() => (studentRecord.value?.level as number) ?? '-')

const studentXpDisplay = computed(() => {
  if (props.activeTab === 'weekly') {
    return (studentRecord.value?.weeklyXp as number)?.toLocaleString() ?? '-'
  }
  return (studentRecord.value?.xp as number)?.toLocaleString() ?? '-'
})

const studentCurrentStreak = computed(() => (studentRecord.value?.currentStreak as number) ?? 0)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
      <template v-if="student">
        <DialogHeader>
          <div class="flex items-center gap-4 overflow-hidden">
            <Avatar class="size-16 shrink-0">
              <AvatarImage :src="getAvatarUrl(student.avatarPath)" :alt="student.name" />
              <AvatarFallback class="text-lg">{{ getInitials(student.name) }}</AvatarFallback>
            </Avatar>
            <div class="min-w-0">
              <DialogTitle class="truncate text-xl">{{ student.name }}</DialogTitle>
              <div class="mt-1 flex items-center gap-2">
                <Badge variant="outline">{{ student.gradeLevelName ?? 'N/A' }}</Badge>
                <Badge v-if="student.rank" variant="secondary" class="gap-1">
                  <Trophy class="size-3" />
                  Rank {{ student.rank }}
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
          <!-- Stats Row (single row at top) -->
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg border bg-muted/30 p-3 text-center">
              <p class="text-xs text-muted-foreground">Level</p>
              <p class="text-xl font-bold">{{ studentLevel }}</p>
            </div>
            <div class="rounded-lg border bg-muted/30 p-3 text-center">
              <p class="text-xs text-muted-foreground">
                {{ activeTab === 'weekly' ? 'Weekly XP' : 'XP' }}
              </p>
              <p class="text-xl font-bold">{{ studentXpDisplay }}</p>
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
              <!-- Pet Display Area -->
              <div
                class="relative flex flex-1 items-center justify-center overflow-hidden px-6"
                :class="rarityConfig[pet.rarity].bgColor"
              >
                <!-- Decorative background circles -->
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
              <!-- Pet Info -->
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
                  <span class="text-lg leading-none">{{ medals[index - 1] }}</span>
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
                  <img v-if="studentCurrentStreak > 0" :src="fireGif" alt="fire" class="size-10" />
                  <span v-else class="text-4xl">&#x1F4A4;</span>
                </div>
                <div>
                  <p class="text-2xl font-bold">
                    {{ studentCurrentStreak }}
                    <span class="text-sm font-normal text-muted-foreground">days</span>
                  </p>
                </div>
              </div>
              <!-- Weekly Activity Dots -->
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

<style scoped>
@keyframes bounce-slow {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

.animate-bounce-slow {
  animation: bounce-slow 2s ease-in-out infinite;
}
</style>
