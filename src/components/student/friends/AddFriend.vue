<script setup lang="ts">
import { computed, ref } from 'vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFriendsStore } from '@/stores/friends'
import { useFriendSearch } from '@/composables/useFriendSearch'
import { useAuthStore } from '@/stores/auth'
import { getAvatarUrl } from '@/lib/storage'
import { getInitials } from '@/lib/utils'
import { toast } from 'vue-sonner'
import { Search, Copy, Loader2, UserPlus, SearchX } from 'lucide-vue-next'

const authStore = useAuthStore()
const friendsStore = useFriendsStore()
const { searchTerm, results, isSearching } = useFriendSearch()
const sendingTo = ref<string | null>(null)

const friendCode = computed(() => authStore.studentProfile?.friendCode ?? '')

// Exclude existing friends and pending requests from search results
const existingIds = computed(() => {
  const ids = new Set<string>()
  for (const f of friendsStore.friends) ids.add(f.friendId)
  for (const r of friendsStore.receivedRequests) ids.add(r.studentId)
  for (const r of friendsStore.sentRequests) ids.add(r.studentId)
  return ids
})

const filteredResults = computed(() => results.value.filter((r) => !existingIds.value.has(r.id)))

async function handleSendRequest(targetId: string, name: string) {
  sendingTo.value = targetId
  const { error } = await friendsStore.sendRequest(targetId)
  sendingTo.value = null

  if (error) {
    toast.error(error)
  } else {
    toast.success(`Friend request sent to ${name}!`)
  }
}

async function copyFriendCode() {
  try {
    await navigator.clipboard.writeText(friendCode.value)
    toast.success('Friend code copied!')
  } catch {
    toast.error('Failed to copy')
  }
}
</script>

<template>
  <div class="space-y-4 pt-4">
    <!-- Own friend code -->
    <div
      class="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3"
    >
      <div>
        <p class="text-xs text-muted-foreground">Your friend code</p>
        <p class="font-mono text-lg font-bold tracking-widest text-primary">{{ friendCode }}</p>
      </div>
      <Button size="sm" variant="outline" @click="copyFriendCode">
        <Copy class="size-4" />
        Copy
      </Button>
    </div>

    <!-- Search input -->
    <div class="relative">
      <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        v-model="searchTerm"
        placeholder="Search by name or friend code (e.g. ABCD-1234)"
        class="pl-9"
      />
    </div>

    <p v-if="friendsStore.isFriendCapReached" class="text-sm text-destructive">
      Friend limit reached ({{ friendsStore.FRIEND_CAP }}/{{ friendsStore.FRIEND_CAP }}). Remove a
      friend to add new ones.
    </p>

    <!-- Search results -->
    <div v-if="isSearching" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="searchTerm && filteredResults.length === 0" class="py-8 text-center">
      <SearchX class="mx-auto size-12 text-muted-foreground/50" />
      <p class="mt-2 text-sm text-muted-foreground">No students found</p>
      <p class="text-xs text-muted-foreground">Try a different name or friend code</p>
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="student in filteredResults"
        :key="student.id"
        class="flex items-center gap-3 rounded-lg border p-3"
      >
        <Avatar class="size-10">
          <AvatarImage :src="getAvatarUrl(student.avatarPath)" :alt="student.name" />
          <AvatarFallback>{{ getInitials(student.name) }}</AvatarFallback>
        </Avatar>

        <p class="flex-1 truncate font-medium">{{ student.name }}</p>

        <Button
          size="sm"
          :disabled="friendsStore.isFriendCapReached || sendingTo === student.id"
          @click="handleSendRequest(student.id, student.name)"
        >
          <Loader2 v-if="sendingTo === student.id" class="size-4 animate-spin" />
          <UserPlus v-else class="size-4" />
          Add
        </Button>
      </div>
    </div>
  </div>
</template>
