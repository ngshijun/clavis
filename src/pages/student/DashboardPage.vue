<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { usePracticeHistoryStore } from '@/stores/practice-history'
import { useT } from '@/composables/useT'
import { Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import AnnouncementsWidget from '@/components/dashboard/AnnouncementsWidget.vue'

const BestSubjectCard = defineAsyncComponent(
  () => import('@/components/dashboard/BestSubjectCard.vue'),
)
const InProgressSessionsCard = defineAsyncComponent(
  () => import('@/components/dashboard/InProgressSessionsCard.vue'),
)

const route = useRoute()
const practiceStore = usePracticeHistoryStore()
const t = useT()

const isLoading = ref(true)

async function loadDashboardData() {
  isLoading.value = true
  try {
    await practiceStore.fetchSessionHistory()
  } catch (err) {
    console.error('Failed to load dashboard data:', err)
    toast.error(t.value.student.dashboard.toastLoadFailed)
  } finally {
    isLoading.value = false
  }
}

// Fetch on mount and re-fetch when navigating back to this route
watch(
  () => route.path,
  (path) => {
    if (path === '/student/dashboard') {
      loadDashboardData()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="p-6">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold">{{ t.student.dashboard.title }}</h1>
      <p class="text-muted-foreground">{{ t.student.dashboard.subtitle }}</p>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else class="space-y-6">
      <!-- Practice stats -->
      <div data-tour="dashboard-stats">
        <BestSubjectCard />
      </div>

      <!-- In-Progress Sessions -->
      <InProgressSessionsCard />

      <!-- Announcements (full width) -->
      <AnnouncementsWidget />
    </div>
  </div>
</template>
