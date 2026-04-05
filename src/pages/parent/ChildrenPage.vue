<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useChildLinkStore } from '@/stores/child-link'
import { getAvatarUrl } from '@/lib/storage'
import { useSubscriptionStore } from '@/stores/subscription'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import InviteDialog from '@/components/shared/InviteDialog.vue'
import InvitationCards from '@/components/shared/InvitationCards.vue'
import { Users, Trash2, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { getInitials } from '@/lib/utils'

const childLinkStore = useChildLinkStore()
const subscriptionStore = useSubscriptionStore()

function hasActivePaidSubscription(childId: string): boolean {
  const sub = subscriptionStore.getChildSubscription(childId)
  return sub.isActive && sub.tier !== 'core'
}

const inviteDialogOpen = ref(false)
const inviteSuccess = ref(false)
const isSending = ref(false)
const actionInProgress = ref<string | null>(null)
const inviteDialogRef = ref<InstanceType<typeof InviteDialog> | null>(null)

onMounted(async () => {
  await childLinkStore.fetchAll()
})

async function handleInviteSubmit(email: string) {
  inviteSuccess.value = false
  isSending.value = true

  try {
    const result = await childLinkStore.sendInvitation(email)
    if (result.error) {
      inviteDialogRef.value?.setFieldError('email', result.error)
    } else {
      inviteSuccess.value = true
      toast.success('Invitation sent successfully!')
      setTimeout(() => {
        inviteSuccess.value = false
        inviteDialogOpen.value = false
      }, 1500)
    }
  } finally {
    isSending.value = false
  }
}

async function handleAcceptInvitation(invitationId: string) {
  actionInProgress.value = invitationId
  const result = await childLinkStore.acceptInvitation(invitationId)
  actionInProgress.value = null
  if (result.error) {
    toast.error(result.error)
  } else {
    toast.success('Child linked successfully!')
  }
}

async function handleRejectInvitation(invitationId: string) {
  actionInProgress.value = invitationId
  const result = await childLinkStore.rejectInvitation(invitationId)
  actionInProgress.value = null
  if (result.error) {
    toast.error(result.error)
  } else {
    toast.success('Invitation declined')
  }
}

async function handleCancelInvitation(invitationId: string) {
  actionInProgress.value = invitationId
  const result = await childLinkStore.cancelInvitation(invitationId)
  actionInProgress.value = null
  if (result.error) {
    toast.error(result.error)
  } else {
    toast.success('Invitation cancelled')
  }
}

async function handleRemoveChild(childId: string) {
  actionInProgress.value = childId
  const { error } = await childLinkStore.removeLinkedChild(childId)
  actionInProgress.value = null
  if (error) {
    toast.error(error)
  } else {
    toast.info('Child removed')
  }
}
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Header with Invite Button -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Children</h1>
        <p class="text-muted-foreground">Manage your linked children and invitations</p>
      </div>
      <InviteDialog
        ref="inviteDialogRef"
        v-model:open="inviteDialogOpen"
        entity-label="Child"
        :is-sending="isSending"
        :invite-success="inviteSuccess"
        :trigger-disabled="childLinkStore.isLoading"
        @submit="handleInviteSubmit"
        @reset="inviteSuccess = false"
      >
        <template #description>
          Send an invitation to link a child's account. You will be able to view their progress.
        </template>
      </InviteDialog>
    </div>

    <!-- Loading State -->
    <div v-if="childLinkStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Linked Children Card -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Users class="size-5" />
            Linked Children
          </CardTitle>
          <CardDescription>Children whose progress you can view</CardDescription>
        </CardHeader>
        <CardContent class="p-0">
          <div v-if="childLinkStore.linkedChildren.length === 0" class="py-8 text-center">
            <Users class="mx-auto size-12 text-muted-foreground/50" />
            <p class="mt-2 text-sm text-muted-foreground">No linked children yet</p>
            <p class="text-xs text-muted-foreground">Invite a child to get started</p>
          </div>
          <div v-else class="divide-y border-t">
            <div
              v-for="child in childLinkStore.linkedChildren"
              :key="child.id"
              class="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
            >
              <Avatar class="mx-2 size-12">
                <AvatarImage :src="getAvatarUrl(child.avatarPath)" :alt="child.name" />
                <AvatarFallback>{{ getInitials(child.name) }}</AvatarFallback>
              </Avatar>
              <div class="flex-1">
                <p class="font-medium">{{ child.name }}</p>
                <p class="text-sm text-muted-foreground">{{ child.email }}</p>
                <Badge v-if="child.gradeLevelName" variant="outline" class="mt-1">
                  {{ child.gradeLevelName }}
                </Badge>
              </div>
              <AlertDialog>
                <AlertDialogTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="text-destructive hover:text-destructive"
                    :disabled="actionInProgress === child.id"
                  >
                    <Loader2 v-if="actionInProgress === child.id" class="size-4 animate-spin" />
                    <Trash2 v-else class="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Child</AlertDialogTitle>
                    <AlertDialogDescription v-if="hasActivePaidSubscription(child.id)">
                      {{ child.name }} has an active paid subscription. You must cancel the
                      subscription before unlinking this child.
                    </AlertDialogDescription>
                    <AlertDialogDescription v-else>
                      Are you sure you want to remove {{ child.name }} from your linked children?
                      You will no longer be able to view their progress.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel v-if="hasActivePaidSubscription(child.id)">
                      Close
                    </AlertDialogCancel>
                    <template v-else>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        class="bg-destructive text-white hover:bg-destructive/90"
                        @click="handleRemoveChild(child.id)"
                      >
                        Remove
                      </AlertDialogAction>
                    </template>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>

      <InvitationCards
        :received-invitations="childLinkStore.receivedInvitations"
        :sent-invitations="childLinkStore.sentInvitations"
        :processing-id="actionInProgress"
        received-title="Invitations from Children"
        received-description="Children who want to link with you"
        sent-title="Sent Invitations"
        sent-description="Invitations you've sent to children"
        :get-display-name="(inv) => inv.studentName || inv.studentEmail"
        :get-display-email="(inv) => inv.studentEmail"
        :get-sent-email="(inv) => inv.studentEmail"
        @accept="handleAcceptInvitation"
        @reject="handleRejectInvitation"
        @cancel="handleCancelInvitation"
      />
    </template>
  </div>
</template>
