<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePracticeHistoryStore } from '@/stores/practice-history'
import { useClassroomScopeStore } from '@/stores/classroom-scope'
import { useT } from '@/composables/useT'

import { resolveFilterValue, createPracticeHistoryColumns } from '@/lib/statisticsColumns'
import { computeScorePercent } from '@/lib/questionHelpers'
import { useStatisticsSummary } from '@/composables/useStatisticsSummary'
import StatisticsFilterBar from '@/components/statistics/StatisticsFilterBar.vue'
import StatisticsSummaryCards from '@/components/statistics/StatisticsSummaryCards.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, BookOpen, History } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { DataTable } from '@/components/ui/data-table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const router = useRouter()
const practiceStore = usePracticeHistoryStore()
const scope = useClassroomScopeStore()
const t = useT()
const hideInProgress = ref(false)
const isLoading = ref(true)

// Fetch session history on mount
onMounted(async () => {
  try {
    await practiceStore.fetchSessionHistory()
  } catch (err) {
    console.error('Failed to load practice history:', err)
    toast.error(t.value.student.statistics.toastLoadFailed)
  } finally {
    isLoading.value = false
  }
})

// Convert ALL_VALUE sentinel to undefined for store filter calls. Grade and
// subject are no longer filters — the selected classroom fixes both (decision
// 79) — so the cascade starts at topic.
const topicFilter = computed(() => resolveFilterValue(practiceStore.historyFilters.topic))
const subTopicFilter = computed(() => resolveFilterValue(practiceStore.historyFilters.subTopic))

// Get available filter options, within the scoped grade + subject.
const scopedGrade = computed(() => scope.selected?.gradeLevelName)
const scopedSubject = computed(() => scope.selected?.subjectName)
const availableTopics = computed(() =>
  practiceStore.getHistoryTopics(scopedGrade.value, scopedSubject.value),
)
const availableSubTopics = computed(() =>
  practiceStore.getHistorySubTopics(scopedGrade.value, scopedSubject.value, topicFilter.value),
)

// Helper type for table row
interface HistoryRow {
  id: string
  completedAt: string | null
  gradeLevelName: string
  subjectName: string
  topicName: string
  subTopicName: string
  status: 'completed' | 'in_progress'
  score: number | null
  totalQuestions: number
  correctAnswers: number
  answeredCount: number
  durationSeconds: number | null
}

// Transform session data for table with filters applied
const historyData = computed<HistoryRow[]>(() => {
  const filteredSessions = practiceStore.getFilteredHistory(
    scopedGrade.value,
    scopedSubject.value,
    topicFilter.value,
    subTopicFilter.value,
    practiceStore.historyFilters.dateRange,
  )

  return filteredSessions.map((session) => {
    const isCompleted = !!session.completedAt
    const correctAnswers = session.correctAnswers
    const totalQuestions = session.totalQuestions
    const score = isCompleted ? computeScorePercent(correctAnswers, totalQuestions) : null
    const durationSeconds = isCompleted ? session.durationSeconds : null

    return {
      id: session.id,
      completedAt: session.completedAt ?? null,
      gradeLevelName: session.gradeLevelName,
      subjectName: session.subjectName,
      topicName: session.topicName,
      subTopicName: session.subTopicName,
      status: isCompleted ? 'completed' : 'in_progress',
      score,
      totalQuestions,
      correctAnswers,
      answeredCount: session.answerCount,
      durationSeconds,
    }
  })
})

// Table data with optional in-progress filtering
const displayedHistory = computed(() => {
  if (hideInProgress.value) {
    return historyData.value.filter((s) => s.status === 'completed')
  }
  return historyData.value
})

// Statistics computed values (only from completed sessions)
const { averageScore, totalSessions, totalStudyTime, subTopicsPracticed } =
  useStatisticsSummary(historyData)

const columns = computed(() => createPracticeHistoryColumns<HistoryRow>())

const showResumeDialog = ref(false)
const pendingResumeSession = ref<HistoryRow | null>(null)

function handleRowClick(row: HistoryRow) {
  if (row.status === 'completed') {
    router.push(`/student/session/${row.id}`)
  } else {
    pendingResumeSession.value = row
    showResumeDialog.value = true
  }
}

function confirmResume() {
  if (pendingResumeSession.value) {
    router.push({
      path: '/student/practice/quiz',
      query: { sessionId: pendingResumeSession.value.id },
    })
  }
}
</script>

<template>
  <div class="space-y-6 p-6">
    <div>
      <h1 class="text-2xl font-bold">{{ t.student.statistics.title }}</h1>
      <p class="text-muted-foreground">{{ t.student.statistics.subtitle }}</p>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Filters Row -->
      <StatisticsFilterBar
        :date-range="practiceStore.historyFilters.dateRange"
        :topic="practiceStore.historyFilters.topic"
        :sub-topic="practiceStore.historyFilters.subTopic"
        :available-topics="availableTopics"
        :available-sub-topics="availableSubTopics"
        :hide-in-progress="hideInProgress"
        @update:date-range="practiceStore.setHistoryDateRange($event)"
        @update:topic="practiceStore.setHistoryTopic($event)"
        @update:sub-topic="practiceStore.setHistorySubTopic($event)"
        @update:hide-in-progress="hideInProgress = $event"
      />

      <!-- Statistics Cards -->
      <StatisticsSummaryCards
        :average-score="averageScore"
        :total-sessions="totalSessions"
        :total-study-time="totalStudyTime"
        :sub-topics-practiced="subTopicsPracticed"
      />

      <!-- Practice History Table -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <History class="size-5" />
            {{ t.student.statistics.practiceHistoryTitle }}
          </CardTitle>
          <CardDescription>{{ t.student.statistics.practiceHistoryDesc }}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            v-if="displayedHistory.length > 0"
            :columns="columns"
            :data="displayedHistory"
            :on-row-click="handleRowClick"
            :initial-sorting="[{ id: 'completedAt', desc: true }]"
            :page-index="practiceStore.historyPagination.pageIndex"
            :page-size="practiceStore.historyPagination.pageSize"
            :on-page-index-change="practiceStore.setHistoryPageIndex"
            :on-page-size-change="practiceStore.setHistoryPageSize"
          />
          <div v-else class="py-12 text-center">
            <BookOpen class="mx-auto size-12 text-muted-foreground/50" />
            <p class="mt-2 text-muted-foreground">
              {{ t.student.statistics.noSessions }}
            </p>
          </div>
        </CardContent>
      </Card>
    </template>

    <!-- Resume Session Dialog -->
    <AlertDialog v-model:open="showResumeDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t.student.statistics.resumeDialog.title }}</AlertDialogTitle>
          <AlertDialogDescription v-if="pendingResumeSession" as="div">
            <p>
              {{
                t.student.statistics.resumeDialog.inProgress(
                  pendingResumeSession.subTopicName,
                  pendingResumeSession.subjectName,
                )
              }}
            </p>
            <p class="mt-1">
              {{
                t.student.statistics.resumeDialog.progress(
                  pendingResumeSession.answeredCount,
                  pendingResumeSession.totalQuestions,
                )
              }}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t.student.statistics.resumeDialog.cancel }}</AlertDialogCancel>
          <AlertDialogAction @click="confirmResume">{{
            t.student.statistics.resumeDialog.continue
          }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
