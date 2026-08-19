import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { useCurriculumStore } from './curriculum'
import { useClassroomScopeStore } from './classroom-scope'
import { handleError, errorMessages } from '@/lib/errors'
import type { Database } from '@/types/database.types'
import {
  type DateRangeFilter,
  filterSessions,
  createSessionLookupMethods,
} from '@/lib/sessionFilters'
import {
  type PracticeQuestion,
  type PracticeSession,
  fetchPracticeSessionQuestions,
  optionIdToNumber,
} from '@/lib/practiceHelpers'
import { mapAnswerRow, PRACTICE_ANSWER_COLUMNS } from '@/lib/questionHelpers'
import type { QuestionType } from './questions'
import { useCascadingFilters } from '@/composables/useCascadingFilters'

export type { DateRangeFilter }

type PracticeSessionRow = Database['public']['Tables']['practice_sessions']['Row']

/** One option of a review question — content only, never correctness. */
export interface PracticeReviewOption {
  /** 1-based option number as stored in practice_answers.selected_options. */
  number: number
  text: string | null
  imagePath: string | null
}

/**
 * A question on the practice results screen (decisions 39–41): per-question
 * correctness plus tips for wrongly-selected options — the correct answer is
 * never present in this shape.
 */
export interface PracticeReviewQuestion {
  questionId: string | null
  questionOrder: number
  type: QuestionType
  question: string
  imagePath: string | null
  options: PracticeReviewOption[]
  selectedOptions: number[] | null
  textAnswer: string | null
  answered: boolean
  isCorrect: boolean
  /** Tips for options the student selected AND got wrong (tip may be null). */
  wrongOptionTips: { number: number; tip: string | null }[]
  /** The bank question no longer exists; content is a placeholder. */
  isDeleted: boolean
}

export interface PracticeSessionReview {
  sessionId: string
  subTopicId: string
  gradeLevelName: string
  subjectName: string
  topicName: string
  subTopicName: string
  completedAt: string
  correctCount: number
  total: number
  scorePercent: number
  durationSeconds: number
  aiSummary: string | null
  questions: PracticeReviewQuestion[]
}

/** Shape of the get_session_result jsonb payload (see P5A handoff). */
interface SessionResultPayload {
  session_id: string
  completed_at: string
  correct_count: number
  total: number
  score_percent: number
  questions: {
    question_id: string | null
    question_order: number
    type: QuestionType
    is_correct: boolean
    selected_options: number[] | null
    text_answer: string | null
    wrong_option_tips: { number: number; tip: string | null }[] | null
  }[]
}

/** Map the session RPC's options onto the review shape (1-based numbers). */
function toReviewOptions(question: PracticeQuestion): PracticeReviewOption[] {
  return question.options.map((option) => ({
    number: optionIdToNumber(option.id),
    text: option.text,
    imagePath: option.imagePath,
  }))
}

