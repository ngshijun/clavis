<script setup lang="ts">
import type { ParentStudentInvitation } from '@/lib/invitations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Mail, Send, Check, X, Clock, Loader2 } from 'lucide-vue-next'
import { formatDate } from '@/lib/date'

const props = withDefaults(
  defineProps<{
    receivedInvitations: ParentStudentInvitation[]
    sentInvitations: ParentStudentInvitation[]
    processingId: string | null
    receivedTitle: string
    sentTitle: string
    getDisplayName: (inv: ParentStudentInvitation) => string
    getDisplayEmail: (inv: ParentStudentInvitation) => string
    getSentEmail: (inv: ParentStudentInvitation) => string
    canAccept?: boolean
  }>(),
  {
    canAccept: true,
  },
)

const emit = defineEmits<{
  accept: [id: string]
  reject: [id: string]
  cancel: [id: string]
}>()
</script>

<template>
  <!-- Received Invitations Card -->
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Mail class="size-5" />
        {{ receivedTitle }}
        <Badge v-if="receivedInvitations.length > 0" variant="secondary">
          {{ receivedInvitations.length }}
        </Badge>
      </CardTitle>
    </CardHeader>
    <CardContent class="p-0">
      <div v-if="receivedInvitations.length === 0" class="py-8 text-center">
        <Mail class="mx-auto size-12 text-muted-foreground/50" />
        <p class="mt-2 text-sm text-muted-foreground">No pending invitations</p>
      </div>
      <div v-else class="divide-y border-t">
        <div
          v-for="invitation in receivedInvitations"
          :key="invitation.id"
          class="px-6 py-4 transition-colors hover:bg-muted/50"
        >
          <div class="flex items-start justify-between">
            <div>
              <p class="font-medium">{{ props.getDisplayName(invitation) }}</p>
              <p class="text-sm text-muted-foreground">{{ props.getDisplayEmail(invitation) }}</p>
              <p class="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock class="size-3" />
                {{ formatDate(invitation.createdAt) }}
              </p>
            </div>
            <Badge variant="outline">Pending</Badge>
          </div>
          <div class="mt-3 flex gap-2">
            <Button
              size="sm"
              :disabled="processingId === invitation.id || !canAccept"
              @click="emit('accept', invitation.id)"
            >
              <Loader2 v-if="processingId === invitation.id" class="mr-1 size-4 animate-spin" />
              <Check v-else class="mr-1 size-4" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              :disabled="processingId === invitation.id"
              @click="emit('reject', invitation.id)"
            >
              <X class="mr-1 size-4" />
              Decline
            </Button>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Sent Invitations Card -->
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Send class="size-5" />
        {{ sentTitle }}
        <Badge v-if="sentInvitations.length > 0" variant="secondary">
          {{ sentInvitations.length }}
        </Badge>
      </CardTitle>
    </CardHeader>
    <CardContent class="p-0">
      <div v-if="sentInvitations.length === 0" class="py-8 text-center">
        <Send class="mx-auto size-12 text-muted-foreground/50" />
        <p class="mt-2 text-sm text-muted-foreground">No pending invitations</p>
      </div>
      <div v-else class="divide-y border-t">
        <div
          v-for="invitation in sentInvitations"
          :key="invitation.id"
          class="px-6 py-4 transition-colors hover:bg-muted/50"
        >
          <div class="flex items-start justify-between">
            <div>
              <p class="font-medium">{{ props.getSentEmail(invitation) }}</p>
              <p class="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock class="size-3" />
                Sent on {{ formatDate(invitation.createdAt) }}
              </p>
            </div>
            <Badge variant="outline">Pending</Badge>
          </div>
          <div class="mt-3">
            <AlertDialog>
              <AlertDialogTrigger as-child>
                <Button
                  size="sm"
                  variant="outline"
                  class="text-destructive hover:text-destructive"
                  :disabled="processingId === invitation.id"
                >
                  <Loader2 v-if="processingId === invitation.id" class="mr-1 size-4 animate-spin" />
                  <X v-else class="mr-1 size-4" />
                  Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to cancel this invitation to
                    {{ props.getSentEmail(invitation) }}?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep</AlertDialogCancel>
                  <AlertDialogAction
                    class="bg-destructive text-white hover:bg-destructive/90"
                    @click="emit('cancel', invitation.id)"
                  >
                    Cancel Invitation
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
