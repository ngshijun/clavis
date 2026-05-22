<script setup lang="ts">
import { watch, computed, ref } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { rarityConfig, getRarityLabel } from '@/stores/pets'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore, FRIEND_CAP } from '@/stores/friends'
import { useStudentProfileDialog } from '@/composables/useStudentProfileDialog'
import FeaturedBadgesRow from '@/components/student/FeaturedBadgesRow.vue'
import { getInitials, getScoreBarColor, getScoreTextColor, MEDAL_EMOJIS } from '@/lib/utils'
import { getAvatarUrl } from '@/lib/storage'
import { formatDate, formatRelativeDate } from '@/lib/date'
import {
  Loader2,
  Star,
  PawPrint,
  Trophy,
  Flame,
  UserPlus,
  UserCheck,
  Clock,
  Check,
  Award,
} from 'lucide-vue-next'
import fireGif from '@/assets/icons/fire.gif'
import { toast } from 'vue-sonner'
import type { LeaderboardEntry } from '@/components/student/LeaderboardTable.vue'
import { useT } from '@/composables/useT'

const t = useT()

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  student: (LeaderboardEntry & Record<string, unknown>) | null
  activeTab: 'all-time' | 'weekly'
}>()

const authStore = useAuthStore()
const friendsStore = useFriendsStore()

const { profile, pet, bestSubjects, weeklyActivity, featuredBadges, isLoading, fetchProfile } =
  useStudentProfileDialog()

const isActionPending = ref(false)

watch(
  () => ({ isOpen: open.value, studentId: props.student?.id }),
  ({ isOpen, studentId }) => {
    if (isOpen && studentId) {
      fetchProfile(studentId)
      if (!friendsStore.hasFetchedFriends) friendsStore.fetchFriends()
      if (!friendsStore.hasFetchedRequests) friendsStore.fetchRequests()
    }
  },
)

const isSelf = computed(() => props.student?.id === authStore.user?.id)

const friendRecord = computed(() =>
  friendsStore.friends.find((f) => f.friendId === props.student?.id),
)

const friendshipStatus = computed<'none' | 'friends' | 'sent' | 'received'>(() => {
  const studentId = props.student?.id
  if (!studentId) return 'none'
  if (friendRecord.value) return 'friends'
  if (friendsStore.sentRequests.some((r) => r.studentId === studentId)) return 'sent'
  if (friendsStore.receivedRequests.some((r) => r.studentId === studentId)) return 'received'
  return 'none'
})

async function handleAddFriend() {
  if (!props.student?.id) return
  if (friendsStore.isFriendCapReached) {
    toast.error(t.value.shared.addFriend.toastFriendListFull(FRIEND_CAP))
    return
  }
  isActionPending.value = true
  const { error } = await friendsStore.sendRequest(props.student.id)
  isActionPending.value = false
  if (error) {
    toast.error(error)
  } else {
    toast.success(t.value.shared.addFriend.toastRequestSent(props.student.name))
  }
}

