<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAssessmentsStore, type AssessmentAttempt } from '@/stores/assessments'
import { useStaffDashboardStore, type AssessmentCompletion } from '@/stores/staff-dashboard'
import { useAuthStore } from '@/stores/auth'
import {
  ArrowLeft,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  Clock,
  Loader2,
  Timer,
  Users,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import StatTile from '@/components/dashboard/StatTile.vue'
import type { ColumnDef } from '@tanstack/vue-table'
import AttemptResultDialog from '@/components/staff/AttemptResultDialog.vue'
import { toast } from 'vue-sonner'
import { formatDateTime } from '@/lib/date'
import { useMarkingAuthz } from '@/composables/useMarkingAuthz'
import { useT } from '@/composables/useT'

const t = useT()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const assessmentsStore = useAssessmentsStore()
const staffDashboardStore = useStaffDashboardStore()

const assessmentId = computed(() => String(route.params.assessmentId))
const basePath = computed(() => `/${authStore.userType}`)

const isLoading = ref(true)
const showResultDialog = ref(false)
const selectedAttempt = ref<AssessmentAttempt | null>(null)
const completion = ref<AssessmentCompletion | null>(null)

// Marking queue authz (P9b): decides whether the breakdown dialog shows the
// per-answer award + comment inputs. Same matrix as the release action.
const { canMark, loadMarkingAuthz } = useMarkingAuthz()

onMounted(async () => {
  // Assessment + questions (for the per-question breakdown labels) + attempts
  // + the aggregated completion summary (assigned vs completed, distribution).
  const [detailResult, attemptsResult, completionResult] = await Promise.all([
    assessmentsStore.fetchAssessmentDetail(assessmentId.value),
    assessmentsStore.fetchAttempts(assessmentId.value),
    staffDashboardStore.fetchAssessmentCompletion(assessmentId.value),
    loadMarkingAuthz(assessmentId.value),
  ])
  isLoading.value = false
  completion.value = completionResult.completion

  if (detailResult.error || attemptsResult.error || completionResult.error) {
    toast.error(t.value.staff.results.toastLoadFailed)
  }
})

/** Submitted attempts that still contain unmarked long answers. */
const pendingMarkingTotal = computed(
  () =>
    assessmentsStore.currentAttempts.filter(
      (attempt) => attempt.completedAt !== null && attempt.pendingManualCount > 0,
    ).length,
)

// Fixed band order, aligned to the star thresholds (60/80) — single-hue bars.
const BUCKET_KEYS = ['0-49', '50-59', '60-79', '80-100'] as const

const distribution = computed(() => {
  if (!completion.value) return []
  const buckets = completion.value.buckets
  const counts = BUCKET_KEYS.map((key) => buckets[key] ?? 0)
  const max = Math.max(...counts, 1)
  return BUCKET_KEYS.map((key, index) => ({
    key,
    label: t.value.staff.results.bucketLabels[key],
    count: counts[index],
    percent: Math.round((counts[index] / max) * 100),
  }))
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
    cell: ({ row }) => {
      if (!row.original.completedAt) {
        return h(Badge, { variant: 'secondary' }, () => t.value.staff.results.inProgress)
      }
      const badges = [
        h(
          Badge,
          {
            variant: 'secondary',
            class: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
          },
          () => t.value.staff.results.completed,
        ),
      ]
      // Marking queue marker: this attempt still needs the teacher's marking.
      if (row.original.pendingManualCount > 0) {
        badges.push(
          h(
            Badge,
            {
              variant: 'secondary',
              class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
            },
            () => t.value.staff.results.toMarkBadge(row.original.pendingManualCount),
          ),
        )
      }
      return h('div', { class: 'flex items-center gap-1' }, badges)
    },
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
    // them as a final score (decision 30 / P3A-HANDOFF §9). A pending
    // attempt's stored score is a FLOOR — flagged as provisional (P9b §4).
    cell: ({ row }) => {
      if (!row.original.completedAt) return h('div', { class: 'text-muted-foreground' }, '—')
      const score = t.value.staff.results.scoreFmt(
        row.original.correctCount,
        row.original.totalQuestions,
        row.original.scorePercent,
      )
      if (row.original.pendingManualCount > 0) {
        return h('div', {}, [
          score,
          h(
            'span',
            { class: 'ml-1 text-xs text-amber-600 dark:text-amber-400' },
            `(${t.value.staff.results.provisionalScore})`,
          ),
        ])
      }
      return h('div', {}, score)
    },
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

      <!-- Completion summary (get_assessment_completion) + marking queue -->
      <div v-if="completion" class="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatTile
          :label="t.staff.results.assignedTile"
          :value="completion.assignedCount"
          :icon="Users"
          :subtitle="t.staff.results.assignedTileHint"
        />
        <StatTile
          :label="t.staff.results.completedTile"
          :value="completion.completedCount"
          :icon="CheckCircle2"
        />
        <StatTile
          :label="t.staff.results.inProgressTile"
          :value="completion.inProgressCount"
          :icon="Timer"
        />
        <StatTile
          :label="t.staff.results.pendingTile"
          :value="pendingMarkingTotal"
          :icon="Clock"
          :subtitle="t.staff.results.pendingTileHint"
        />
        <StatTile
          :label="t.staff.results.avgScoreTile"
          :value="completion.avgScore === null ? '—' : `${completion.avgScore}%`"
          :icon="BarChart3"
        />
      </div>

      <!-- Score distribution over completed attempts -->
      <Card v-if="completion && completion.completedCount > 0" class="mb-6">
        <CardHeader>
          <CardTitle class="text-base">{{ t.staff.results.distributionTitle }}</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            <div v-for="bucket in distribution" :key="bucket.key" class="flex items-center gap-3">
              <span class="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {{ bucket.label }}
              </span>
              <div class="flex flex-1 items-center gap-2">
                <div
                  v-if="bucket.count > 0"
                  class="h-4 rounded-r-sm bg-primary"
                  :style="{ width: `${bucket.percent}%` }"
                />
                <span class="text-xs tabular-nums text-muted-foreground">{{ bucket.count }}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
      :can-mark="canMark"
    />
  </div>
</template>
