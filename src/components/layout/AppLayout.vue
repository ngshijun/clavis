<script setup lang="ts">
import { computed, ref, watch, onMounted, defineAsyncComponent } from 'vue'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { useCurriculumStore } from '@/stores/curriculum'
import { toast } from 'vue-sonner'
import { Loader2, CirclePoundSterling, Apple } from 'lucide-vue-next'
import { useTour } from '@/composables/useTour'
import { useFirstPetTour } from '@/composables/useFirstPetTour'
import { usePetsStore } from '@/stores/pets'
import AppSidebar from './AppSidebar.vue'
import ThemeToggle from './ThemeToggle.vue'
const LevelUpDialog = defineAsyncComponent(() => import('./LevelUpDialog.vue'))

const isDev = import.meta.env.DEV
const authStore = useAuthStore()
const curriculumStore = useCurriculumStore()
const petsStore = usePetsStore()
const { showWelcomeDialog, promptTour, startTour, skipTour } = useTour()
const { watchAndStart: watchAndStartFirstPetTour } = useFirstPetTour()

// Grade selection dialog state
const showGradeDialog = ref(false)
const selectedGradeId = ref<string>('')
const isSaving = ref(false)

// Sequenced onboarding: grade dialog → nav tour → first pet tour
// Each step must complete before the next begins.
function startOnboarding() {
  promptTour()
  startFirstPetTourWatcher()
}

function startFirstPetTourWatcher() {
  if (!authStore.isStudent) return

  if (petsStore.allPets.length > 0) {
    watchAndStartFirstPetTour()
  } else {
    const unwatchPets = watch(
      () => petsStore.allPets.length,
      (len) => {
        if (len > 0) {
          unwatchPets()
          watchAndStartFirstPetTour()
        }
      },
    )
  }
}

// Check if student needs to set grade on mount
onMounted(async () => {
  if (authStore.isStudent && !authStore.studentProfile?.gradeLevelId) {
    await curriculumStore.fetchCurriculum()
    showGradeDialog.value = true
  } else {
    startOnboarding()
  }
})

// After grade dialog closes, start the rest of onboarding
watch(showGradeDialog, (open) => {
  if (!open) {
    startOnboarding()
  }
})

async function handleSaveGrade() {
  if (!selectedGradeId.value) {
    toast.error('Please select your grade level')
    return
  }

  isSaving.value = true
  try {
    const result = await authStore.updateGradeLevel(selectedGradeId.value)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Grade level set successfully')
    showGradeDialog.value = false
  } finally {
    isSaving.value = false
  }
}

const isStudent = computed(() => authStore.userType === 'student')
const coins = computed(() => authStore.studentProfile?.coins ?? 0)
const food = computed(() => authStore.studentProfile?.food ?? 0)

const greeting = computed(() => {
  const hour = new Date().getHours()
  let timeGreeting: string

  if (hour < 12) {
    timeGreeting = 'Good morning'
  } else if (hour < 18) {
    timeGreeting = 'Good afternoon'
  } else {
    timeGreeting = 'Good evening'
  }

  const userName = authStore.user?.name
  return userName ? `${timeGreeting}, ${userName}` : timeGreeting
})
</script>

<template>
  <!-- Loading guard: prevent rendering layout with null user during auth transitions -->
  <div v-if="!authStore.user" class="flex h-dvh items-center justify-center">
    <Loader2 class="size-8 animate-spin text-muted-foreground" />
  </div>

  <SidebarProvider v-else>
    <AppSidebar />
    <SidebarInset>
      <header class="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div class="flex min-w-0 items-center gap-2">
          <SidebarTrigger class="-ml-1 shrink-0" />
          <Separator orientation="vertical" class="mr-2 h-4 shrink-0" />
          <h1 class="truncate text-lg font-medium">{{ greeting }}</h1>
        </div>
        <div class="flex items-center gap-2">
          <!-- Coins and Food display for students -->
          <div v-if="isStudent" data-tour="student-currency" class="flex items-center gap-2">
            <div
              class="flex min-w-28 items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 dark:bg-amber-950/30"
            >
              <CirclePoundSterling class="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span
                class="flex-1 text-right text-sm font-semibold text-amber-600 dark:text-amber-400"
                >{{ coins.toLocaleString() }}</span
              >
            </div>
            <div
              class="flex min-w-24 items-center gap-1 rounded-md bg-green-100 px-2.5 py-1 dark:bg-green-950/30"
            >
              <Apple class="size-4 shrink-0 text-green-600 dark:text-green-400" />
              <span
                class="flex-1 text-right text-sm font-semibold text-green-600 dark:text-green-400"
                >{{ food.toLocaleString() }}</span
              >
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main class="flex-1 overflow-auto">
        <router-view />
      </main>
    </SidebarInset>

    <!-- DEV: Test level up dialog -->
    <button
      v-if="isDev"
      class="fixed bottom-4 right-4 z-[9999] rounded bg-red-500 px-3 py-1 text-xs text-white shadow-lg"
      @click="authStore.levelUpInfo = { oldLevel: 4, newLevel: 5 }"
    >
      Test Level Up
    </button>

    <!-- Level Up Dialog (global, triggers on any XP gain that crosses a level boundary) -->
    <LevelUpDialog />

    <!-- Grade Selection Dialog (for students without grade set) -->
    <AlertDialog :open="showGradeDialog">
      <AlertDialogContent
        class="sm:max-w-md"
        @escape-key-down.prevent
        @pointer-down-outside.prevent
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Set Your Grade Level</AlertDialogTitle>
          <AlertDialogDescription>
            Please select your current grade level to personalize your learning experience. This
            helps us show you the right content.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div class="py-4">
          <Select v-model="selectedGradeId" :disabled="curriculumStore.isLoading || isSaving">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Select your grade" />
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
        <AlertDialogFooter>
          <Button :disabled="!selectedGradeId || isSaving" @click="handleSaveGrade">
            <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
            Continue
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Welcome Tour Dialog (for first-time users) -->
    <AlertDialog :open="showWelcomeDialog">
      <AlertDialogContent class="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Welcome to Clavis!</AlertDialogTitle>
          <AlertDialogDescription>
            Looks like this is your first time here. Would you like a quick tour of the app?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" @click="skipTour">Skip</Button>
          <Button @click="startTour">Start Tour</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </SidebarProvider>
</template>
