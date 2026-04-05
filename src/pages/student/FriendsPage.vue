<script setup lang="ts">
import { onMounted } from 'vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useFriendsStore } from '@/stores/friends'
import FriendList from '@/components/student/friends/FriendList.vue'
import FriendRequests from '@/components/student/friends/FriendRequests.vue'
import AddFriend from '@/components/student/friends/AddFriend.vue'

const friendsStore = useFriendsStore()

onMounted(async () => {
  await Promise.all([friendsStore.fetchFriends(), friendsStore.fetchRequests()])
})
</script>

<template>
  <div class="space-y-6 p-6">
    <div>
      <h1 class="text-2xl font-bold">Friends</h1>
      <p class="text-muted-foreground">Manage your friends and send daily coins</p>
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
