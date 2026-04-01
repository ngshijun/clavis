<script setup lang="ts">
import { ref, shallowRef, computed, onMounted } from 'vue'
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
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { type DateValue, getLocalTimeZone, today, parseDate } from '@internationalized/date'
import { createYearRange } from 'reka-ui/date'
import {
  Cake,
  Mail,
  Calendar,
  GraduationCap,
  Languages,
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
  School,
  ChevronsUpDown,
} from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { SCHOOL_NOT_LISTED_ID } from '@/lib/constants'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTour } from '@/composables/useTour'

const authStore = useAuthStore()
const practiceStore = usePracticeStore()
const subscriptionStore = useSubscriptionStore()
const curriculumStore = useCurriculumStore()
const {
  isSaving,
  userInitials,
  formattedDateJoined,
  userAvatarUrl,
  age,
  formattedBirthday,
  saveAvatar,
  saveName,
} = useProfileEditor()
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

// Birthday calendar popover
const birthdayPopoverOpen = ref(false)
const dateOfBirthValue = shallowRef<DateValue | undefined>(
  authStore.user?.dateOfBirth ? parseDate(authStore.user.dateOfBirth) : undefined,
)
const maxBirthdayDate = computed(() => today(getLocalTimeZone()))
const birthdayYearRange = computed(() => {
  const now = today(getLocalTimeZone())
  return createYearRange({
    start: now.cycle('year', -100),
    end: now,
  }).reverse()
})

const schools = ref<{ id: string; name: string }[]>([])
const schoolPopoverOpen = ref(false)

const currentSchoolName = computed(() => {
  if (!authStore.studentProfile?.schoolId) return 'Not set'
  if (authStore.studentProfile.schoolId === SCHOOL_NOT_LISTED_ID) return 'My school is not listed'
  return authStore.studentProfile.schoolName ?? 'Not set'
})