// Cache TTL for session history (new sessions are added in-memory, so stale risk is low)
const SESSION_HISTORY_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export const usePracticeHistoryStore = defineStore('practice-history', () => {
  const sessionHistory = ref<PracticeSession[]>([])
  const sessionHistoryLastFetched = ref<number | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const authStore = useAuthStore()
  const classroomScope = useClassroomScopeStore()
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

  // Get history for current student, within the selected classroom (decision 79)
  const studentHistory = computed(() => {
    if (!authStore.user || !classroomScope.subjectId) return []
    return sessionHistory.value
      .filter((s) => s.studentId === authStore.user!.id && s.subjectId === classroomScope.subjectId)
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

      // Answer count via a nested aggregate. The bare `practice_answers(count)`
      // form needs whole-table SELECT, which P5a revoked when it column-revoked
      // `is_correct`; `id.count()` counts a granted column instead. Without this
      // the whole query 42501s and the student dashboard/statistics render empty.
      const { data, error: fetchError } = await supabase
        .from('practice_sessions')
        .select('*, practice_answers(id.count())')
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
   * Get filtered history for current student, within the selected classroom.
   *
   * The classroom bound (decision 79) sits here rather than at the call sites
   * because it is a scope, not a filter: every consumer — the statistics table,
   * its own filter bar, and the dashboard's best-subject card — must see the
   * same one classroom's practice. A student with no classroom has no history
   * to show, which is why this returns empty rather than everything.
   */
  function getFilteredHistory(
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
    subTopicName?: string,
    dateRange?: DateRangeFilter,
  ): PracticeSession[] {
    if (!authStore.user) return []

    const scopedSubjectId = classroomScope.subjectId
    if (!scopedSubjectId) return []

    const studentSessions = sessionHistory.value.filter(
      (s) => s.studentId === authStore.user!.id && s.subjectId === scopedSubjectId,
    )
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
          .select(PRACTICE_ANSWER_COLUMNS)
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
      // is_correct is column-revoked for students (P5a); correctness is not
      // available here — the results page reads it from get_session_result.
      session.answers = (answersResult.data ?? []).map((row) => mapAnswerRow(row, false))

      // `session.questions` is deliberately left empty: the only caller
      // (practice store `resumeSession`) loads the frozen, sanitized question
      // list from get_practice_session_questions right after this call.

      return { session, error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchSession')
      return { session: null, error: message }
    }
  }

  /**
   * Load the deferred-feedback results for a COMPLETED session (decisions
   * 39–41): correctness + wrong-option tips come only from the
   * get_session_result RPC (owner-gated, post-completion); question content
   * comes from get_practice_session_questions (decision 76). The correct
   * answer is never part of either payload.
   */
  async function getSessionReview(sessionId: string): Promise<{
    review: PracticeSessionReview | null
    notCompleted: boolean
    error: string | null
  }> {
    try {
      if (!authStore.user) {
        return { review: null, notCompleted: false, error: errorMessages().notAuthenticated }
      }

      if (curriculumStore.gradeLevels.length === 0) {
        await curriculumStore.fetchCurriculum()
      }

      // Session row first: owner check (RLS + defense-in-depth) and the
      // completion gate, so an in-progress session renders a friendly state
      // instead of surfacing the RPC's completion error.
      const { data: sessionRow, error: sessionError } = await supabase
        .from('practice_sessions')
        .select('id, student_id, sub_topic_id, total_time_seconds, ai_summary, completed_at')
        .eq('id', sessionId)
        .single()

      if (sessionError) {
        return {
          review: null,
          notCompleted: false,
          error: handleError(sessionError, 'failedFetchSession'),
        }
      }
      if (sessionRow.student_id !== authStore.user.id) {
        return {
          review: null,
          notCompleted: false,
          error: errorMessages().unauthorizedSessionAccess,
        }
      }
      if (!sessionRow.completed_at) {
        return { review: null, notCompleted: true, error: null }
      }

      const { data: resultData, error: resultError } = await supabase.rpc('get_session_result', {
        p_session_id: sessionId,
      })

      if (resultError) {
        return {
          review: null,
          notCompleted: false,
          error: handleError(resultError, 'failedFetchSession'),
        }
      }

      const result = resultData as unknown as SessionResultPayload
      if (typeof result?.session_id !== 'string' || !Array.isArray(result.questions)) {
        return { review: null, notCompleted: false, error: errorMessages().failedFetchSession }
      }

      // Question content from the sanitizing session RPC (decision 76) — the
      // bank's key columns are revoked for students, and the review card
      // renders content only. Questions deleted from the bank since the
      // session simply do not come back, which drives `isDeleted` below.
      const { questions: sessionQuestions, error: contentError } =
        await fetchPracticeSessionQuestions(sessionId)

      if (contentError) {
        return {
          review: null,
          notCompleted: false,
          error: handleError(contentError, 'failedFetchSession'),
        }
      }

      const questionsMap = new Map(sessionQuestions.map((q) => [q.id, q]))

      const names = getCurriculumNames(sessionRow.sub_topic_id)

      const questions: PracticeReviewQuestion[] = [...result.questions]
        .sort((a, b) => a.question_order - b.question_order)
        .map((entry) => {
          const content = entry.question_id ? questionsMap.get(entry.question_id) : undefined
          return {
            questionId: entry.question_id,
            questionOrder: entry.question_order,
            type: content ? content.type : entry.type,
            question: content?.question ?? '',
            imagePath: content?.imagePath ?? null,
            options: content ? toReviewOptions(content) : [],
            selectedOptions: entry.selected_options,
            textAnswer: entry.text_answer,
            answered: entry.selected_options !== null || entry.text_answer !== null,
            isCorrect: entry.is_correct === true,
            wrongOptionTips: entry.wrong_option_tips ?? [],
            isDeleted: !content,
          }
        })

      return {
        review: {
          sessionId: result.session_id,
          subTopicId: sessionRow.sub_topic_id,
          gradeLevelName: names.gradeLevelName,
          subjectName: names.subjectName,
          topicName: names.topicName,
          subTopicName: names.subTopicName,
          completedAt: result.completed_at,
          correctCount: result.correct_count,
          total: result.total,
          scorePercent: result.score_percent,
          durationSeconds: sessionRow.total_time_seconds ?? 0,
          aiSummary: sessionRow.ai_summary ?? null,
          questions,
        },
        notCompleted: false,
        error: null,
      }
    } catch (err) {
      return { review: null, notCompleted: false, error: handleError(err, 'failedFetchSession') }
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
    getSessionReview,

    // Called by practice store
    addToHistory,
    updateInHistory,
    invalidateCache,

    $reset,
  }
})
