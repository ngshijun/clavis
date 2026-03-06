<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useStudentDashboardStore } from '@/stores/student-dashboard'
import { usePracticeHistoryStore } from '@/stores/practice-history'
import { usePetsStore } from '@/stores/pets'
import { useAuthStore } from '@/stores/auth'
import { Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import DailyStatus from '@/components/dashboard/DailyStatus.vue'
import BestSubjectCard from '@/components/dashboard/BestSubjectCard.vue'
import CurrentPetCard from '@/components/dashboard/CurrentPetCard.vue'
import SpinWheelCard from '@/components/dashboard/SpinWheelCard.vue'
import StreakCard from '@/components/dashboard/StreakCard.vue'
import InProgressSessionsCard from '@/components/dashboard/InProgressSessionsCard.vue'
import AnnouncementsWidget from '@/components/dashboard/AnnouncementsWidget.vue'

const route = useRoute()
const dashboardStore = useStudentDashboardStore()
const practiceStore = usePracticeHistoryStore()
const petsStore = usePetsStore()
const authStore = useAuthStore()

const isLoading = ref(true)
const dailyStatusButtonRef = ref<InstanceType<typeof DailyStatus> | null>(null)

// LocalStorage key for "don't show again today"
const MOOD_REMINDER_DISMISSED_KEY = 'mood_reminder_dismissed_date'

function shouldShowMoodReminder(): boolean {
  // Don't show mood reminder if grade level is not set (grade dialog takes priority)
  if (!authStore.studentProfile?.gradeLevelId) return false

  // Check if user has already set mood today
  if (dashboardStore.hasMoodToday) return false

  // Check if user dismissed the reminder today
  const dismissedDate = localStorage.getItem(MOOD_REMINDER_DISMISSED_KEY)
  if (dismissedDate === dashboardStore.getTodayString()) return false

  return true
}

async function loadDashboardData() {
  isLoading.value = true
  try {
    await Promise.all([
      dashboardStore.fetchTodayStatus(),
      practiceStore.fetchSessionHistory(),
      petsStore.allPets.length === 0 ? petsStore.fetchAllPets() : Promise.resolve(),
      petsStore.fetchOwnedPets(),
    ])
  } catch (err) {
    console.error('Failed to load dashboard data:', err)
    toast.error('Failed to load dashboard data')
  } finally {
    isLoading.value = false
  }
}

// Fetch on mount
onMounted(loadDashboardData)

// Re-fetch when navigating back to this route (covers browser back, sidebar clicks, etc.)
watch(
  () => route.path,
  (path) => {
    if (path === '/student/dashboard') {
      loadDashboardData()
    }
  },
)

// Show mood reminder dialog after loading completes
watch(isLoading, async (loading) => {
  if (!loading && shouldShowMoodReminder()) {
    // Wait for Vue to finish rendering the v-else content
    await nextTick()
    // Open the DailyStatus dialog with "don't show again" option
    dailyStatusButtonRef.value?.openDialog(true)
  }
})
</script>

<template>
  <div class="p-6">
    <!-- Header -->
    <div class="mb-6 flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-bold">Dashboard</h1>
        <p class="text-muted-foreground">Here's your daily overview</p>
      </div>
      <div v-if="!isLoading" class="flex items-center gap-2">
        <SpinWheelCard />
        <DailyStatus ref="dailyStatusButtonRef" />
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else class="space-y-6">
      <!-- Hero Layout: Pet (1/3) + Cards (2/3) -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2">
        <!-- Pet (spans 2 rows on desktop) -->
        <CurrentPetCard data-tour="dashboard-pet" class="sm:row-span-2 sm:min-h-[28rem]" />

        <!-- Best Subject (spans 2 cols on desktop) -->
        <BestSubjectCard class="lg:col-span-2" />

        <!-- Practice Streak (spans 2 cols on desktop) -->
        <StreakCard data-tour="dashboard-streak" class="lg:col-span-2" />
      </div>

      <!-- In-Progress Sessions -->
      <InProgressSessionsCard />

      <!-- Announcements (full width) -->
      <AnnouncementsWidget />
    </div>
  </div>
</template>