async function handleAcceptRequest() {
  const request = friendsStore.receivedRequests.find((r) => r.studentId === props.student?.id)
  if (!request) return
  if (friendsStore.isFriendCapReached) {
    toast.error(t.value.shared.friendRequests.toastFriendListFull(FRIEND_CAP))
    return
  }
  isActionPending.value = true
  const { error } = await friendsStore.respondRequest(request.friendshipId, true)
  isActionPending.value = false
  if (error) {
    toast.error(error)
  } else {
    toast.success(t.value.shared.friendRequests.toastAccepted(props.student?.name ?? ''))
  }
}

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
            <div class="min-w-0 flex-1">
              <DialogTitle class="truncate text-xl">{{ student.name }}</DialogTitle>
              <div class="mt-1 flex items-center gap-2">
                <Badge variant="outline">{{ student.gradeLevelName ?? 'N/A' }}</Badge>
                <Badge v-if="student.rank" variant="secondary" class="gap-1">
                  <Trophy class="size-3" />
                  {{ t.shared.studentProfileDialog.rankLabel(student.rank) }}
                </Badge>
              </div>
            </div>

            <!-- Friend action button -->
            <div
              v-if="authStore.isStudent && !isSelf && !isLoading && friendsStore.hasFetchedFriends"
              class="shrink-0"
            >
              <Badge
                v-if="friendshipStatus === 'friends' && friendRecord"
                variant="secondary"
                class="gap-1.5 px-3 py-1.5 text-sm"
              >
                <UserCheck class="size-4" />
                {{ friendRecord.closenessLabel }}
              </Badge>
              <Button
                v-else-if="friendshipStatus === 'sent'"
                size="sm"
                variant="secondary"
                disabled
              >
                <Clock class="mr-1 size-4" />
                {{ t.shared.studentProfileDialog.requestSent }}
              </Button>
              <Button
                v-else-if="friendshipStatus === 'received'"
                size="sm"
                :disabled="isActionPending"
                @click="handleAcceptRequest"
              >
                <Check v-if="!isActionPending" class="mr-1 size-4" />
                <Loader2 v-else class="mr-1 size-4 animate-spin" />
                {{ t.shared.studentProfileDialog.acceptRequest }}
              </Button>
              <Button v-else size="sm" :disabled="isActionPending" @click="handleAddFriend">
                <UserPlus v-if="!isActionPending" class="mr-1 size-4" />
                <Loader2 v-else class="mr-1 size-4 animate-spin" />
                {{ t.shared.studentProfileDialog.addFriend }}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <Loader2 class="size-6 animate-spin text-muted-foreground" />
        </div>

        <div v-else class="space-y-4">
          <!-- Featured Badges + Stats Row -->
          <div class="grid grid-cols-3 gap-4">
            <div
              class="flex flex-col justify-center rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 dark:border-amber-900/50 dark:from-amber-950/30 dark:to-yellow-950/30"
            >
              <div class="mb-3 flex items-center justify-between">
                <p class="text-xs font-medium text-muted-foreground">
                  {{ t.shared.studentProfileDialog.featuredBadges }}
                </p>
                <Award class="size-4 text-muted-foreground" />
              </div>
              <FeaturedBadgesRow :badges="featuredBadges" :show-label="false" />
            </div>
            <div class="col-span-2 grid grid-cols-3 gap-3">
              <div class="rounded-lg border bg-muted/30 p-3 text-center">
                <p class="text-xs text-muted-foreground">
                  {{ t.shared.studentProfileDialog.level }}
                </p>
                <p class="text-xl font-bold">{{ studentLevel }}</p>
              </div>
              <div class="rounded-lg border bg-muted/30 p-3 text-center">
                <p class="text-xs text-muted-foreground">
                  {{
                    activeTab === 'weekly'
                      ? t.shared.studentProfileDialog.weeklyXp
                      : t.shared.studentProfileDialog.xp
                  }}
                </p>
                <p class="text-xl font-bold">{{ studentXpDisplay }}</p>
              </div>
              <div class="rounded-lg border bg-muted/30 p-3 text-center">
                <p class="text-xs text-muted-foreground">
                  {{ t.shared.studentProfileDialog.coins }}
                </p>
                <p class="text-xl font-bold text-amber-600 dark:text-amber-400">
                  {{ profile?.coins.toLocaleString() ?? '-' }}
                </p>
              </div>
              <div class="rounded-lg border bg-muted/30 p-3 text-center">
                <p class="text-xs text-muted-foreground">
                  {{ t.shared.studentProfileDialog.badges }}
                </p>
                <p class="text-xl font-bold">
                  {{ profile?.badgesEarned ?? 0 }}
                  <span class="text-sm font-normal text-muted-foreground"
                    >/ {{ profile?.totalBadges ?? 0 }}</span
                  >
                </p>
              </div>
              <div class="rounded-lg border bg-muted/30 p-3 text-center">
                <p class="text-xs text-muted-foreground">
                  {{ t.shared.studentProfileDialog.pets }}
                </p>
                <p class="text-xl font-bold">
                  {{ profile?.petsCollected ?? 0 }}
                  <span class="text-sm font-normal text-muted-foreground"
                    >/ {{ profile?.totalPets ?? 0 }}</span
                  >
                </p>
              </div>
              <div class="rounded-lg border bg-muted/30 p-3 text-center">
                <p class="text-xs text-muted-foreground">
                  {{ t.shared.studentProfileDialog.lastActive }}
                </p>
                <p class="text-xl font-bold">
                  {{
                    profile?.lastActive
                      ? formatRelativeDate(profile.lastActive, t.shared.relativeDate)
                      : '-'
                  }}
                </p>
              </div>
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
                      {{ getRarityLabel(pet.rarity) }}
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
                <PawPrint class="size-12 text-purple-400" />
              </div>
              <p class="text-lg font-semibold text-muted-foreground">
                {{ t.shared.studentProfileDialog.noPetSelected }}
              </p>
            </div>

            <!-- Best Subjects (top right, spans 2 cols) -->
            <div
              class="col-span-2 rounded-lg border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 p-4 dark:border-sky-900/50 dark:from-sky-950/30 dark:to-blue-950/30"
            >
              <div class="mb-5 flex items-center justify-between">
                <p class="text-xs font-medium text-muted-foreground">
                  {{ t.shared.studentProfileDialog.topSubjects }}
                </p>
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
                      <p class="text-sm text-muted-foreground/60">
                        {{ t.shared.studentProfileDialog.notYetUnlocked }}
                      </p>
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
                <p class="text-xs font-medium text-muted-foreground">
                  {{ t.shared.studentProfileDialog.practiceStreak }}
                </p>
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
                    <span class="text-sm font-normal text-muted-foreground">{{
                      t.shared.studentProfileDialog.days
                    }}</span>
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
            {{ t.shared.studentProfileDialog.memberSince(formatDate(profile.memberSince)) }}
          </p>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>
