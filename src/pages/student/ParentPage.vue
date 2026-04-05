<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useParentLinkStore } from '@/stores/parent-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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

const parentLinkStore = useParentLinkStore()

const inviteDialogOpen = ref(false)
const inviteSuccess = ref(false)
const isSending = ref(false)
const processingInvitationId = ref<string | null>(null)
const removingParentId = ref<string | null>(null)
const inviteDialogRef = ref<InstanceType<typeof InviteDialog> | null>(null)

// Fetch data on mount
onMounted(async () => {
  await parentLinkStore.fetchAll()
  await parentLinkStore.fetchActiveSubscribers()
})

async function handleInviteSubmit(email: string) {
  inviteSuccess.value = false
  isSending.value = true

  try {
    const result = await parentLinkStore.sendInvitation(email)
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
  processingInvitationId.value = invitationId
  try {
    const result = await parentLinkStore.acceptInvitation(invitationId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Invitation accepted!')
    }
  } finally {
    processingInvitationId.value = null
  }
}

async function handleRejectInvitation(invitationId: string) {
  processingInvitationId.value = invitationId
  try {
    const result = await parentLinkStore.rejectInvitation(invitationId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.info('Invitation declined')
    }
  } finally {
    processingInvitationId.value = null
  }
}

async function handleCancelInvitation(invitationId: string) {
  processingInvitationId.value = invitationId
  try {
    const result = await parentLinkStore.cancelInvitation(invitationId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.info('Invitation cancelled')
    }
  } finally {
    processingInvitationId.value = null
  }
}

async function handleRemoveParent(parentId: string) {
  removingParentId.value = parentId
  try {
    const result = await parentLinkStore.removeLinkedParent(parentId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.info('Parent removed')
    }
  } finally {
    removingParentId.value = null
  }
}
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Header with Invite Button -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Parent</h1>
        <p class="text-muted-foreground">Manage your linked parents and invitations</p>
      </div>
      <InviteDialog
        ref="inviteDialogRef"
        v-model:open="inviteDialogOpen"
        entity-label="Parent"
        :is-sending="isSending"
        :invite-success="inviteSuccess"
        :trigger-disabled="parentLinkStore.isLoading || parentLinkStore.hasLinkedParent"
        @submit="handleInviteSubmit"
        @reset="inviteSuccess = false"
      >
        <template #description>
          Send an invitation to link a parent account. They will be able to view your progress.
        </template>
      </InviteDialog>
    </div>

    <!-- Loading State -->
    <div v-if="parentLinkStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Linked Parents Card -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Users class="size-5" />
            Linked Parents
          </CardTitle>
        </CardHeader>
        <CardContent class="p-0">
          <div v-if="parentLinkStore.linkedParents.length === 0" class="py-8 text-center">
            <Users class="mx-auto size-12 text-muted-foreground/50" />
            <p class="mt-2 text-sm text-muted-foreground">No linked parents yet</p>
            <p class="text-xs text-muted-foreground">Invite a parent to get started</p>
          </div>
          <div v-else class="divide-y border-t">
            <div
              v-for="parent in parentLinkStore.linkedParents"
              :key="parent.id"
              class="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
            >
              <Avatar>
                <AvatarFallback>{{ getInitials(parent.name) }}</AvatarFallback>
              </Avatar>
              <div class="flex-1">
                <p class="font-medium">{{ parent.name }}</p>
                <p class="text-sm text-muted-foreground">{{ parent.email }}</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="text-destructive hover:text-destructive"
                    :disabled="removingParentId === parent.id"
                  >
                    <Loader2 v-if="removingParentId === parent.id" class="size-4 animate-spin" />
                    <Trash2 v-else class="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Parent</AlertDialogTitle>
                    <AlertDialogDescription
                      v-if="parentLinkStore.hasActivePaidSubscription(parent.id)"
                    >
                      You have an active paid subscription managed by {{ parent.name }}. Please ask
                      them to cancel the subscription before unlinking.
                    </AlertDialogDescription>
                    <AlertDialogDescription v-else>
                      Are you sure you want to remove {{ parent.name }} from your linked parents?
                      They will no longer be able to view your progress.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel v-if="parentLinkStore.hasActivePaidSubscription(parent.id)">
                      Close
                    </AlertDialogCancel>
                    <template v-else>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        class="bg-destructive text-white hover:bg-destructive/90"
                        @click="handleRemoveParent(parent.id)"
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
        :received-invitations="parentLinkStore.receivedInvitations"
        :sent-invitations="parentLinkStore.sentInvitations"
        :processing-id="processingInvitationId"
        received-title="Invitations from Parents"
        sent-title="Sent Invitations"
        :get-display-name="(inv) => inv.parentName || inv.parentEmail"
        :get-display-email="(inv) => inv.parentEmail"
        :get-sent-email="(inv) => inv.parentEmail"
        :can-accept="!parentLinkStore.hasLinkedParent"
        @accept="handleAcceptInvitation"
        @reject="handleRejectInvitation"
        @cancel="handleCancelInvitation"
      />
    </template>
  </div>
</template>
