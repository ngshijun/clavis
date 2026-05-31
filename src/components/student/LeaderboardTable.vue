<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Trophy, Medal, Award } from 'lucide-vue-next'
import { getInitials } from '@/lib/utils'
import { getAvatarUrl } from '@/lib/storage'
import { useT } from '@/composables/useT'

const t = useT()

export interface LeaderboardEntry {
  id: string
  name: string
  avatarPath: string | null
  gradeLevelName: string | null
  rank: number
  // Optional stat fields carried through to StudentProfileDialog; the table itself
  // never renders them. All-time rows supply `xp`, weekly rows supply `weeklyXp`.
  xp?: number
  weeklyXp?: number
  level?: number
  currentStreak?: number
}

defineProps<{
  entries: LeaderboardEntry[]
  currentStudentEntry: LeaderboardEntry | null
  emptyMessage?: string
}>()

const emit = defineEmits<{
  'row-click': [entry: LeaderboardEntry]
}>()

defineSlots<{
  stats(props: { entry: LeaderboardEntry }): unknown
  'current-student-stats'(props: { entry: LeaderboardEntry }): unknown
}>()

const authStore = useAuthStore()

function getRankIcon(rank: number) {
  if (rank === 1) return Trophy
  if (rank === 2) return Medal
  if (rank === 3) return Award
  return null
}

function getRankColor(rank: number): string {
  if (rank === 1) return 'text-yellow-500'
  if (rank === 2) return 'text-gray-400'
  if (rank === 3) return 'text-amber-600'
  return 'text-muted-foreground'
}

function getRankBg(rank: number): string {
  if (rank === 1) return 'bg-yellow-500/15'
  if (rank === 2) return 'bg-gray-400/15'
  if (rank === 3) return 'bg-amber-600/15'
  return ''
}
</script>

<template>
  <div v-if="entries.length === 0" class="py-12 text-center">
    <p class="text-muted-foreground">
      {{ emptyMessage ?? t.shared.leaderboardTable.noStudentsFound }}
    </p>
  </div>

  <div v-else class="divide-y border-y">
    <div
      v-for="entry in entries"
      :key="entry.id"
      class="flex cursor-pointer items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
      :class="[
        getRankBg(entry.rank),
        authStore.user?.id === entry.id && 'border-l-3 border-l-primary',
      ]"
      @click="emit('row-click', entry)"
    >
      <!-- Rank -->
      <div class="flex w-12 items-center justify-center">
        <component
          :is="getRankIcon(entry.rank)"
          v-if="getRankIcon(entry.rank)"
          class="size-6"
          :class="getRankColor(entry.rank)"
        />
        <span v-else class="text-lg font-semibold" :class="getRankColor(entry.rank)">
          {{ entry.rank }}
        </span>
      </div>

      <!-- Avatar -->
      <Avatar class="size-10">
        <AvatarImage :src="getAvatarUrl(entry.avatarPath)" :alt="entry.name" />
        <AvatarFallback>{{ getInitials(entry.name) }}</AvatarFallback>
      </Avatar>

      <!-- Student Info -->
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium">
          {{ entry.name }}
          <Badge v-if="authStore.user?.id === entry.id" variant="secondary" class="ml-2">
            {{ t.shared.leaderboardTable.you }}
          </Badge>
        </p>
        <p class="text-sm text-muted-foreground">{{ entry.gradeLevelName ?? 'N/A' }}</p>
      </div>

      <!-- Stats (via slot) -->
      <slot name="stats" :entry="entry" />
    </div>

    <!-- Current student row if not in top 20 -->
    <template v-if="currentStudentEntry">
      <div class="border-t-2 border-dashed" />
      <div
        class="flex cursor-pointer items-center gap-4 border-l-3 border-l-primary px-6 py-4 transition-colors hover:bg-muted/50"
        @click="currentStudentEntry && emit('row-click', currentStudentEntry)"
      >
        <!-- Rank -->
        <div class="flex w-12 items-center justify-center">
          <span class="text-lg font-semibold text-muted-foreground">
            {{ currentStudentEntry.rank }}
          </span>
        </div>

        <!-- Avatar -->
        <Avatar class="size-10">
          <AvatarImage
            :src="getAvatarUrl(currentStudentEntry.avatarPath)"
            :alt="currentStudentEntry.name"
          />
          <AvatarFallback>{{ getInitials(currentStudentEntry.name) }}</AvatarFallback>
        </Avatar>

        <!-- Student Info -->
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">
            {{ currentStudentEntry.name }}
            <Badge variant="secondary" class="ml-2">{{ t.shared.leaderboardTable.you }}</Badge>
          </p>
          <p class="text-sm text-muted-foreground">
            {{ currentStudentEntry.gradeLevelName ?? 'N/A' }}
          </p>
        </div>

        <!-- Stats (via slot) -->
        <slot name="current-student-stats" :entry="currentStudentEntry" />
      </div>
    </template>
  </div>
</template>
