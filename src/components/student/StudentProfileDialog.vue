<script setup lang="ts">
import { watch, computed, ref } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { useAuthStore } from '@/stores/auth'
import { useFriendsStore, FRIEND_CAP } from '@/stores/friends'
import { useStudentProfileDialog } from '@/composables/useStudentProfileDialog'
import ProfilePetCard from '@/components/shared/ProfilePetCard.vue'
import BestSubjectsList from '@/components/shared/BestSubjectsList.vue'
import WeeklyActivityStrip from '@/components/shared/WeeklyActivityStrip.vue'
import { getInitials } from '@/lib/utils'
import { getAvatarUrl } from '@/lib/storage'
import { formatDate } from '@/lib/date'
import { Loader2, Trophy, Flame, UserPlus, UserCheck, Clock, Check } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { LeaderboardEntry } from '@/components/student/LeaderboardTable.vue'
import { useT } from '@/composables/useT'

const t = useT()

const open = defineModel<boolean>('open', { default: false })

// Covers both LeaderboardStudent (all-time) and WeeklyLeaderboardStudent (weekly)
// entry shapes passed by LeaderboardPage; fields absent on one variant are optional.
interface ProfileDialogEntry extends LeaderboardEntry {
  level?: number
  xp?: number
  weeklyXp?: number
  currentStreak?: number
}

const props = defineProps<{
  student: ProfileDialogEntry | null
  activeTab: 'all-time' | 'weekly'
}>()

const authStore = useAuthStore()
const friendsStore = useFriendsStore()

const { profile, pet, bestSubjects, weeklyActivity, isLoading, fetchProfile } =
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

const studentLevel = computed(() => props.student?.level ?? '-')

const studentXpDisplay = computed(() => {
  const xp = props.activeTab === 'weekly' ? props.student?.weeklyXp : props.student?.xp
  return xp?.toLocaleString() ?? '-'
})
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
          <!-- Stats Row (single row at top) -->
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg border bg-muted/30 p-3 text-center">
              <p class="text-xs text-muted-foreground">{{ t.shared.studentProfileDialog.level }}</p>
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
              <p class="text-xs text-muted-foreground">{{ t.shared.studentProfileDialog.coins }}</p>
              <p class="text-xl font-bold text-amber-600 dark:text-amber-400">
                {{ profile?.coins.toLocaleString() ?? '-' }}
              </p>
            </div>
          </div>

          <!-- Dashboard-style grid: Pet (1col, 2rows) | Best Subjects / Weekly Activity -->
          <div class="grid grid-cols-3 grid-rows-2 gap-4">
            <!-- Pet (left column, spans 2 rows) -->
            <ProfilePetCard
              :pet="pet"
              :no-pet-label="t.shared.studentProfileDialog.noPetSelected"
            />

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
              <BestSubjectsList
                :subjects="bestSubjects"
                :empty-label="t.shared.studentProfileDialog.notYetUnlocked"
              />
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
              <WeeklyActivityStrip
                :current-streak="profile?.currentStreak ?? 0"
                :weekly-activity="weeklyActivity"
                :days-label="t.shared.studentProfileDialog.days"
              />
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
