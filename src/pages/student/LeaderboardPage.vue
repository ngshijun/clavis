<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import {
  useLeaderboardStore,
  type LeaderboardStudent,
  type WeeklyLeaderboardStudent,
  type WeeklyReward,
} from '@/stores/leaderboard'
import { useCurriculumStore } from '@/stores/curriculum'
import { useT } from '@/composables/useT'
import { useLanguageStore } from '@/stores/language'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Trophy,
  Loader2,
  CirclePoundSterling,
  CalendarClock,
  Swords,
  CalendarSync,
  X,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import fireGif from '@/assets/icons/fire.gif'
import { useCountdownTimer } from '@/composables/useCountdownTimer'
import LeaderboardTable, { type LeaderboardEntry } from '@/components/student/LeaderboardTable.vue'
import WeeklyRewardDialog from '@/components/student/WeeklyRewardDialog.vue'
import StudentProfileDialog from '@/components/student/StudentProfileDialog.vue'

const leaderboardStore = useLeaderboardStore()
const curriculumStore = useCurriculumStore()
const t = useT()
const languageStore = useLanguageStore()

const ALL_VALUE = '__all__'
const selectedGradeLevel = ref<string>(ALL_VALUE)
const activeTab = ref<'all-time' | 'weekly'>('all-time')

// Weekly competition info banner (permanently dismissible)
const weeklyBannerDismissed = useLocalStorage('weekly_competition_banner_dismissed', false)

// Coin rewards for weekly leaderboard top 10
const WEEKLY_COIN_REWARDS = [500, 400, 300, 250, 200, 150, 125, 100, 75, 50] as const

function getWeeklyReward(rank: number): number | null {
  if (rank >= 1 && rank <= 10) return WEEKLY_COIN_REWARDS[rank - 1] ?? null
  return null
}

// Countdown to next Monday 00:00 MYT
const { countdown } = useCountdownTimer()

// Weekly reward notification
const showRewardDialog = ref(false)
const lastWeekReward = ref<WeeklyReward | null>(null)

async function checkWeeklyReward() {
  if (!leaderboardStore.hasUnseenReward) return

  const reward = await leaderboardStore.fetchLastWeekReward()
  if (!reward) return

  lastWeekReward.value = reward
  showRewardDialog.value = true
}

function dismissRewardDialog() {
  showRewardDialog.value = false
  if (lastWeekReward.value) {
    leaderboardStore.markRewardSeen(lastWeekReward.value.weekStart)
  }
}

// Student profile dialog
const showProfileDialog = ref(false)
const selectedStudent = ref<LeaderboardEntry | null>(null)

function handleRowClick(entry: LeaderboardEntry) {
  selectedStudent.value = entry
  showProfileDialog.value = true
}

// The store is already scoped to the active filter (via fetchLeaderboard),
// so `currentStudentInfo` just needs to surface `self` when it's missing
// from the displayed slice — the "you're outside top 20" row.
const currentStudentInfo = computed<LeaderboardStudent | null>(() => {
  const self = leaderboardStore.self
  if (!self) return null
  if (leaderboardStore.students.some((s) => s.id === self.id)) return null
  return self
})

const currentWeeklyStudentInfo = computed<WeeklyLeaderboardStudent | null>(() => {
  const self = leaderboardStore.weeklySelf
  if (!self) return null
  if (leaderboardStore.weeklyStudents.some((s) => s.id === self.id)) return null
  return self
})

function gradeLevelIdFor(value: string): string | null {
  return value === ALL_VALUE ? null : value
}

watch(selectedGradeLevel, async (value) => {
  await leaderboardStore.fetchLeaderboard(gradeLevelIdFor(value))
})

onMounted(async () => {
  try {
    if (curriculumStore.gradeLevels.length === 0) {
      await curriculumStore.fetchCurriculum()
    }

    await Promise.all([
      leaderboardStore.fetchLeaderboard(gradeLevelIdFor(selectedGradeLevel.value)),
      leaderboardStore.fetchWeeklyLeaderboard(),
    ])
  } catch (err) {
    console.error('Failed to load leaderboard:', err)
    toast.error(t.value.student.leaderboard.toastLoadFailed)
  }

  checkWeeklyReward()
})
</script>

