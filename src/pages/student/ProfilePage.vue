<script setup lang="ts">
import { ref, shallowRef, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePracticeStore, type StudentSubscriptionStatus } from '@/stores/practice'
import { useSubscriptionStore } from '@/stores/subscription'
import { useCurriculumStore } from '@/stores/curriculum'
import { useBadgesStore } from '@/stores/badges'
import FeaturedBadgesRow from '@/components/student/FeaturedBadgesRow.vue'
import BadgePickerDialog from '@/components/student/BadgePickerDialog.vue'
import { useProfileEditor } from '@/composables/useProfileEditor'
import { useT } from '@/composables/useT'
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
  Search,
} from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { SCHOOL_NOT_LISTED_ID } from '@/lib/constants'
import { useSchoolSearch } from '@/composables/useSchoolSearch'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTour } from '@/composables/useTour'
import { useLanguageStore } from '@/stores/language'

const authStore = useAuthStore()
const practiceStore = usePracticeStore()
const subscriptionStore = useSubscriptionStore()
const curriculumStore = useCurriculumStore()
const badgesStore = useBadgesStore()
const t = useT()
const languageStore = useLanguageStore()
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
const showBadgePicker = ref(false)

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

const { schools, searchTerm: schoolSearchTerm } = useSchoolSearch()
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
    badgesStore.hasLoaded ? Promise.resolve() : badgesStore.loadAll(),
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
    toast.success(t.value.student.profile.toastGradeUpdated)
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
    toast.success(t.value.student.profile.toastBirthdayUpdated)
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
    toast.success(t.value.student.profile.toastLanguageUpdated)
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
    toast.success(t.value.student.profile.toastSchoolUpdated)
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
        <h1 class="text-2xl font-bold">{{ t.student.profile.title }}</h1>
        <p class="text-muted-foreground">{{ t.student.profile.subtitle }}</p>
      </div>
      <Button variant="outline" size="sm" @click="resetAndStartTour">
        <RotateCcw class="mr-2 size-4" />
        {{ t.student.profile.restartTour }}
      </Button>
    </div>

    <div class="grid gap-6 lg:grid-cols-[1fr_3fr]">
      <!-- Profile Card -->
      <Card>
        <CardContent class="flex flex-1 flex-col justify-between gap-6">
          <!-- Avatar + identity + level/coins in one row -->
          <div class="flex items-center gap-4">
            <div class="relative shrink-0">
              <Avatar class="size-20">
                <AvatarImage :src="userAvatarUrl" :alt="authStore.user?.name ?? ''" />
                <AvatarFallback class="text-xl">{{ userInitials }}</AvatarFallback>
              </Avatar>
              <Button
                size="icon"
                variant="secondary"
                class="absolute -bottom-1 -right-1 size-7 rounded-full"
                @click="showAvatarDialog = true"
              >
                <Camera class="size-3.5" />
              </Button>
            </div>

            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex min-w-0 items-center gap-1">
                <p class="truncate text-base font-semibold">{{ authStore.user?.name }}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  class="size-6 shrink-0"
                  @click="showEditNameDialog = true"
                >
                  <Pencil class="size-3" />
                </Button>
              </div>
              <p class="truncate text-xs text-muted-foreground">{{ authStore.user?.email }}</p>
              <div class="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" class="text-xs">
                  <Trophy class="mr-1 size-3" />
                  {{ t.student.profile.levelBadge(authStore.currentLevel) }}
                </Badge>
                <Badge variant="outline" class="text-xs">
                  <CirclePoundSterling class="mr-1 size-3 text-amber-600 dark:text-amber-400" />
                  {{ t.student.profile.coinsBadge(authStore.studentProfile?.coins ?? 0) }}
                </Badge>
              </div>
            </div>
          </div>

          <!-- Featured Badges -->
          <FeaturedBadgesRow
            :badges="badgesStore.featuredBadges"
            editable
            @edit="showBadgePicker = true"
            @select-badge="showBadgePicker = true"
          />

          <!-- XP Progress -->
          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">{{ t.student.profile.xpProgress }}</span>
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
          <CardTitle>{{ t.student.profile.accountDetailsTitle }}</CardTitle>
          <CardDescription>{{ t.student.profile.accountDetailsDesc }}</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid gap-6 sm:grid-cols-2">
            <!-- Personal -->
            <div class="space-y-4">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {{ t.student.profile.sectionPersonal }}
              </p>

              <!-- Email -->
              <div class="flex items-start gap-3">
                <div
                  class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"
                >
                  <Mail class="size-4 text-muted-foreground" />
                </div>
                <div class="space-y-1">
                  <p class="text-xs text-muted-foreground">{{ t.student.profile.emailLabel }}</p>
                  <p class="flex h-9 items-center text-sm font-medium">
                    {{ authStore.user?.email }}
                  </p>
                </div>
              </div>

              <!-- Birthday -->
              <div class="flex items-start gap-3">
                <div
                  class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"
                >
                  <Cake class="size-4 text-muted-foreground" />
                </div>
                <div class="space-y-1">
                  <p class="text-xs text-muted-foreground">{{ t.student.profile.birthdayLabel }}</p>
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
                        <template v-else>{{ t.student.profile.birthdayNotSet }}</template>
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
              <div class="flex items-start gap-3">
                <div
                  class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"
                >
                  <Calendar class="size-4 text-muted-foreground" />
                </div>
                <div class="space-y-1">
                  <p class="text-xs text-muted-foreground">
                    {{ t.student.profile.memberSinceLabel }}
                  </p>
                  <p class="flex h-9 items-center text-sm font-medium">
                    {{ formattedDateJoined }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Academic -->
            <div class="space-y-4">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {{ t.student.profile.sectionAcademic }}
              </p>

              <!-- Grade Level -->
              <div class="flex items-start gap-3">
                <div
                  class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"
                >
                  <GraduationCap class="size-4 text-muted-foreground" />
                </div>
                <div class="flex-1 space-y-1">
                  <p class="text-xs text-muted-foreground">
                    {{ t.student.profile.gradeLevelLabel }}
                  </p>
                  <Select
                    :key="languageStore.language"
                    :model-value="authStore.studentProfile?.gradeLevelId ?? undefined"
                    :disabled="isSaving || curriculumStore.isLoading"
                    @update:model-value="handleGradeChange"
                  >
                    <SelectTrigger class="w-auto">
                      <SelectValue :placeholder="t.student.profile.gradeLevelPlaceholder" />
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
              <div class="flex items-start gap-3">
                <div
                  class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"
                >
                  <School class="size-4 text-muted-foreground" />
                </div>
                <div class="flex-1 space-y-1">
                  <p class="text-xs text-muted-foreground">{{ t.student.profile.schoolLabel }}</p>
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
                        <div class="flex h-9 items-center gap-2 border-b px-3">
                          <Search class="size-4 shrink-0 opacity-50" />
                          <input
                            v-model="schoolSearchTerm"
                            :placeholder="t.student.profile.schoolSearchPlaceholder"
                            class="placeholder:text-muted-foreground flex h-10 w-full bg-transparent py-3 text-sm outline-hidden"
                          />
                        </div>
                        <CommandList>
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
                              {{ t.student.profile.schoolNotListed }}
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
              <div class="flex items-start gap-3">
                <div
                  class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"
                >
                  <Languages class="size-4 text-muted-foreground" />
                </div>
                <div class="flex-1 space-y-1">
                  <p class="text-xs text-muted-foreground">
                    {{ t.student.profile.aiLanguageLabel }}
                  </p>
                  <Select
                    :key="languageStore.language"
                    :model-value="authStore.studentProfile?.preferredLanguage ?? 'en'"
                    :disabled="isSaving"
                    @update:model-value="handleLanguageChange"
                  >
                    <SelectTrigger class="w-auto">
                      <SelectValue :placeholder="t.student.profile.aiLanguagePlaceholder" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">{{ t.student.profile.langEnglish }}</SelectItem>
                      <SelectItem value="zh">{{ t.student.profile.langChinese }}</SelectItem>
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
        <CardTitle>{{ t.student.profile.myPlanTitle }}</CardTitle>
        <CardDescription>{{ t.student.profile.myPlanDesc }}</CardDescription>
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
              {{ t.student.profile.currentPlan }}
            </Badge>

            <!-- Plan header -->
            <div class="flex items-center gap-2">
              <component :is="getTierIcon(plan.id)" class="size-5 text-primary" />
              <span class="font-semibold">{{ plan.name }}</span>
            </div>

            <!-- Sessions badge -->
            <div class="mt-3">
              <Badge variant="outline">{{
                t.student.profile.sessionsPerDay(plan.sessionsPerDay)
              }}</Badge>
            </div>

            <!-- Features list -->
            <ul class="mt-3 flex-1 space-y-1.5">
              <li
                v-for="(feature, i) in (
                  t.shared.planCard.features as Record<string, readonly string[]>
                )[plan.id] ?? plan.features"
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
              {{ t.student.profile.askParentToUpgrade }}
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

    <BadgePickerDialog v-model:open="showBadgePicker" />
  </div>
</template>
