<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePracticeStore, type StudentSubscriptionStatus } from '@/stores/practice'
import { useSubscriptionStore } from '@/stores/subscription'
import { useCurriculumStore } from '@/stores/curriculum'
import { useProfileEditor } from '@/composables/useProfileEditor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'vue-sonner'
import EditAvatarDialog from '@/components/shared/EditAvatarDialog.vue'
import EditNameDialog from '@/components/shared/EditNameDialog.vue'
import EditBirthdayDialog from '@/components/shared/EditBirthdayDialog.vue'
import {
  Cake,
  Mail,
  Calendar,
  GraduationCap,
  Trophy,
  CirclePoundSterling,
  Pencil,
  Camera,
  Loader2,
  Zap,
  Sparkles,
  Crown,
  CreditCard,
  Check,
  RotateCcw,
} from 'lucide-vue-next'
import { useTour } from '@/composables/useTour'

const authStore = useAuthStore()
const practiceStore = usePracticeStore()
const subscriptionStore = useSubscriptionStore()
const curriculumStore = useCurriculumStore()
const { isSaving, userInitials, formattedDateJoined, userAvatarUrl, saveAvatar, saveName } =
  useProfileEditor()
const { resetAndStartTour } = useTour()

// Subscription
const subscriptionStatus = ref<StudentSubscriptionStatus | null>(null)
const isLoadingPlans = ref(false)

function getTierIcon(tier: string) {
  switch (tier) {
    case 'plus':
      return Zap
    case 'pro':
      return Sparkles
    case 'max':
      return Crown
    default:
      return CreditCard
  }
}

// Dialog states
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

const currentGradeName = computed(() => {
  if (!authStore.studentProfile?.gradeLevelId) return 'Not set'
  const grade = curriculumStore.gradeLevels.find(
    (g) => g.id === authStore.studentProfile?.gradeLevelId,
  )
  return grade?.name ?? 'Not set'
})

onMounted(async () => {
  isLoadingPlans.value = true
  await Promise.all([
    curriculumStore.fetchCurriculum(),
    practiceStore.getStudentSubscriptionStatus().then((status) => {
      subscriptionStatus.value = status
    }),
    subscriptionStore.fetchPlans(),
  ]).finally(() => {
    isLoadingPlans.value = false
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

async function handleGradeChange(value: unknown) {
  if (!value || typeof value !== 'string') return

  isSaving.value = true
  try {
    const result = await authStore.updateGradeLevel(value)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Grade level updated successfully')
  } finally {
    isSaving.value = false
  }
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
        <CardContent class="space-y-4">
          <!-- Level Badge -->
          <div class="flex items-center justify-center gap-2">
            <Badge variant="secondary" class="text-sm">
              <Trophy class="mr-1 size-3" />
              Level {{ authStore.currentLevel }}
            </Badge>
            <Badge variant="outline" class="text-sm">
              <CirclePoundSterling class="mr-1 size-3 text-amber-600 dark:text-amber-400" />
              {{ authStore.studentProfile?.coins ?? 0 }} Coins
            </Badge>
          </div>

          <!-- XP Progress -->
          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">XP Progress</span>
              <span>{{ authStore.currentLevelXp }} / {{ authStore.xpToNextLevel }}</span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                class="h-full bg-primary transition-all"
                :style="{ width: `${authStore.xpProgress}%` }"
              />
            </div>
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

          <!-- Grade Level -->
          <div class="flex items-center gap-4">
            <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
              <GraduationCap class="size-5 text-muted-foreground" />
            </div>
            <div class="flex-1">
              <p class="text-sm text-muted-foreground">Grade Level</p>
              <p class="font-medium">{{ currentGradeName }}</p>
            </div>
            <Select
              :model-value="authStore.studentProfile?.gradeLevelId ?? undefined"
              :disabled="isSaving || curriculumStore.isLoading"
              @update:model-value="handleGradeChange"
            >
              <SelectTrigger class="w-[140px]">
                <SelectValue placeholder="Select grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="grade in curriculumStore.gradeLevels"
                  :key="grade.id"
                  :value="grade.id"
                >
                  {{ grade.name }}
                </SelectItem>
              </SelectContent>
            </Select>
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

    <!-- My Plan -->
    <Card>
      <CardHeader>
        <CardTitle>My Plan</CardTitle>
        <CardDescription>See what's included in your plan</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          v-if="isLoadingPlans || !subscriptionStatus"
          class="flex items-center justify-center py-8"
        >
          <Loader2 class="size-6 animate-spin text-muted-foreground" />
        </div>
        <div v-else class="grid gap-4 md:grid-cols-3">
          <div
            v-for="plan in subscriptionStore.visiblePlans"
            :key="plan.id"
            class="relative flex flex-col rounded-lg border p-4"
            :class="[
              subscriptionStatus.tier === plan.id ? 'border-primary bg-muted/50' : 'border-border',
            ]"
          >
            <!-- Current Plan badge -->
            <Badge
              v-if="subscriptionStatus.tier === plan.id"
              class="absolute -top-2 left-1/2 -translate-x-1/2"
            >
              Current Plan
            </Badge>

            <!-- Plan header -->
            <div class="flex items-center gap-2">
              <component :is="getTierIcon(plan.id)" class="size-5 text-primary" />
              <span class="font-semibold">{{ plan.name }}</span>
            </div>

            <!-- Sessions badge -->
            <div class="mt-3">
              <Badge variant="outline">{{ plan.sessionsPerDay }} sessions/day</Badge>
            </div>

            <!-- Features list -->
            <ul class="mt-3 flex-1 space-y-1.5">
              <li
                v-for="(feature, i) in plan.features"
                :key="i"
                class="flex items-start gap-2 text-sm"
              >
                <Check class="mt-0.5 size-4 shrink-0 text-green-500" />
                <span>{{ feature }}</span>
              </li>
            </ul>

            <!-- Footer -->
            <p
              v-if="
                subscriptionStatus.tier !== plan.id &&
                ['core', 'plus', 'pro'].indexOf(plan.id) >
                  ['core', 'plus', 'pro'].indexOf(subscriptionStatus.tier)
              "
              class="mt-3 text-center text-xs text-muted-foreground"
            >
              Ask your parent to upgrade
            </p>
          </div>
        </div>
      </CardContent>
    </Card>

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
