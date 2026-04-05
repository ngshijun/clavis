<script setup lang="ts">
import { ref } from 'vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useFriendsStore } from '@/stores/friends'
import { getAvatarUrl } from '@/lib/storage'
import { getInitials } from '@/lib/utils'
import { toast } from 'vue-sonner'
import { Coins, UserMinus, Loader2, Users } from 'lucide-vue-next'
import RemoveFriendDialog from './RemoveFriendDialog.vue'

const friendsStore = useFriendsStore()
const sendingTo = ref<string | null>(null)
const removingFriend = ref<{ friendshipId: string; name: string } | null>(null)

async function handleSendCoins(friendshipId: string, friendName: string) {
  sendingTo.value = friendshipId
  const { error } = await friendsStore.sendCoins(friendshipId)
  sendingTo.value = null

  if (error) {
    toast.error(error)
  } else {
    toast.success(`Sent 5 coins to ${friendName}!`)
  }
}

async function handleRemove() {
  if (!removingFriend.value) return
  const { friendshipId, name } = removingFriend.value
  const { error } = await friendsStore.removeFriend(friendshipId)
  removingFriend.value = null

  if (error) {
    toast.error(error)
  } else {
    toast.success(`Removed ${name} from friends`)
  }
}
</script>

<template>
  <div class="space-y-3 pt-4">
    <p class="text-sm text-muted-foreground">
      {{ friendsStore.friendCount }}/{{ friendsStore.FRIEND_CAP }} friends
    </p>

    <div v-if="friendsStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="friendsStore.friends.length === 0" class="py-8 text-center">
      <Users class="mx-auto size-12 text-muted-foreground/50" />
      <p class="mt-2 text-sm text-muted-foreground">No friends yet</p>
      <p class="text-xs text-muted-foreground">Add some from the "Add Friend" tab!</p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="friend in friendsStore.friends"
        :key="friend.friendshipId"
        class="flex items-center gap-3 rounded-lg border p-3"
      >
        <Avatar class="size-10">
          <AvatarImage :src="getAvatarUrl(friend.avatarPath)" :alt="friend.name" />
          <AvatarFallback>{{ getInitials(friend.name) }}</AvatarFallback>
        </Avatar>

        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">{{ friend.name }}</p>
          <p class="text-xs text-muted-foreground">
            Lv.{{ friend.closenessLevel }} {{ friend.closenessLabel }}
          </p>
        </div>

        <div class="flex gap-2">
          <Button v-if="friend.sentToday" size="sm" variant="secondary" disabled> Sent </Button>
          <Button
            v-else
            size="sm"
            :disabled="sendingTo === friend.friendshipId"
            @click="handleSendCoins(friend.friendshipId, friend.name)"
          >
            <Loader2 v-if="sendingTo === friend.friendshipId" class="size-4 animate-spin" />
            <Coins v-else class="size-4" />
            Send
          </Button>

          <Button
            size="icon-sm"
            variant="ghost"
            @click="removingFriend = { friendshipId: friend.friendshipId, name: friend.name }"
          >
            <UserMinus class="size-4" />
          </Button>
        </div>
      </div>
    </div>

    <RemoveFriendDialog
      :open="removingFriend !== null"
      :friend-name="removingFriend?.name ?? ''"
      @update:open="
        (val: boolean) => {
          if (!val) removingFriend = null
        }
      "
      @confirm="handleRemove"
    />
  </div>
</template>
