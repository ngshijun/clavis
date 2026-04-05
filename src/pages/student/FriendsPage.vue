<script setup lang="ts">
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useFriendsStore } from '@/stores/friends'
import { useLocalStorage } from '@vueuse/core'
import { CirclePoundSterling, Handshake, Heart, TrendingDown, X } from 'lucide-vue-next'
import FriendList from '@/components/student/friends/FriendList.vue'
import FriendRequests from '@/components/student/friends/FriendRequests.vue'
import AddFriend from '@/components/student/friends/AddFriend.vue'

const friendsStore = useFriendsStore()
const bannerDismissed = useLocalStorage('friends_how_it_works_dismissed', false)
</script>

<template>
  <div class="space-y-6 p-6">
    <div>
      <h1 class="text-2xl font-bold">Friends</h1>
      <p class="text-muted-foreground">Manage your friends and send daily coins</p>
    </div>

    <div
      v-if="!bannerDismissed"
      class="relative overflow-hidden rounded-lg border border-purple-500/20 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-purple-500/10 p-4"
    >
      <button
        class="absolute right-2 top-2 rounded-full p-1 opacity-50 transition-opacity hover:opacity-100"
        @click="bannerDismissed = true"
      >
        <X class="size-4" />
        <span class="sr-only">Dismiss</span>
      </button>
      <h3 class="mb-3 pr-6 font-bold">How It Works</h3>
      <div class="grid gap-2 text-sm sm:grid-cols-2">
        <div class="flex items-center gap-2">
          <CirclePoundSterling class="size-4 shrink-0 text-amber-500" />
          <span>Send 5 free coins to each friend daily</span>
        </div>
        <div class="flex items-center gap-2">
          <Heart class="size-4 shrink-0 text-pink-500" />
          <span>Both send coins on the same day to grow closeness</span>
        </div>
        <div class="flex items-center gap-2">
          <Handshake class="size-4 shrink-0 text-purple-500" />
          <span>Closeness builds your friendship level</span>
        </div>
        <div class="flex items-center gap-2">
          <TrendingDown class="size-4 shrink-0 text-rose-500" />
          <span>Closeness slowly decreases if you stop sending</span>
        </div>
      </div>
    </div>

    <Tabs default-value="friends">
      <TabsList class="w-full">
        <TabsTrigger value="friends" class="flex-1 gap-1.5">
          My Friends
          <Badge variant="secondary" class="ml-1 size-5 justify-center rounded-full p-0 text-xs">
            {{ friendsStore.friendCount }}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="requests" class="flex-1 gap-1.5">
          Requests
          <Badge
            v-if="friendsStore.pendingRequestCount > 0"
            variant="default"
            class="ml-1 size-5 justify-center rounded-full p-0 text-xs"
          >
            {{ friendsStore.pendingRequestCount }}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="add" class="flex-1">Add Friend</TabsTrigger>
      </TabsList>

      <TabsContent value="friends">
        <FriendList />
      </TabsContent>
      <TabsContent value="requests">
        <FriendRequests />
      </TabsContent>
      <TabsContent value="add">
        <AddFriend />
      </TabsContent>
    </Tabs>
  </div>
</template>
