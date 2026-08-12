import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { type Question, rowToQuestion } from './questions'
import { useAuthStore } from './auth'
import { useCurriculumStore } from './curriculum'
import { handleError, errorMessages } from '@/lib/errors'
import type { Database } from '@/types/database.types'
import {
  type DateRangeFilter,
  filterSessions,
  createSessionLookupMethods,
} from '@/lib/sessionFilters'
import { type PracticeSession } from '@/lib/practiceHelpers'
import { mapAnswerRow } from '@/lib/questionHelpers'
import { useCascadingFilters } from '@/composables/useCascadingFilters'

export type { DateRangeFilter }

type PracticeSessionRow = Database['public']['Tables']['practice_sessions']['Row']

// Cache TTL for session history (new sessions are added in-memory, so stale risk is low)
const SESSION_HISTORY_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export const usePracticeHistoryStore = defineStore('practice-history', () => {
  const sessionHistory = ref<PracticeSession[]>([])
  const sessionHistoryLastFetched = ref<number | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const authStore = useAuthStore()
  const curriculumStore = useCurriculumStore()

  // History page filter + pagination state (persisted across navigation)
  const {
    filters: historyFilters,
    pagination: historyPagination,
    setGradeLevel: setHistoryGradeLevel,
    setSubject: setHistorySubject,
    setTopic: setHistoryTopic,
    setSubTopic: setHistorySubTopic,
    setDateRange: setHistoryDateRange,
    setPageIndex: setHistoryPageIndex,
    setPageSize: setHistoryPageSize,
    resetFilters: resetHistoryFilters,
  } = useCascadingFilters({ defaultDateRange: 'alltime' })

  // Get history for current student
  const studentHistory = computed(() => {
    if (!authStore.user) return []
    return sessionHistory.value
      .filter((s) => s.studentId === authStore.user!.id)
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      })
  })

  /**
   * Get curriculum names for a sub-topic
   */
  function getCurriculumNames(subTopicId: string): {
    gradeLevelName: string
    subjectName: string
    topicName: string
    subTopicName: string
  } {
    const hierarchy = curriculumStore.getSubTopicWithHierarchy(subTopicId)
    if (hierarchy) {
      return {
        gradeLevelName: hierarchy.gradeLevel.name,
        subjectName: hierarchy.subject.name,
        topicName: hierarchy.topic.name,
        subTopicName: hierarchy.subTopic.name,
      }
    }
    return {
      gradeLevelName: 'Unknown',
      subjectName: 'Unknown',
      topicName: 'Unknown',
      subTopicName: 'Unknown',
    }
  }

  /**
   * Convert database row to PracticeSession (without questions/answers)
   * @param answerCount - Optional answer count from nested query, defaults to 0
   */
  function rowToSession(row: PracticeSessionRow, answerCount: number = 0): PracticeSession {
    const names = getCurriculumNames(row.sub_topic_id)
    return {
      id: row.id,
      studentId: row.student_id,
      gradeLevelId: row.grade_level_id,
      gradeLevelName: names.gradeLevelName,
      subjectId: row.subject_id,
      subjectName: names.subjectName,
      subTopicId: row.sub_topic_id,
      topicName: names.topicName,
      subTopicName: names.subTopicName,
      totalQuestions: row.total_questions,
      currentQuestionIndex: row.current_question_index ?? 0,
      correctAnswers: row.correct_count ?? 0,
      answerCount,
      durationSeconds: row.total_time_seconds ?? 0,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      aiSummary: row.ai_summary ?? null,
      questions: [],
      answers: [],
    }
  }

  /**
   * Fetch session history for the current student
   */
  async function fetchSessionHistory(force = false): Promise<{ error: string | null }> {
    if (!authStore.user) {
      return { error: errorMessages().notAuthenticated }
    }

    // Skip if cache is still valid (new sessions are added in-memory via unshift)
    if (
      !force &&
      sessionHistoryLastFetched.value &&
      sessionHistory.value.length > 0 &&
      Date.now() - sessionHistoryLastFetched.value < SESSION_HISTORY_CACHE_TTL
    ) {
      return { error: null }
    }

    isLoading.value = true
    error.value = null

    try {
      // Ensure curriculum is loaded
      if (curriculumStore.gradeLevels.length === 0) {
        await curriculumStore.fetchCurriculum()
      }

      // Include answer count using nested query
      const { data, error: fetchError } = await supabase
        .from('practice_sessions')
        .select('*, practice_answers(count)')
        .eq('student_id', authStore.user.id)
        .order('created_at', { ascending: false })

      if (fetchError) {
        const msg = handleError(fetchError, 'failedFetchSessionHistory')
        error.value = msg
        return { error: msg }
      }

      sessionHistory.value = (data ?? []).map((row) => {
        // Extract answer count from nested query result
        const answerCount = (row.practice_answers as { count: number }[])?.[0]?.count ?? 0
        return rowToSession(row, answerCount)
      })
      sessionHistoryLastFetched.value = Date.now()
      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchSessionHistory')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get filtered history for current student
   */
  function getFilteredHistory(
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
    subTopicName?: string,
    dateRange?: DateRangeFilter,
  ): PracticeSession[] {
    if (!authStore.user) return []

    const studentSessions = sessionHistory.value.filter((s) => s.studentId === authStore.user!.id)
    return filterSessions(studentSessions, {
      gradeLevelName,
      subjectName,
      topicName,
      subTopicName,
      dateRange,
    }).sort((a, b) => {
      // In-progress sessions pinned to top, then completed descending by completedAt
      const aCompleted = !!a.completedAt
      const bCompleted = !!b.completedAt
      if (!aCompleted && bCompleted) return -1
      if (aCompleted && !bCompleted) return 1
      if (!aCompleted && !bCompleted) {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      }
      const dateA = new Date(a.completedAt!).getTime()
      const dateB = new Date(b.completedAt!).getTime()
      return dateB - dateA
    })
  }

  // Reuse shared factory for cascading filter lookups
  const sessionLookup = createSessionLookupMethods((id: string) =>
    sessionHistory.value.filter((s) => s.studentId === id),
  )

  function getHistoryGradeLevels(): string[] {
    return authStore.user ? sessionLookup.getGradeLevels(authStore.user.id) : []
  }

  function getHistorySubjects(gradeLevelName?: string): string[] {
    return authStore.user ? sessionLookup.getSubjects(authStore.user.id, gradeLevelName) : []
  }

  function getHistoryTopics(gradeLevelName?: string, subjectName?: string): string[] {
    return authStore.user
      ? sessionLookup.getTopics(authStore.user.id, gradeLevelName, subjectName)
      : []
  }

  function getHistorySubTopics(
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
  ): string[] {
    return authStore.user
      ? sessionLookup.getSubTopics(authStore.user.id, gradeLevelName, subjectName, topicName)
      : []
  }

  /**
   * Get a specific session by ID with full details
   * Uses parallel queries for better performance
   * Includes ownership verification to prevent IDOR attacks
   */
  async function getSessionById(
    sessionId: string,
  ): Promise<{ session: PracticeSession | null; error: string | null }> {
    try {
      // Authentication check
      if (!authStore.user) {
        return { session: null, error: errorMessages().notAuthenticated }
      }

      // Ensure curriculum is loaded (uses cache)
      if (curriculumStore.gradeLevels.length === 0) {
        await curriculumStore.fetchCurriculum()
      }

      // Fetch session and answers in parallel
      const [sessionResult, answersResult] = await Promise.all([
        supabase.from('practice_sessions').select('*').eq('id', sessionId).single(),
        supabase
          .from('practice_answers')
          .select('*')
          .eq('session_id', sessionId)
          .order('answered_at', { ascending: true }),
      ])

      if (sessionResult.error) {
        return {
          session: null,
          error: handleError(sessionResult.error, 'failedFetchSession'),
        }
      }
      if (answersResult.error) {
        return {
          session: null,
          error: handleError(answersResult.error, 'failedFetchSession'),
        }
      }

      // SECURITY: Verify session ownership to prevent IDOR attacks
      // This is defense-in-depth alongside RLS policies
      if (sessionResult.data.student_id !== authStore.user.id) {
        return { session: null, error: errorMessages().unauthorizedSessionAccess }
      }

      const session = rowToSession(sessionResult.data)
      session.answers = (answersResult.data ?? []).map(mapAnswerRow)

      // Get all question IDs from answers (including null for deleted questions)
      const questionIds = session.answers.map((a) => a.questionId).filter(Boolean) as string[]

      // Fetch existing questions by their IDs directly (not by topic, as question might be deleted)
      const { data: questionsData } = await supabase
        .from('questions')
        .select('*')
        .in('id', questionIds)

      const existingQuestions = new Map<string, Question>()
      if (questionsData) {
        for (const row of questionsData) {
          existingQuestions.set(row.id, rowToQuestion(row, curriculumStore))
        }
      }

      // Build questions array in order of answers, with placeholders for deleted questions
      session.questions = session.answers.map((answer, index) => {
        if (answer.questionId && existingQuestions.has(answer.questionId)) {
          return existingQuestions.get(answer.questionId)!
        }
        // Create placeholder for deleted question
        return {
          id: answer.questionId ?? `deleted-${index}`,
          type: 'mcq' as const,
          question: '[Question has been deleted]',
          imagePath: null,
          subTopicId: session.subTopicId,
          gradeLevelId: session.gradeLevelId,
          subjectId: session.subjectId,
          answer: null,
          options: [],
          createdAt: null,
          updatedAt: null,
          imageHash: null,
          gradeLevelName: session.gradeLevelName,
          subjectName: session.subjectName,
          topicName: session.topicName,
          subTopicName: session.subTopicName,
          isDeleted: true,
        } as Question & { isDeleted?: boolean }
      })

      return { session, error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchSession')
      return { session: null, error: message }
    }
  }

  // --- Methods called by practice store ---

  /** Push a new session to the front of history */
  function addToHistory(session: PracticeSession) {
    sessionHistory.value.unshift(session)
  }

  /** Update a session in history (used by completeSession) */
  function updateInHistory(session: PracticeSession) {
    const index = sessionHistory.value.findIndex((s) => s.id === session.id)
    if (index !== -1) {
      sessionHistory.value[index] = { ...session }
    }
  }

  /** Invalidate the session history cache so next fetch hits DB */
  function invalidateCache() {
    sessionHistoryLastFetched.value = null
  }

  // Reset store state (call on logout)
  function $reset() {
    sessionHistory.value = []
    sessionHistoryLastFetched.value = null
    isLoading.value = false
    error.value = null
    resetHistoryFilters()
  }

  return {
    // State
    sessionHistory,
    isLoading,
    error,

    // Computed
    studentHistory,

    // History filters
    historyFilters,
    setHistoryDateRange,
    setHistoryGradeLevel,
    setHistorySubject,
    setHistoryTopic,
    setHistorySubTopic,
    resetHistoryFilters,

    // History pagination
    historyPagination,
    setHistoryPageIndex,
    setHistoryPageSize,

    // History actions
    fetchSessionHistory,
    getFilteredHistory,
    getHistoryGradeLevels,
    getHistorySubjects,
    getHistoryTopics,
    getHistorySubTopics,
    getSessionById,

    // Called by practice store
    addToHistory,
    updateInHistory,
    invalidateCache,

    $reset,
  }
})