<template>
  <div class="space-y-6 p-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold">{{ t.student.leaderboard.title }}</h1>
        <p class="text-muted-foreground">{{ t.student.leaderboard.subtitle }}</p>
      </div>

      <!-- Grade Level Filter (all-time only) -->
      <Select
        v-if="activeTab === 'all-time'"
        :key="languageStore.language"
        v-model="selectedGradeLevel"
        :disabled="leaderboardStore.isLoading"
      >
        <SelectTrigger class="w-[180px]">
          <SelectValue :placeholder="t.student.leaderboard.allGradeLevels" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_VALUE">{{ t.student.leaderboard.allGradeLevels }}</SelectItem>
          <SelectItem
            v-for="gradeLevel in curriculumStore.gradeLevels"
            :key="gradeLevel.id"
            :value="gradeLevel.id"
          >
            {{ gradeLevel.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Tabs -->
    <Tabs v-model="activeTab" class="w-full">
      <TabsList class="grid w-full grid-cols-2">
        <TabsTrigger value="all-time">{{ t.student.leaderboard.tabAllTime }}</TabsTrigger>
        <TabsTrigger value="weekly"> {{ t.student.leaderboard.tabWeekly }} </TabsTrigger>
      </TabsList>

      <!-- All-Time Tab -->
      <TabsContent value="all-time">
        <div v-if="leaderboardStore.isLoading" class="flex items-center justify-center py-12">
          <Loader2 class="size-8 animate-spin text-muted-foreground" />
        </div>

        <Card v-else>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Trophy class="size-5 text-yellow-500" />
              {{ t.student.leaderboard.top20 }}
              <Badge v-if="selectedGradeLevel !== ALL_VALUE" variant="secondary" class="ml-2">
                {{
                  curriculumStore.gradeLevels.find((g) => g.id === selectedGradeLevel)?.name ?? ''
                }}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent class="p-0">
            <LeaderboardTable
              :entries="leaderboardStore.students"
              :current-student-entry="currentStudentInfo"
              :empty-message="t.student.leaderboard.noStudentsGrade"
              @row-click="handleRowClick"
            >
              <template #stats="{ entry }">
                <div class="flex items-center gap-6">
                  <div class="w-14 text-center">
                    <p class="text-sm text-muted-foreground">{{ t.student.leaderboard.streak }}</p>
                    <p class="flex items-center justify-center gap-1 font-semibold">
                      <img
                        v-if="(entry as LeaderboardStudent).currentStreak > 0"
                        :src="fireGif"
                        alt="fire"
                        loading="lazy"
                        class="size-4"
                      />
                      {{ (entry as LeaderboardStudent).currentStreak }}
                    </p>
                  </div>
                  <div class="w-14 text-center">
                    <p class="text-sm text-muted-foreground">{{ t.student.leaderboard.level }}</p>
                    <p class="font-semibold">{{ (entry as LeaderboardStudent).level }}</p>
                  </div>
                  <div class="w-14 text-center">
                    <p class="text-sm text-muted-foreground">{{ t.student.leaderboard.xp }}</p>
                    <p class="font-semibold">
                      {{ (entry as LeaderboardStudent).xp.toLocaleString() }}
                    </p>
                  </div>
                </div>
              </template>
              <template #current-student-stats="{ entry }">
                <div class="flex items-center gap-6">
                  <div class="w-14 text-center">
                    <p class="text-sm text-muted-foreground">{{ t.student.leaderboard.streak }}</p>
                    <p class="flex items-center justify-center gap-1 font-semibold">
                      <img
                        v-if="(entry as LeaderboardStudent).currentStreak > 0"
                        :src="fireGif"
                        alt="fire"
                        loading="lazy"
                        class="size-4"
                      />
                      {{ (entry as LeaderboardStudent).currentStreak }}
                    </p>
                  </div>
                  <div class="w-14 text-center">
                    <p class="text-sm text-muted-foreground">{{ t.student.leaderboard.level }}</p>
                    <p class="font-semibold">{{ (entry as LeaderboardStudent).level }}</p>
                  </div>
                  <div class="w-14 text-center">
                    <p class="text-sm text-muted-foreground">{{ t.student.leaderboard.xp }}</p>
                    <p class="font-semibold">
                      {{ (entry as LeaderboardStudent).xp.toLocaleString() }}
                    </p>
                  </div>
                </div>
              </template>
            </LeaderboardTable>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- Weekly Tab -->
      <TabsContent value="weekly" class="space-y-4">
        <div
          v-if="!weeklyBannerDismissed"
          class="relative overflow-hidden rounded-lg bg-gradient-to-r from-purple-500/10 via-amber-500/10 to-purple-500/10 border border-purple-500/20 p-4"
        >
          <button
            class="absolute top-2 right-2 rounded-full p-1 opacity-50 transition-opacity hover:opacity-100"
            @click="weeklyBannerDismissed = true"
          >
            <X class="size-4" />
            <span class="sr-only">{{ t.shared.toasts.dismiss }}</span>
          </button>
          <h3 class="mb-3 pr-6 font-bold">{{ t.student.leaderboard.howItWorks }}</h3>
          <div class="grid gap-2 text-sm sm:grid-cols-3">
            <div class="flex items-center gap-2">
              <Swords class="size-4 shrink-0 text-purple-500" />
              <span>{{ t.student.leaderboard.howItWorksEarnXp }}</span>
            </div>
            <div class="flex items-center gap-2">
              <CirclePoundSterling class="size-4 shrink-0 text-amber-500" />
              <span>{{ t.student.leaderboard.howItWorksCoinRewards }}</span>
            </div>
            <div class="flex items-center gap-2">
              <CalendarSync class="size-4 shrink-0 text-blue-500" />
              <span>{{ t.student.leaderboard.howItWorksResets }}</span>
            </div>
          </div>
        </div>

        <div v-if="leaderboardStore.isWeeklyLoading" class="flex items-center justify-center py-12">
          <Loader2 class="size-8 animate-spin text-muted-foreground" />
        </div>

        <Card v-else>
          <CardHeader>
            <CardTitle class="flex flex-wrap items-center gap-2">
              <Trophy class="size-5 text-yellow-500" />
              {{ t.student.leaderboard.weeklyTop20 }}
              <Badge v-if="selectedGradeLevel !== ALL_VALUE" variant="secondary">
                {{
                  curriculumStore.gradeLevels.find((g) => g.id === selectedGradeLevel)?.name ?? ''
                }}
              </Badge>
              <Badge variant="outline" class="ml-auto gap-1">
                <CalendarClock class="size-3" />
                {{
                  countdown === 'Ending...'
                    ? t.student.leaderboard.ending
                    : t.student.leaderboard.endsIn(countdown)
                }}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent class="p-0">
            <LeaderboardTable
              :entries="leaderboardStore.weeklyStudents"
              :current-student-entry="currentWeeklyStudentInfo"
              :empty-message="t.student.leaderboard.noStudentsWeekly"
              @row-click="handleRowClick"
            >
              <template #stats="{ entry }">
                <div class="flex items-center gap-6">
                  <div
                    v-if="getWeeklyReward((entry as WeeklyLeaderboardStudent).rank)"
                    class="w-14 text-center"
                  >
                    <p class="text-sm text-muted-foreground">{{ t.student.leaderboard.reward }}</p>
                    <p
                      class="flex items-center justify-center gap-1 font-semibold text-amber-600 dark:text-amber-400"
                    >
                      <CirclePoundSterling class="size-3.5" />
                      {{ getWeeklyReward((entry as WeeklyLeaderboardStudent).rank) }}
                    </p>
                  </div>
                  <div v-else class="w-12" />
                  <div class="w-14 text-center">
                    <p class="text-sm text-muted-foreground">{{ t.student.leaderboard.level }}</p>
                    <p class="font-semibold">{{ (entry as WeeklyLeaderboardStudent).level }}</p>
                  </div>
                  <div class="w-14 text-center">
                    <p class="text-sm text-muted-foreground">
                      {{ t.student.leaderboard.weeklyXp }}
                    </p>
                    <p class="font-semibold">
                      {{ (entry as WeeklyLeaderboardStudent).weeklyXp.toLocaleString() }}
                    </p>
                  </div>
                </div>
              </template>
              <template #current-student-stats="{ entry }">
                <div class="flex items-center gap-6">
                  <div
                    v-if="getWeeklyReward((entry as WeeklyLeaderboardStudent).rank)"
                    class="w-14 text-center"
                  >
                    <p class="text-sm text-muted-foreground">{{ t.student.leaderboard.reward }}</p>
                    <p
                      class="flex items-center justify-center gap-1 font-semibold text-amber-600 dark:text-amber-400"
                    >
                      <CirclePoundSterling class="size-3.5" />
                      {{ getWeeklyReward((entry as WeeklyLeaderboardStudent).rank) }}
                    </p>
                  </div>
                  <div v-else class="w-12" />
                  <div class="w-14 text-center">
                    <p class="text-sm text-muted-foreground">{{ t.student.leaderboard.level }}</p>
                    <p class="font-semibold">{{ (entry as WeeklyLeaderboardStudent).level }}</p>
                  </div>
                  <div class="w-14 text-center">
                    <p class="text-sm text-muted-foreground">
                      {{ t.student.leaderboard.weeklyXp }}
                    </p>
                    <p class="font-semibold">
                      {{ (entry as WeeklyLeaderboardStudent).weeklyXp.toLocaleString() }}
                    </p>
                  </div>
                </div>
              </template>
            </LeaderboardTable>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <!-- Weekly Reward Notification Dialog -->
    <WeeklyRewardDialog
      :open="showRewardDialog"
      :reward="lastWeekReward"
      @dismiss="dismissRewardDialog"
    />

    <!-- Student Profile Dialog -->
    <StudentProfileDialog
      v-model:open="showProfileDialog"
      :student="selectedStudent"
      :active-tab="activeTab"
    />
  </div>
</template>
