<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useFriendsStore, FRIEND_CAP } from '@/stores/friends'
import { getAvatarUrl } from '@/lib/storage'
import { formatRelativeDate } from '@/lib/date'
import { getInitials } from '@/lib/utils'
import { toast } from 'vue-sonner'
import { CirclePoundSterling, UserMinus, Loader2, Users } from 'lucide-vue-next'
import heartGif from '@/assets/icons/heart.gif'
import type { Friend } from '@/stores/friends'
import FriendProfileDialog from './FriendProfileDialog.vue'
import RemoveFriendDialog from './RemoveFriendDialog.vue'

const friendsStore = useFriendsStore()
const sendingTo = ref<string | null>(null)
const removingFriend = ref<{ friendshipId: string; name: string } | null>(null)
const showProfileDialog = ref(false)
const selectedFriend = ref<Friend | null>(null)

function handleFriendClick(friend: Friend) {
  selectedFriend.value = friend
  showProfileDialog.value = true
}

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
  <div v-if="friendsStore.isLoading" class="flex items-center justify-center py-12">
    <Loader2 class="size-8 animate-spin text-muted-foreground" />
  </div>

  <Card v-else>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Users class="size-5" />
        My Friends
        <Badge variant="secondary" class="ml-2">
          {{ friendsStore.friendCount }}/{{ FRIEND_CAP }}
        </Badge>
      </CardTitle>
    </CardHeader>
    <CardContent class="p-0">
      <div v-if="friendsStore.friends.length === 0" class="py-8 text-center">
        <Users class="mx-auto size-12 text-muted-foreground/50" />
        <p class="mt-2 text-sm text-muted-foreground">No friends yet</p>
        <p class="text-xs text-muted-foreground">Add some from the "Add Friend" tab!</p>
      </div>

      <div v-else class="divide-y border-t">
        <div
          v-for="friend in friendsStore.friends"
          :key="friend.friendshipId"
          class="flex cursor-pointer items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
          @click="handleFriendClick(friend)"
        >
          <Avatar class="size-10">
            <AvatarImage :src="getAvatarUrl(friend.avatarPath)" :alt="friend.name" />
            <AvatarFallback>{{ getInitials(friend.name) }}</AvatarFallback>
          </Avatar>

          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ friend.name }}</p>
            <p class="text-xs text-muted-foreground">
              {{ friend.closenessLabel }}
            </p>
          </div>

          <div class="flex items-start gap-6">
            <div class="w-14 text-center">
              <p class="text-xs text-muted-foreground">Closeness</p>
              <p class="flex h-6 items-center justify-center gap-1 font-semibold">
                <img
                  v-if="friend.closenessXp > 0"
                  :src="heartGif"
                  alt="heart"
                  loading="lazy"
                  class="size-4"
                />
                {{ friend.closenessXp }}
              </p>
            </div>
            <div class="w-14 text-center">
              <p class="text-xs text-muted-foreground">Friendship</p>
              <p class="flex h-6 items-center justify-center font-semibold">
                Lv.{{ friend.closenessLevel }}
              </p>
            </div>
            <div class="w-20 text-center">
              <p class="text-xs text-muted-foreground">Last Active</p>
              <p class="flex h-6 items-center justify-center font-semibold">
                {{ formatRelativeDate(friend.lastActive) }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2" @click.stop>
            <Button v-if="friend.sentToday" size="sm" variant="secondary" disabled>
              <CirclePoundSterling class="size-4" />
              Sent
            </Button>
            <Button
              v-else
              size="sm"
              :disabled="sendingTo === friend.friendshipId"
              @click="handleSendCoins(friend.friendshipId, friend.name)"
            >
              <Loader2 v-if="sendingTo === friend.friendshipId" class="size-4 animate-spin" />
              <CirclePoundSterling v-else class="size-4" />
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
    </CardContent>
  </Card>

  <FriendProfileDialog v-model:open="showProfileDialog" :friend="selectedFriend" />

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
</template>
