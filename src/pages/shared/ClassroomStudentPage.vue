<script setup lang="ts">
import { computed, h, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ColumnDef } from '@tanstack/vue-table'
import {
  useClassroomStudentStore,
  type StudentAttemptRow,
  type StudentPracticeRow,
} from '@/stores/classroom-student'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { createPracticeHistoryColumns } from '@/lib/statisticsColumns'
import { useStatisticsSummary } from '@/composables/useStatisticsSummary'
import StatisticsSummaryCards from '@/components/statistics/StatisticsSummaryCards.vue'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { BookOpen, ClipboardList, Loader2, UserX } from 'lucide-vue-next'
import { formatDateTime } from '@/lib/date'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

/**
 * One student, seen from inside the classroom (decision 87): what they have
 * practised, and how they have done on the class's assessments.
 *
 * Practice rows do not open a per-question review. `get_session_result` is
 * owner-gated — a student's own answers and the wrong-option tips are for
 * them — so staff read the session's shape, not its contents. Attempt rows do
 * open, via the assessment's own results view, which already renders the full
 * per-question breakdown (and the marking form) rather than a second copy of
 * it here.
 */
const t = useT()
const route = useRoute()
const router = useRouter()
const store = useClassroomStudentStore()
const { classroom, basePath } = useActiveClassroom()

const studentId = computed(() => String(route.params.studentId ?? ''))

watch(
  // The classroom supplies the grade + subject that bound the practice half,
  // so this waits for it to resolve rather than loading against a half-known
  // scope — which on a deep link is the normal first tick.
  () =>
    [
      studentId.value,
      classroom.value?.id,
      classroom.value?.gradeLevelId,
      classroom.value?.subjectId,
    ] as const,
  async ([id, classroomId, gradeLevelId, subjectId]) => {
    if (!id || !classroomId || !gradeLevelId || !subjectId) return
    const { error } = await store.load({ classroomId, studentId: id, gradeLevelId, subjectId })
    if (error) toast.error(t.value.staff.classroomStudent.toastLoadFailed)
  },
  { immediate: true },
)

const practiceColumns = computed(() => createPracticeHistoryColumns<StudentPracticeRow>())

const practiceRows = computed(() => store.practiceSessions)
const { averageScore, totalSessions, totalStudyTime, subTopicsPracticed } =
  useStatisticsSummary(practiceRows)

function openAssessment(row: StudentAttemptRow) {
  router.push(`${basePath.value}/assessments/${row.assessmentId}?tab=results`)
}

const attemptColumns = computed<ColumnDef<StudentAttemptRow>[]>(() => [
  {
    accessorKey: 'title',
    header: () => t.value.staff.classroomStudent.assessmentCol,
    cell: ({ row }) =>
      h(
        'div',
        { class: 'max-w-[20rem] truncate font-medium', title: row.original.title },
        row.original.title,
      ),
  },
  {
    accessorKey: 'startedAt',
    header: () => t.value.staff.results.startedCol,
    cell: ({ row }) => h('div', { class: 'text-sm' }, formatDateTime(row.original.startedAt)),
  },
  {
    accessorKey: 'completedAt',
    header: () => t.value.staff.results.completedCol,
    cell: ({ row }) =>
      row.original.completedAt
        ? h('div', { class: 'text-sm' }, formatDateTime(row.original.completedAt))
        : h(Badge, { variant: 'secondary' }, () => t.value.staff.results.inProgress),
  },
  {
    accessorKey: 'scorePercent',
    header: () => t.value.staff.results.scoreCol,
    // An open attempt's stored score is still zero, so it is not a score yet.
    cell: ({ row }) => {
      const attempt = row.original
      if (!attempt.completedAt) return h('div', { class: 'text-muted-foreground' }, '—')

      const score = t.value.staff.results.scoreFmt(
        attempt.correctCount,
        attempt.totalQuestions,
        attempt.scorePercent,
      )
      if (attempt.pendingManualCount === 0) return h('div', { class: 'tabular-nums' }, score)

      // Unmarked long answers make the stored score a floor, not a result.
      return h('div', { class: 'flex items-center gap-2' }, [
        h('span', { class: 'tabular-nums' }, score),
        h(
          Badge,
          {
            variant: 'secondary',
            class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
          },
          () => t.value.staff.results.toMarkBadge(attempt.pendingManualCount),
        ),
      ])
    },
  },
])
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- `!isReady` covers the gap before the classroom (and so the subject
         that bounds this load) has resolved on a deep link. -->
    <div v-if="store.isLoading || !store.isReady" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- The URL names someone who is not on this class's roster. -->
    <div v-else-if="!store.student" class="py-16 text-center">
      <UserX class="mx-auto size-16 text-muted-foreground/50" />
      <h2 class="mt-4 text-lg font-semibold">
        {{ t.staff.classroomStudent.notInClassroom }}
      </h2>
      <p class="mt-2 text-muted-foreground">
        {{ t.staff.classroomStudent.notInClassroomDesc }}
      </p>
    </div>

    <template v-else-if="store.student">
      <p v-if="store.student.username" class="font-mono text-sm text-muted-foreground">
        {{ store.student.username }}
      </p>

      <StatisticsSummaryCards
        :average-score="averageScore"
        :total-sessions="totalSessions"
        :total-study-time="totalStudyTime"
        :sub-topics-practiced="subTopicsPracticed"
      />

      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <BookOpen class="size-5" />
            {{ t.staff.classroomStudent.practiceTitle }}
          </CardTitle>
          <CardDescription>{{ t.staff.classroomStudent.practiceDesc }}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            v-if="practiceRows.length > 0"
            :columns="practiceColumns"
            :data="practiceRows"
            :initial-sorting="[{ id: 'completedAt', desc: true }]"
          />
          <p v-else class="py-10 text-center text-muted-foreground">
            {{ t.staff.classroomStudent.noPractice }}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <ClipboardList class="size-5" />
            {{ t.staff.classroomStudent.assessmentsTitle }}
          </CardTitle>
          <CardDescription>{{ t.staff.classroomStudent.assessmentsDesc }}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            v-if="store.attempts.length > 0"
            :columns="attemptColumns"
            :data="store.attempts"
            :on-row-click="openAssessment"
          />
          <p v-else class="py-10 text-center text-muted-foreground">
            {{ t.staff.classroomStudent.noAttempts }}
          </p>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
