<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useStudentAssessmentsStore } from '@/stores/student-assessments'
import { useClassroomScopeStore } from '@/stores/classroom-scope'
import { useT } from '@/composables/useT'
import { formatDateTime } from '@/lib/date'
import { CalendarClock, CheckCircle2, ClipboardList } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const router = useRouter()
const store = useStudentAssessmentsStore()
const scope = useClassroomScopeStore()
const t = useT()

// Follows the classroom scope, so the count always matches the Assessments page.
watch(
  () => scope.selectedId,
  (classroomId) => {
    if (store.isLoading) return
    store.fetchAssigned(classroomId)
  },
  { immediate: true },
)
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-3">
      <CardTitle class="flex items-center gap-2 text-base">
        <ClipboardList class="size-4" />
        {{ t.student.dashboard.assessmentsTodoTitle }}
        <Badge v-if="store.pendingAssessments.length > 0" variant="default" class="rounded-full">
          {{ store.pendingAssessments.length }}
        </Badge>
      </CardTitle>
      <Button variant="ghost" size="sm" @click="router.push('/student/assessments')">
        {{ t.student.dashboard.assessmentsViewAll }}
      </Button>
    </CardHeader>
    <CardContent>
      <div
        v-if="store.pendingAssessments.length === 0"
        class="flex items-center gap-2 py-2 text-sm text-muted-foreground"
      >
        <CheckCircle2 class="size-4 text-green-500" />
        {{ t.student.dashboard.assessmentsAllDone }}
      </div>
      <ul v-else class="divide-y">
        <li
          v-for="item in store.pendingAssessments.slice(0, 3)"
          :key="item.id"
          class="flex items-center justify-between gap-3 py-2"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ item.title }}</p>
            <p
              v-if="item.dueAt"
              class="flex items-center gap-1 text-xs"
              :class="
                Date.parse(item.dueAt) < Date.now() ? 'text-destructive' : 'text-muted-foreground'
              "
            >
              <CalendarClock class="size-3" />
              {{ t.student.assessments.dueLabel(formatDateTime(item.dueAt)) }}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            class="shrink-0"
            @click="router.push(`/student/assessments/${item.id}/attempt`)"
          >
            {{
              item.status === 'in_progress'
                ? t.student.assessments.resume
                : t.student.assessments.start
            }}
          </Button>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>
