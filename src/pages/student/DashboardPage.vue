<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { usePracticeHistoryStore } from '@/stores/practice-history'
import { useT } from '@/composables/useT'
import { Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import AssessmentsTodoCard from '@/components/dashboard/AssessmentsTodoCard.vue'

const BestSubjectCard = defineAsyncComponent(
  () => import('@/components/dashboard/BestSubjectCard.vue'),
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

// Fetch on mount and re-fetch when navigating back to this route, or when
// the classroom in the path changes (decision 83).
watch(
  () => route.path,
  (path) => {
    if (path.endsWith('/dashboard')) {
      loadDashboardData()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="p-6">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else class="space-y-6">
      <!-- Practice stats -->
      <BestSubjectCard />

      <!-- Assessments to-do -->
      <AssessmentsTodoCard />
    </div>
  </div>
</template>
