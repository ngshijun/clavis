<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useStudentAssessmentsStore, type AssignedAssessment } from '@/stores/student-assessments'
import { useClassroomScopeStore } from '@/stores/classroom-scope'
import { useT } from '@/composables/useT'
import { formatDateTime } from '@/lib/date'
import { AlarmClock, CalendarClock, ClipboardList, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const router = useRouter()
const store = useStudentAssessmentsStore()
const scope = useClassroomScopeStore()
const t = useT()

// Re-fetch whenever the classroom changes — the list belongs to one classroom.
watch(
  () => scope.selectedId,
  async (classroomId) => {
    const { error } = await store.fetchAssigned(classroomId)
    if (error) {
      toast.error(t.value.student.assessments.toastLoadFailed)
    }
  },
  { immediate: true },
)

function isOverdue(item: AssignedAssessment): boolean {
  return item.dueAt !== null && Date.parse(item.dueAt) < Date.now()
}

/** Submitted but with answers still awaiting the teacher's marking (P9b). */
function isAwaitingMarking(item: AssignedAssessment): boolean {
  return item.status === 'completed' && item.pendingManualCount > 0
}

/**
 * Whether the stored score may be shown (decision 70): always once marking is
 * done; while pending only when the teacher enabled the auto subtotal — and
 * then never presented as final (the awaiting-marking badge qualifies it).
 */
function showScore(item: AssignedAssessment): boolean {
  return (
    item.status === 'completed' &&
    item.scorePercent !== null &&
    (!isAwaitingMarking(item) || item.showAutoScoreWhilePending)
  )
}

/** Not started and every assignment's due date has passed — cannot start. */
function isClosed(item: AssignedAssessment): boolean {
  return item.status === 'not_started' && !item.canStart
}

function openAssessment(item: AssignedAssessment) {
  if (item.status === 'completed' && item.attemptId) {
    router.push(`/student/assessments/attempts/${item.attemptId}/result`)
    return
  }
  router.push(`/student/assessments/${item.id}/attempt`)
}

function ctaLabel(item: AssignedAssessment): string {
  if (item.status === 'completed') return t.value.student.assessments.review
  if (item.status === 'in_progress') return t.value.student.assessments.resume
  return t.value.student.assessments.start
}
</script>

<template>
  <div class="p-6">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold">{{ t.student.assessments.title }}</h1>
      <p class="text-muted-foreground">{{ t.student.assessments.subtitle }}</p>
    </div>

    <!-- Loading -->
    <div v-if="store.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="store.assigned.length === 0"
      class="flex flex-col items-center justify-center py-16 text-center"
    >
      <ClipboardList class="mb-4 size-12 text-muted-foreground/50" />
      <h2 class="text-lg font-semibold">{{ t.student.assessments.empty }}</h2>
      <p class="mt-1 max-w-sm text-sm text-muted-foreground">
        {{ t.student.assessments.emptyDesc }}
      </p>
    </div>

    <!-- Assigned list -->
    <div v-else class="space-y-3">
      <Card v-for="item in store.assigned" :key="item.id" :class="{ 'opacity-70': isClosed(item) }">
        <CardContent class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">{{ item.title }}</h3>
              <Badge v-if="item.status === 'in_progress'" variant="secondary">
                {{ t.student.assessments.statusInProgress }}
              </Badge>
              <Badge
                v-else-if="item.status === 'completed'"
                variant="outline"
                class="border-green-500 text-green-600 dark:border-green-600 dark:text-green-400"
              >
                {{ t.student.assessments.statusCompleted }}
              </Badge>
              <Badge
                v-if="isAwaitingMarking(item)"
                variant="outline"
                class="border-amber-500 text-amber-600 dark:border-amber-600 dark:text-amber-400"
              >
                {{ t.student.assessments.awaitingMarking }}
              </Badge>
              <Badge v-if="isClosed(item)" variant="outline" class="text-muted-foreground">
                {{ t.student.assessments.closed }}
              </Badge>
              <Badge
                v-else-if="item.status !== 'completed' && isOverdue(item)"
                variant="destructive"
              >
                {{ t.student.assessments.overdue }}
              </Badge>
            </div>

            <p v-if="item.description" class="line-clamp-2 text-sm text-muted-foreground">
              {{ item.description }}
            </p>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span class="flex items-center gap-1">
                <CalendarClock class="size-3.5" />
                {{
                  item.dueAt
                    ? t.student.assessments.dueLabel(formatDateTime(item.dueAt))
                    : t.student.assessments.noDueDate
                }}
              </span>
              <span v-if="item.timeLimitSeconds" class="flex items-center gap-1">
                <AlarmClock class="size-3.5" />
                {{ t.student.assessments.timeLimit(Math.round(item.timeLimitSeconds / 60)) }}
              </span>
              <span v-if="showScore(item)" class="font-medium text-foreground">
                {{
                  t.student.assessments.scoreFmt(
                    item.correctCount ?? 0,
                    item.totalQuestions ?? 0,
                    item.scorePercent ?? 0,
                  )
                }}
                <template v-if="isAwaitingMarking(item)">
                  · {{ t.student.assessments.provisional }}
                </template>
              </span>
            </div>
            <p v-if="isClosed(item)" class="text-sm text-muted-foreground">
              {{ t.student.assessments.closedDesc }}
            </p>
          </div>

          <Button
            v-if="!isClosed(item)"
            class="shrink-0 self-start sm:self-center"
            :variant="item.status === 'completed' ? 'outline' : 'default'"
            @click="openAssessment(item)"
          >
            {{ ctaLabel(item) }}
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
