<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAssessmentsStore, type AssessmentAttempt } from '@/stores/assessments'
import { useAuthStore } from '@/stores/auth'
import { ArrowLeft, ArrowUpDown, BarChart3, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import type { ColumnDef } from '@tanstack/vue-table'
import AttemptResultDialog from '@/components/staff/AttemptResultDialog.vue'
import { toast } from 'vue-sonner'
import { formatDateTime } from '@/lib/date'
import { useT } from '@/composables/useT'

const t = useT()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const assessmentsStore = useAssessmentsStore()

const assessmentId = computed(() => String(route.params.assessmentId))
const basePath = computed(() => `/${authStore.userType}`)

const isLoading = ref(true)
const showResultDialog = ref(false)
const selectedAttempt = ref<AssessmentAttempt | null>(null)

onMounted(async () => {
  // Assessment + questions (for the per-question breakdown labels) + attempts.
  const [detailResult, attemptsResult] = await Promise.all([
    assessmentsStore.fetchAssessmentDetail(assessmentId.value),
    assessmentsStore.fetchAttempts(assessmentId.value),
  ])
  isLoading.value = false

  if (detailResult.error || attemptsResult.error) {
    toast.error(t.value.staff.results.toastLoadFailed)
  }
})

function openBreakdown(attempt: AssessmentAttempt) {
  selectedAttempt.value = attempt
  showResultDialog.value = true
}

const columns = computed<ColumnDef<AssessmentAttempt>[]>(() => [
  {
    accessorKey: 'studentName',
    header: ({ column }) =>
      h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [t.value.staff.results.studentCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      ),
    cell: ({ row }) => h('div', { class: 'font-medium' }, row.original.studentName),
  },
  {
    accessorKey: 'studentUsername',
    header: () => t.value.staff.results.usernameCol,
    cell: ({ row }) =>
      h('div', { class: 'font-mono text-muted-foreground' }, row.original.studentUsername ?? '-'),
  },
  {
    id: 'status',
    header: () => t.value.staff.results.statusCol,
    cell: ({ row }) =>
      row.original.completedAt
        ? h(
            Badge,
            {
              variant: 'secondary',
              class: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
            },
            () => t.value.staff.results.completed,
          )
        : h(Badge, { variant: 'secondary' }, () => t.value.staff.results.inProgress),
  },
  {
    accessorKey: 'scorePercent',
    header: ({ column }) =>
      h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [t.value.staff.results.scoreCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      ),
    // An open attempt's stored score columns are still zero — never render
    // them as a final score (decision 30 / P3A-HANDOFF §9).
    cell: ({ row }) =>
      row.original.completedAt
        ? h(
            'div',
            {},
            t.value.staff.results.scoreFmt(
              row.original.correctCount,
              row.original.totalQuestions,
              row.original.scorePercent,
            ),
          )
        : h('div', { class: 'text-muted-foreground' }, '—'),
  },
  {
    accessorKey: 'startedAt',
    header: ({ column }) =>
      h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [t.value.staff.results.startedCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      ),
    cell: ({ row }) => h('div', {}, formatDateTime(row.original.startedAt)),
  },
  {
    accessorKey: 'completedAt',
    header: () => t.value.staff.results.completedCol,
    cell: ({ row }) =>
      h('div', {}, row.original.completedAt ? formatDateTime(row.original.completedAt) : '-'),
  },
])
</script>

<template>
  <div class="p-6">
    <!-- Back link -->
    <Button
      variant="ghost"
      size="sm"
      class="-ml-2 mb-4"
      @click="router.push(`${basePath}/assessments/${assessmentId}`)"
    >
      <ArrowLeft class="mr-2 size-4" />
      {{ t.staff.results.backToBuilder }}
    </Button>

    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <div class="mb-6">
        <h1 class="text-2xl font-bold">{{ t.staff.results.title }}</h1>
        <p class="text-muted-foreground">
          {{ t.staff.results.subtitle(assessmentsStore.currentAssessment?.title ?? '') }}
        </p>
      </div>

      <!-- Empty State -->
      <div v-if="assessmentsStore.currentAttempts.length === 0" class="py-16 text-center">
        <BarChart3 class="mx-auto size-16 text-muted-foreground/50" />
        <h2 class="mt-4 text-lg font-semibold">{{ t.staff.results.noAttempts }}</h2>
        <p class="mt-2 text-muted-foreground">{{ t.staff.results.noAttemptsDesc }}</p>
      </div>

      <!-- Attempts table -->
      <DataTable
        v-else
        :columns="columns"
        :data="assessmentsStore.currentAttempts"
        :on-row-click="openBreakdown"
        :initial-sorting="[{ id: 'startedAt', desc: true }]"
      />
    </template>

    <AttemptResultDialog
      v-model:open="showResultDialog"
      :attempt="selectedAttempt"
      :questions="assessmentsStore.currentQuestions"
    />
  </div>
</template>
