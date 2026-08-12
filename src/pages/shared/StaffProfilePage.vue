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
import { Mail, Calendar, Pencil, Camera, Shield, Building2 } from 'lucide-vue-next'
import { useT } from '@/composables/useT'

const t = useT()
const authStore = useAuthStore()
const { isSaving, userInitials, formattedDateJoined, userAvatarUrl, saveAvatar, saveName } =
  useProfileEditor()

const showAvatarDialog = ref(false)
const showEditNameDialog = ref(false)

/** Manager and teacher share this page; the role label follows the account. */
const roleLabel = computed(() =>
  authStore.isManager
    ? t.value.shared.pages.staffProfile.roles.manager
    : t.value.shared.pages.staffProfile.roles.teacher,
)

const organizationName = computed(
  () => authStore.user?.organizationName ?? t.value.shared.pages.staffProfile.noOrganization,
)

async function handleAvatarSave(payload: { file: File | null; previewUrl: string }) {
  const success = await saveAvatar(payload.file, payload.previewUrl)
  if (success) showAvatarDialog.value = false
}

async function handleNameSave(name: string) {
  const success = await saveName(name)
  if (success) showEditNameDialog.value = false
}
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold">{{ t.shared.pages.staffProfile.title }}</h1>
      <p class="text-muted-foreground">{{ t.shared.pages.staffProfile.subtitle }}</p>
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
            <Badge variant="default" class="text-sm">
              <Shield class="mr-1 size-3" />
              {{ roleLabel }}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <!-- Details Card -->
      <Card class="lg:col-span-2">
        <CardHeader>
          <CardTitle>{{ t.shared.pages.staffProfile.accountDetails }}</CardTitle>
          <CardDescription>{{ t.shared.pages.staffProfile.accountDetailsDesc }}</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <!-- Email -->
          <div class="flex items-center gap-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Mail class="size-5 text-muted-foreground" />
            </div>
            <div class="flex-1">
              <p class="text-sm text-muted-foreground">
                {{ t.shared.pages.staffProfile.emailAddress }}
              </p>
              <p class="font-medium">{{ authStore.user?.email }}</p>
            </div>
          </div>

          <!-- Organization -->
          <div class="flex items-center gap-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Building2 class="size-5 text-muted-foreground" />
            </div>
            <div class="flex-1">
              <p class="text-sm text-muted-foreground">
                {{ t.shared.pages.staffProfile.organization }}
              </p>
              <p class="font-medium">{{ organizationName }}</p>
            </div>
          </div>

          <!-- Role -->
          <div class="flex items-center gap-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Shield class="size-5 text-muted-foreground" />
            </div>
            <div class="flex-1">
              <p class="text-sm text-muted-foreground">{{ t.shared.pages.staffProfile.role }}</p>
              <p class="font-medium">{{ roleLabel }}</p>
            </div>
          </div>

          <!-- Date Joined -->
          <div class="flex items-center gap-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Calendar class="size-5 text-muted-foreground" />
            </div>
            <div class="flex-1">
              <p class="text-sm text-muted-foreground">
                {{ t.shared.pages.staffProfile.memberSince }}
              </p>
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
  </div>
</template>
