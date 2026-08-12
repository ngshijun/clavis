import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { resolveFilterValue } from '@/lib/statisticsColumns'
import { useStatisticsSummary } from '@/composables/useStatisticsSummary'
import type { DateRangeFilter } from '@/lib/sessionFilters'
import type { PracticeSessionSummary } from '@/types/session'

interface StatisticsFiltersState {
  gradeLevel: string
  subject: string
  topic: string
  subTopic: string
  dateRange: DateRangeFilter
}

/**
 * Shape shared by the ID-scoped statistics stores (child-statistics,
 * admin-student-stats). Both build their cascading lookups from
 * `createSessionLookupMethods` and their filter state from `useCascadingFilters`,
 * so the signatures here are guaranteed identical.
 */
export interface IdScopedStatisticsStore {
  statisticsFilters: StatisticsFiltersState
  getGradeLevels(id: string): string[]
  getSubjects(id: string, gradeLevelName?: string): string[]
  getTopics(id: string, gradeLevelName?: string, subjectName?: string): string[]
  getSubTopics(
    id: string,
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
  ): string[]
  getFilteredSessions(
    id: string,
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
    subTopicName?: string,
    dateRange?: DateRangeFilter,
  ): PracticeSessionSummary[]
}

/**
 * Filter/sort orchestration shared by the student and admin statistics pages.
 * Both scope their data to an entity ID (selected child / target student) and
 * use identical store method signatures, so the cascading filter computeds,
 * filtered/sorted session lists and the summary cards are derived here once.
 *
 * The student StatisticsPage is intentionally NOT a consumer: its store
 * (practice-history) is ID-less and shapes rows differently (HistoryRow +
 * resume flow), so unifying it would require a leaky id-mode abstraction.
 */
export function useStatisticsPage(
  store: IdScopedStatisticsStore,
  id: Ref<string> | ComputedRef<string>,
) {
  const hideInProgress = ref(false)

  // Convert the ALL_VALUE sentinel to undefined for the store filter calls.
  const gradeLevelFilter = computed(() => resolveFilterValue(store.statisticsFilters.gradeLevel))
  const subjectFilter = computed(() => resolveFilterValue(store.statisticsFilters.subject))
  const topicFilter = computed(() => resolveFilterValue(store.statisticsFilters.topic))
  const subTopicFilter = computed(() => resolveFilterValue(store.statisticsFilters.subTopic))

  const availableGradeLevels = computed(() => (id.value ? store.getGradeLevels(id.value) : []))
  const availableSubjects = computed(() =>
    id.value ? store.getSubjects(id.value, gradeLevelFilter.value) : [],
  )
  const availableTopics = computed(() =>
    id.value ? store.getTopics(id.value, gradeLevelFilter.value, subjectFilter.value) : [],
  )
  const availableSubTopics = computed(() =>
    id.value
      ? store.getSubTopics(id.value, gradeLevelFilter.value, subjectFilter.value, topicFilter.value)
      : [],
  )

  const filteredSessions = computed(() =>
    id.value
      ? store.getFilteredSessions(
          id.value,
          gradeLevelFilter.value,
          subjectFilter.value,
          topicFilter.value,
          subTopicFilter.value,
          store.statisticsFilters.dateRange,
        )
      : [],
  )

  const { averageScore, totalSessions, totalStudyTime, subTopicsPracticed } =
    useStatisticsSummary(filteredSessions)

  // In-progress first, then most-recent completed; in-progress ordered by createdAt desc.
  const recentSessions = computed(() =>
    [...filteredSessions.value].sort((a, b) => {
      const aCompleted = !!a.completedAt
      const bCompleted = !!b.completedAt
      if (!aCompleted && bCompleted) return -1
      if (aCompleted && !bCompleted) return 1
      if (!aCompleted && !bCompleted) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
      return new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
    }),
  )

  const displayedSessions = computed(() =>
    hideInProgress.value
      ? recentSessions.value.filter((s) => s.status === 'completed')
      : recentSessions.value,
  )

  return {
    hideInProgress,
    availableGradeLevels,
    availableSubjects,
    availableTopics,
    availableSubTopics,
    filteredSessions,
    displayedSessions,
    averageScore,
    totalSessions,
    totalStudyTime,
    subTopicsPracticed,
  }
}
