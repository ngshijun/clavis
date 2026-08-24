<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
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

const router = useRouter()
const practiceStore = usePracticeHistoryStore()
const scope = useClassroomScopeStore()
const t = useT()
const { basePath } = useActiveClassroom()
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
const scopedGrade = computed(() => scope.active?.gradeLevelName)
const scopedSubject = computed(() => scope.active?.subjectName)
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
    const correctAnswers = session.correctAnswers
    const totalQuestions = session.totalQuestions

    return {
      id: session.id,
      completedAt: session.completedAt ?? null,
      gradeLevelName: session.gradeLevelName,
      subjectName: session.subjectName,
      topicName: session.topicName,
      subTopicName: session.subTopicName,
      score: computeScorePercent(correctAnswers, totalQuestions),
      totalQuestions,
      correctAnswers,
      answeredCount: session.answerCount,
      durationSeconds: session.durationSeconds,
    }
  })
})

// Statistics computed values (only from completed sessions)
const { averageScore, totalSessions, totalStudyTime, subTopicsPracticed } =
  useStatisticsSummary(historyData)

const columns = computed(() => createPracticeHistoryColumns<HistoryRow>())

function handleRowClick(row: HistoryRow) {
  router.push(`${basePath.value}/session/${row.id}`)
}
</script>

<template>
  <div class="space-y-6 p-6">
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
        @update:date-range="practiceStore.setHistoryDateRange($event)"
        @update:topic="practiceStore.setHistoryTopic($event)"
        @update:sub-topic="practiceStore.setHistorySubTopic($event)"
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
            v-if="historyData.length > 0"
            :columns="columns"
            :data="historyData"
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
  </div>
</template>
