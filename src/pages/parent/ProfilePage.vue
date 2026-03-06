<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useProfileEditor } from '@/composables/useProfileEditor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import EditAvatarDialog from '@/components/shared/EditAvatarDialog.vue'
import EditNameDialog from '@/components/shared/EditNameDialog.vue'
import EditBirthdayDialog from '@/components/shared/EditBirthdayDialog.vue'
import { Mail, Calendar, Pencil, Camera, Baby, Cake, RotateCcw } from 'lucide-vue-next'
import { useTour } from '@/composables/useTour'
import { toast } from 'vue-sonner'

const authStore = useAuthStore()
const { isSaving, userInitials, formattedDateJoined, userAvatarUrl, saveAvatar, saveName } =
  useProfileEditor()
const { resetAndStartTour } = useTour()

const showAvatarDialog = ref(false)
const showEditNameDialog = ref(false)
const showEditBirthdayDialog = ref(false)

const age = computed(() => {
  if (!authStore.user?.dateOfBirth) return null
  const now = new Date()
  const birthDate = new Date(authStore.user.dateOfBirth)
  let years = now.getFullYear() - birthDate.getFullYear()
  const monthDiff = now.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    years--
  }
  return years
})

const formattedBirthday = computed(() => {
  if (!authStore.user?.dateOfBirth) return null
  return new Date(authStore.user.dateOfBirth).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
})

async function handleAvatarSave(payload: { file: File | null; previewUrl: string }) {
  const success = await saveAvatar(payload.file, payload.previewUrl)
  if (success) showAvatarDialog.value = false
}

async function handleNameSave(name: string) {
  const success = await saveName(name)
  if (success) showEditNameDialog.value = false
}

async function handleBirthdaySave(dateString: string | null) {
  isSaving.value = true
  try {
    const result = await authStore.updateDateOfBirth(dateString)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Birthday updated successfully')
    showEditBirthdayDialog.value = false
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-bold">My Profile</h1>
        <p class="text-muted-foreground">Manage your account settings and preferences</p>
      </div>
      <Button variant="outline" size="sm" @click="resetAndStartTour">
        <RotateCcw class="mr-2 size-4" />
        Restart Tour
      </Button>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
      <!-- Profile Card -->
      <Card class="lg:col-span-1">
        <CardHeader class="text-center">
          <div class="relative mx-auto">
            <Avatar class="size-24">
              <AvatarImage :src="userAvatarUrl" :alt="authStore.user?.name ?? ''" />
              <AvatarFallback class="text-2xl">{{ userInitials }}</AvatarFallback>
            </Avatar>
            <Button
              size="icon"
              variant="secondary"
              class="absolute -bottom-1 -right-1 size-8 rounded-full"
              @click="showAvatarDialog = true"
            >
              <Camera class="size-4" />
            </Button>
          </div>
          <CardTitle class="mt-4 flex min-w-0 items-center justify-center gap-2">
            <span class="min-w-0 truncate">{{ authStore.user?.name }}</span>
            <Button
              size="icon"
              variant="ghost"
              class="size-6 shrink-0"
              @click="showEditNameDialog = true"
            >
              <Pencil class="size-3" />
            </Button>
          </CardTitle>
          <CardDescription class="truncate">{{ authStore.user?.email }}</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex items-center justify-center">
            <Badge variant="secondary" class="text-sm">
              <Baby class="mr-1 size-3" />
              Parent Account
            </Badge>
          </div>
        </CardContent>
      </Card>

      <!-- Details Card -->
      <Card class="lg:col-span-2">
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>Your personal information</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <!-- Email -->
          <div class="flex items-center gap-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Mail class="size-5 text-muted-foreground" />
            </div>
            <div class="flex-1">
              <p class="text-sm text-muted-foreground">Email Address</p>
              <p class="font-medium">{{ authStore.user?.email }}</p>
            </div>
          </div>

          <!-- Birthday -->
          <div class="flex items-center gap-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Cake class="size-5 text-muted-foreground" />
            </div>
            <div class="flex-1">
              <p class="text-sm text-muted-foreground">Birthday</p>
              <p class="font-medium">
                <template v-if="formattedBirthday">
                  {{ formattedBirthday }}
                  <span class="text-muted-foreground">({{ age }} years old)</span>
                </template>
                <template v-else>Not set</template>
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              class="size-8"
              @click="showEditBirthdayDialog = true"
            >
              <Pencil class="size-4" />
            </Button>
          </div>

          <!-- Date Joined -->
          <div class="flex items-center gap-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Calendar class="size-5 text-muted-foreground" />
            </div>
            <div class="flex-1">
              <p class="text-sm text-muted-foreground">Member Since</p>
              <p class="font-medium">{{ formattedDateJoined }}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <EditAvatarDialog
      v-model:open="showAvatarDialog"
      :current-avatar-url="userAvatarUrl"
      :user-initials="userInitials"
      :is-saving="isSaving"
      @save="handleAvatarSave"
    />

    <EditNameDialog
      v-model:open="showEditNameDialog"
      :current-name="authStore.user?.name ?? ''"
      :is-saving="isSaving"
      @save="handleNameSave"
    />

    <EditBirthdayDialog
      v-model:open="showEditBirthdayDialog"
      :current-date-of-birth="authStore.user?.dateOfBirth ?? null"
      :is-saving="isSaving"
      @save="handleBirthdaySave"
    />
  </div>
</template>