onMounted(async () => {
  isLoadingPlans.value = true
  await Promise.all([
    curriculumStore.fetchCurriculum(),
    practiceStore.getStudentSubscriptionStatus().then((status) => {
      subscriptionStatus.value = status
    }),
    subscriptionStore.fetchPlans(),
    supabase
      .from('schools')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        if (data) schools.value = data.filter((s) => s.id !== SCHOOL_NOT_LISTED_ID)
      }),
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

async function handleBirthdayChange(v: DateValue | undefined) {
  dateOfBirthValue.value = v
  const dateString = v?.toString() ?? null
  isSaving.value = true
  try {
    const result = await authStore.updateDateOfBirth(dateString)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Birthday updated successfully')
    birthdayPopoverOpen.value = false
  } finally {
    isSaving.value = false
  }
}

async function handleLanguageChange(value: unknown) {
  if (!value || (value !== 'en' && value !== 'zh')) return

  isSaving.value = true
  try {
    const result = await authStore.updatePreferredLanguage(value)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Language preference updated successfully')
  } finally {
    isSaving.value = false
  }
}

async function handleSchoolChange(schoolId: string) {
  isSaving.value = true
  try {
    const result = await authStore.updateSchool(schoolId)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('School updated successfully')
    schoolPopoverOpen.value = false
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

    <div class="grid gap-6 lg:grid-cols-[1fr_3fr]">
      <!-- Profile Card -->
      <Card>
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
      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>Your personal information</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid gap-6 sm:grid-cols-2">
            <!-- Personal -->
            <div class="space-y-4">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Personal
              </p>

              <!-- Email -->
              <div class="flex items-center gap-3">
                <div class="flex size-9 items-center justify-center rounded-full bg-muted">
                  <Mail class="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p class="text-xs text-muted-foreground">Email Address</p>
                  <p class="flex h-9 items-center text-sm font-medium">
                    {{ authStore.user?.email }}
                  </p>
                </div>
              </div>

              <!-- Birthday -->
              <div class="flex items-center gap-3">
                <div class="flex size-9 items-center justify-center rounded-full bg-muted">
                  <Cake class="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p class="text-xs text-muted-foreground">Birthday</p>
                  <Popover v-model:open="birthdayPopoverOpen">
                    <PopoverTrigger as-child>
                      <button
                        :class="
                          cn(
                            'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-fit items-center gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
                          )
                        "
                        :disabled="isSaving"
                      >
                        <template v-if="formattedBirthday">
                          {{ formattedBirthday }}
                          <span class="text-muted-foreground">({{ age }})</span>
                        </template>
                        <template v-else>Not set</template>
                        <ChevronsUpDown class="size-4 shrink-0 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent class="w-auto p-0" align="start">
                      <CalendarPicker
                        :model-value="dateOfBirthValue"
                        :max-value="maxBirthdayDate"
                        :year-range="birthdayYearRange"
                        layout="month-and-year"
                        initial-focus
                        @update:model-value="
                          (v) => handleBirthdayChange(v as DateValue | undefined)
                        "
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <!-- Date Joined -->
              <div class="flex items-center gap-3">
                <div class="flex size-9 items-center justify-center rounded-full bg-muted">
                  <Calendar class="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p class="text-xs text-muted-foreground">Member Since</p>
                  <p class="flex h-9 items-center text-sm font-medium">
                    {{ formattedDateJoined }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Academic -->
            <div class="space-y-4">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Academic
              </p>

              <!-- Grade Level -->
              <div class="flex items-center gap-3">
                <div class="flex size-9 items-center justify-center rounded-full bg-muted">
                  <GraduationCap class="size-4 text-muted-foreground" />
                </div>
                <div class="flex-1">
                  <p class="text-xs text-muted-foreground">Grade Level</p>
                  <Select
                    :model-value="authStore.studentProfile?.gradeLevelId ?? undefined"
                    :disabled="isSaving || curriculumStore.isLoading"
                    @update:model-value="handleGradeChange"
                  >
                    <SelectTrigger class="w-auto">
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
              </div>

              <!-- School -->
              <div class="flex items-center gap-3">
                <div class="flex size-9 items-center justify-center rounded-full bg-muted">
                  <School class="size-4 text-muted-foreground" />
                </div>
                <div class="flex-1">
                  <p class="text-xs text-muted-foreground">School</p>
                  <Popover v-model:open="schoolPopoverOpen">
                    <PopoverTrigger as-child>
                      <button
                        role="combobox"
                        :aria-expanded="schoolPopoverOpen"
                        :disabled="isSaving"
                        :class="
                          cn(
                            'border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*=\'text-\'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 h-9',
                          )
                        "
                      >
                        {{ currentSchoolName }}
                        <ChevronsUpDown class="size-4 shrink-0 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent class="w-64 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search school" />
                        <CommandList>
                          <CommandEmpty>No school found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              v-for="school in schools"
                              :key="school.id"
                              :value="school.name"
                              @select="() => handleSchoolChange(school.id)"
                            >
                              {{ school.name }}
                              <Check
                                :class="
                                  cn(
                                    'ml-auto size-4',
                                    authStore.studentProfile?.schoolId === school.id
                                      ? 'opacity-100'
                                      : 'opacity-0',
                                  )
                                "
                              />
                            </CommandItem>
                            <CommandItem
                              value="my school is not listed"
                              @select="() => handleSchoolChange(SCHOOL_NOT_LISTED_ID)"
                            >
                              My school is not listed
                              <Check
                                :class="
                                  cn(
                                    'ml-auto size-4',
                                    authStore.studentProfile?.schoolId === SCHOOL_NOT_LISTED_ID
                                      ? 'opacity-100'
                                      : 'opacity-0',
                                  )
                                "
                              />
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <!-- AI Summary Language -->
              <div class="flex items-center gap-3">
                <div class="flex size-9 items-center justify-center rounded-full bg-muted">
                  <Languages class="size-4 text-muted-foreground" />
                </div>
                <div class="flex-1">
                  <p class="text-xs text-muted-foreground">AI Summary Language</p>
                  <Select
                    :model-value="authStore.studentProfile?.preferredLanguage ?? 'en'"
                    :disabled="isSaving"
                    @update:model-value="handleLanguageChange"
                  >
                    <SelectTrigger class="w-auto">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="zh">中文</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
  </div>
</template>
