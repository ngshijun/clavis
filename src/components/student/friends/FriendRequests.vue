<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useFriendsStore } from '@/stores/friends'
import { getAvatarUrl } from '@/lib/storage'
import { getInitials } from '@/lib/utils'
import { toast } from 'vue-sonner'
import { Check, X, Loader2, Mail, Send } from 'lucide-vue-next'

const friendsStore = useFriendsStore()
const respondingTo = ref<string | null>(null)

async function handleRespond(friendshipId: string, name: string, accept: boolean) {
  respondingTo.value = friendshipId
  const { error } = await friendsStore.respondRequest(friendshipId, accept)
  respondingTo.value = null

  if (error) {
    toast.error(error)
  } else {
    toast.success(accept ? `You and ${name} are now friends!` : `Declined request from ${name}`)
  }
}

async function handleCancel(friendshipId: string) {
  respondingTo.value = friendshipId
  const { error } = await friendsStore.removeFriend(friendshipId)
  respondingTo.value = null

  if (error) {
    toast.error(error)
  } else {
    toast.success('Request cancelled')
  }
}
</script>

<template>
  <div class="space-y-6 pt-4">
    <!-- Received requests -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Mail class="size-5" />
          Received Requests
        </CardTitle>
      </CardHeader>
      <CardContent class="p-0">
        <div v-if="friendsStore.receivedRequests.length === 0" class="py-8 text-center">
          <Mail class="mx-auto size-12 text-muted-foreground/50" />
          <p class="mt-2 text-sm text-muted-foreground">No pending requests</p>
          <p class="text-xs text-muted-foreground">
            When someone sends you a friend request, it will appear here
          </p>
        </div>
        <div v-else class="divide-y border-t">
          <div
            v-for="req in friendsStore.receivedRequests"
            :key="req.friendshipId"
            class="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
          >
            <Avatar class="size-10">
              <AvatarImage :src="getAvatarUrl(req.avatarPath)" :alt="req.name" />
              <AvatarFallback>{{ getInitials(req.name) }}</AvatarFallback>
            </Avatar>

            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ req.name }}</p>
              <p class="text-xs text-muted-foreground">Wants to be your friend</p>
            </div>

            <div class="flex gap-2">
              <Button
                size="sm"
                :disabled="respondingTo === req.friendshipId"
                @click="handleRespond(req.friendshipId, req.name, true)"
              >
                <Loader2 v-if="respondingTo === req.friendshipId" class="size-4 animate-spin" />
                <Check v-else class="size-4" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                :disabled="respondingTo === req.friendshipId"
                @click="handleRespond(req.friendshipId, req.name, false)"
              >
                <X class="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Sent requests -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Send class="size-5" />
          Sent Requests
        </CardTitle>
      </CardHeader>
      <CardContent class="p-0">
        <div v-if="friendsStore.sentRequests.length === 0" class="py-8 text-center">
          <Send class="mx-auto size-12 text-muted-foreground/50" />
          <p class="mt-2 text-sm text-muted-foreground">No sent requests</p>
          <p class="text-xs text-muted-foreground">
            Requests you send will appear here until accepted
          </p>
        </div>
        <div v-else class="divide-y border-t">
          <div
            v-for="req in friendsStore.sentRequests"
            :key="req.friendshipId"
            class="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
          >
            <Avatar class="size-10">
              <AvatarImage :src="getAvatarUrl(req.avatarPath)" :alt="req.name" />
              <AvatarFallback>{{ getInitials(req.name) }}</AvatarFallback>
            </Avatar>

            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ req.name }}</p>
              <p class="text-xs text-muted-foreground">Pending</p>
            </div>

            <Button
              size="sm"
              variant="outline"
              :disabled="respondingTo === req.friendshipId"
              @click="handleCancel(req.friendshipId)"
            >
              Cancel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
