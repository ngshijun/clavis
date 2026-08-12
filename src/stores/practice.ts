import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useQuestionsStore, type Question, rowToQuestion } from './questions'
import { useAuthStore } from './auth'
import { useCurriculumStore } from './curriculum'
import { handleError, errorMessages } from '@/lib/errors'
import {
  type PracticeAnswer,
  type PracticeSession,
  shuffle,
  optionIdToNumber,
  optionNumberToId,
  optionNumbersToIds,
} from '@/lib/practiceHelpers'
import { usePracticeHistoryStore } from './practice-history'

export type { PracticeAnswer, PracticeSession } from '@/lib/practiceHelpers'

export const usePracticeStore = defineStore('practice', () => {
  const currentSession = ref<PracticeSession | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Practice page navigation state (persisted across navigation)
  const practiceNavigation = ref({
    selectedSubjectId: null as string | null,
    selectedTopicId: null as string | null,
  })

  // Sub-topic progress tracking (unique questions answered per sub-topic)
  const subTopicProgress = ref<Map<string, number>>(new Map())

  const questionsStore = useQuestionsStore()
  const authStore = useAuthStore()
  const curriculumStore = useCurriculumStore()

  const isSessionActive = computed(
    () => currentSession.value !== null && !currentSession.value.completedAt,
  )

  const currentQuestion = computed(() => {
    if (!currentSession.value) return null
    return currentSession.value.questions[currentSession.value.currentQuestionIndex] ?? null
  })

  const currentQuestionNumber = computed(() => {
    if (!currentSession.value) return 0
    return currentSession.value.currentQuestionIndex + 1
  })

  const totalQuestions = computed(() => {
    if (!currentSession.value) return 0
    return currentSession.value.totalQuestions
  })

  const currentAnswer = computed(() => {
    if (!currentSession.value || !currentQuestion.value) return null
    return (
      currentSession.value.answers.find((a) => a.questionId === currentQuestion.value!.id) ?? null
    )
  })

  const isCurrentQuestionAnswered = computed(() => currentAnswer.value !== null)

  /**
   * Start a new practice session
   */
  async function startSession(
    subTopicId: string,
    questionCount: number = 10,
  ): Promise<{
    session: PracticeSession | null
    error: string | null
  }> {
    if (!authStore.user || authStore.user.userType !== 'student') {
      return { session: null, error: errorMessages().onlyStudentsCanPractice }
    }

    isLoading.value = true
    error.value = null

    try {
      // Ensure curriculum is loaded
      if (curriculumStore.gradeLevels.length === 0) {
        await curriculumStore.fetchCurriculum()
      }

      // Get sub-topic hierarchy for grade_level_id and subject_id
      const hierarchy = curriculumStore.getSubTopicWithHierarchy(subTopicId)
      if (!hierarchy) {
        return { session: null, error: errorMessages().subTopicNotFound }
      }

      // Fetch questions for this sub-topic
      const questionsResult = await questionsStore.fetchQuestionsBySubTopic(subTopicId)
      if (questionsResult.error) {
        return { session: null, error: questionsResult.error }
      }

      const allQuestions = questionsResult.questions
      if (allQuestions.length === 0) {
        return { session: null, error: errorMessages().noQuestionsAvailable }
      }

      // Get current cycle and answered questions for this student+sub-topic
      const { data: progressData } = await supabase
        .from('student_question_progress')
        .select('question_id, cycle_number')
        .eq('student_id', authStore.user.id)
        .eq('sub_topic_id', subTopicId)
        .order('cycle_number', { ascending: false })

      // Determine current cycle (highest cycle number, or 1 if no progress)
      let currentCycle = 1
      const answeredQuestionIds = new Set<string>()

      if (progressData && progressData.length > 0) {
        const firstRow = progressData[0]
        if (firstRow) {
          currentCycle = firstRow.cycle_number
          // Get all question IDs answered in current cycle
          for (const row of progressData) {
            if (row.cycle_number === currentCycle) {
              answeredQuestionIds.add(row.question_id)
            }
          }
        }
      }

      // Filter out answered questions from current cycle
      const unansweredQuestions = allQuestions.filter((q) => !answeredQuestionIds.has(q.id))

      // If not enough unanswered questions, start a new cycle
      let selectedQuestions: Question[] = []
      let questionsFromNewCycle = 0

      if (unansweredQuestions.length >= questionCount) {
        // Enough unanswered questions - select randomly from them
        const shuffled = shuffle(unansweredQuestions)
        selectedQuestions = shuffled.slice(0, questionCount)
      } else {
        // Not enough - use all remaining + start new cycle for the rest
        selectedQuestions = [...unansweredQuestions]
        questionsFromNewCycle = questionCount - unansweredQuestions.length

        if (questionsFromNewCycle > 0) {
          currentCycle++ // Move to new cycle
          // Select additional questions from the full pool (excluding already selected)
          const selectedIds = new Set(selectedQuestions.map((q) => q.id))
          const remainingPool = allQuestions.filter((q) => !selectedIds.has(q.id))
          const shuffledRemaining = shuffle(remainingPool)
          const additionalQuestions = shuffledRemaining.slice(
            0,
            Math.min(questionsFromNewCycle, shuffledRemaining.length),
          )
          selectedQuestions = [...selectedQuestions, ...additionalQuestions]
        }

        // Shuffle final selection so old/new cycle questions are mixed
        selectedQuestions = shuffle(selectedQuestions)
      }

      // Create session atomically using RPC function
      // This inserts session, questions, and progress in a single transaction
      const questionsPayload = selectedQuestions.map((question, index) => ({
        question_id: question.id,
        question_order: index,
      }))

      const { data: sessionId, error: createError } = await supabase.rpc(
        'create_practice_session',
        {
          p_student_id: authStore.user.id,
          p_sub_topic_id: subTopicId,
          p_grade_level_id: hierarchy.gradeLevel.id,
          p_subject_id: hierarchy.subject.id,
          p_questions: questionsPayload,
          p_cycle_number: currentCycle,
        },
      )

      if (createError) {
        return { session: null, error: handleError(createError, 'failedStartSession') }
      }

      const session: PracticeSession = {
        id: sessionId,
        studentId: authStore.user.id,
        gradeLevelId: hierarchy.gradeLevel.id,
        gradeLevelName: hierarchy.gradeLevel.name,
        subjectId: hierarchy.subject.id,
        subjectName: hierarchy.subject.name,
        subTopicId: subTopicId,
        topicName: hierarchy.topic.name,
        subTopicName: hierarchy.subTopic.name,
        totalQuestions: selectedQuestions.length,
        currentQuestionIndex: 0,
        correctAnswers: 0,
        answerCount: 0,
        durationSeconds: 0,
        aiSummary: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
        questions: selectedQuestions,
        answers: [],
      }

      currentSession.value = session
      usePracticeHistoryStore().addToHistory(session)

      return { session, error: null }
    } catch (err) {
      const message = handleError(err, 'failedStartSession')
      error.value = message
      return { session: null, error: message }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Submit an answer to the current question
   * @param selectedOptionIds - Array of option IDs for MCQ/MRQ (e.g., ['a'] for MCQ, ['a', 'c'] for MRQ)
   * @param textAnswer - Text answer for short_answer questions
   * @param timeSpentSeconds - Time spent on this question
   */
  async function submitAnswer(
    selectedOptionIds?: string[],
    textAnswer?: string,
    timeSpentSeconds?: number,
  ): Promise<{ answer: PracticeAnswer | null; error: string | null }> {
    if (!currentSession.value || !currentQuestion.value) {
      return { answer: null, error: errorMessages().noActiveSessionOrQuestion }
    }

    const question = currentQuestion.value

    try {
      // Convert option IDs to numbers for database storage
      const selectedOptionsNumbers =
        selectedOptionIds && selectedOptionIds.length > 0
          ? selectedOptionIds.map((id) => optionIdToNumber(id))
          : null

      // Deferred feedback (decision 40): the client never grades and never
      // reads is_correct — SELECT on the column is revoked (P5a) and the
      // grading trigger owns the value. The column is NOT NULL, so a
      // placeholder false is sent (INSERT grant retained; trigger overwrites).
      // No returning select, so PostgREST never reads the revoked column back.
      const { error: insertError } = await supabase.from('practice_answers').insert({
        session_id: currentSession.value.id,
        question_id: question.id,
        selected_options: selectedOptionsNumbers,
        text_answer: textAnswer ?? null,
        is_correct: false,
        time_spent_seconds: timeSpentSeconds ?? null,
      })

      if (insertError) {
        return { answer: null, error: handleError(insertError, 'failedSubmitAnswer') }
      }

      const answer: PracticeAnswer = {
        questionId: question.id,
        selectedOptions: selectedOptionsNumbers,
        textAnswer: textAnswer ?? null,
        // Unknown mid-session by design; results come from get_session_result
        // after completion. Nothing reads this field during the session.
        isCorrect: false,
        answeredAt: new Date().toISOString(),
        timeSpentSeconds: timeSpentSeconds ?? null,
      }
      currentSession.value.answers.push(answer)
      currentSession.value.answerCount++

      return { answer, error: null }
    } catch (err) {
      const message = handleError(err, 'failedSubmitAnswer')
      return { answer: null, error: message }
    }
  }

  /**
   * Persist the current question index (best-effort).
   * The index is already updated in memory by the caller; this write keeps the
   * DB in sync so a resumed session lands on the right question. A failure here
   * must not break navigation, so the error is logged rather than thrown.
   */
  async function persistQuestionIndex(sessionId: string, index: number): Promise<void> {
    const { error: updateError } = await supabase
      .from('practice_sessions')
      .update({ current_question_index: index })
      .eq('id', sessionId)

    if (updateError) {
      console.error('Failed to persist current_question_index:', updateError)
    }
  }

  /**
   * Move to the next question
   */
  async function nextQuestion(): Promise<boolean> {
    if (!currentSession.value) return false

    if (currentSession.value.currentQuestionIndex < currentSession.value.totalQuestions - 1) {
      currentSession.value.currentQuestionIndex++
      await persistQuestionIndex(currentSession.value.id, currentSession.value.currentQuestionIndex)
      return true
    }
    return false
  }

  /**
   * Move to the previous question
   */
  async function previousQuestion(): Promise<boolean> {
    if (!currentSession.value) return false

    if (currentSession.value.currentQuestionIndex > 0) {
      currentSession.value.currentQuestionIndex--
      await persistQuestionIndex(currentSession.value.id, currentSession.value.currentQuestionIndex)
      return true
    }
    return false
  }

  /**
   * Go to a specific question
   */
  async function goToQuestion(index: number): Promise<boolean> {
    if (!currentSession.value) return false

    if (index >= 0 && index < currentSession.value.totalQuestions) {
      currentSession.value.currentQuestionIndex = index
      await persistQuestionIndex(currentSession.value.id, index)
      return true
    }
    return false
  }

  /**
   * Shape of the jsonb payload returned by the complete_practice_session RPC.
   */
  interface CompletionResult {
    correct_count: number
    total: number
  }

  /**
   * Validate the complete_practice_session RPC payload. Returns the parsed
   * result only when both fields are present and finite, else null so the
   * caller can surface a handled error instead of writing undefined into the UI.
   */
  function parseCompletionResult(result: unknown): CompletionResult | null {
    if (typeof result !== 'object' || result === null) return null
    const r = result as Record<string, unknown>
    if (
      typeof r.correct_count !== 'number' ||
      !Number.isFinite(r.correct_count) ||
      typeof r.total !== 'number' ||
      !Number.isFinite(r.total)
    ) {
      return null
    }
    return {
      correct_count: r.correct_count,
      total: r.total,
    }
  }

  /**
   * Complete the current session
   */
  async function completeSession(): Promise<{
    session: PracticeSession | null
    error: string | null
  }> {
    if (!currentSession.value) {
      return { session: null, error: errorMessages().noActiveSession }
    }

    try {
      // Complete session atomically using RPC function
      // Server counts correct answers from practice_answers
      const { data, error: completeError } = await supabase.rpc('complete_practice_session', {
        p_session_id: currentSession.value.id,
      })

      if (completeError) {
        return {
          session: null,
          error: handleError(completeError, 'failedCompleteSession'),
        }
      }

      // complete_practice_session returns a jsonb payload; validate the numeric
      // fields before trusting them so a null/misshaped result surfaces as a
      // handled error instead of writing undefined into the score UI.
      const result = parseCompletionResult(data)
      if (!result) {
        return { session: null, error: errorMessages().failedCompleteSession }
      }

      // Update local session state with server-calculated values
      currentSession.value.completedAt = new Date().toISOString()
      currentSession.value.durationSeconds = currentSession.value.answers.reduce(
        (sum, a) => sum + (a.timeSpentSeconds ?? 0),
        0,
      )
      currentSession.value.correctAnswers = result.correct_count
      currentSession.value.totalQuestions = result.total

      // Update the corresponding entry in history store
      const historyStore = usePracticeHistoryStore()
      historyStore.updateInHistory(currentSession.value)
      historyStore.invalidateCache()

      // Generate AI summary (non-blocking)
      generateAiSummary(currentSession.value.id)

      return { session: currentSession.value, error: null }
    } catch (err) {
      const message = handleError(err, 'failedCompleteSession')
      return { session: null, error: message }
    }
  }

  /**
   * Generate AI summary for a session.
   * Called non-blocking after session completion; failures are swallowed since
   * SessionResultPage offers an explicit retry and tracks its own UI status.
   */
  async function generateAiSummary(sessionId: string): Promise<void> {
    try {
      const { summary, error: summaryError } = await generateSessionSummary(sessionId)
      if (summaryError || !summary) {
        return
      }

      if (currentSession.value?.id === sessionId) {
        currentSession.value.aiSummary = summary
      }
    } catch {
      // Non-blocking auto-generation; the page handles user-initiated retries.
    }
  }

  /**
   * End the current session (clear from memory)
   */
  function endSession() {
    currentSession.value = null
  }

  /**
   * Resume an incomplete session
   */
  async function resumeSession(
    sessionId: string,
  ): Promise<{ session: PracticeSession | null; error: string | null }> {
    const historyStore = usePracticeHistoryStore()
    const result = await historyStore.getSessionById(sessionId)
    if (result.error || !result.session) {
      return result
    }

    if (result.session.completedAt) {
      return { session: null, error: errorMessages().sessionAlreadyCompleted }
    }

    // Fetch questions from session_questions table to get the original question order
    const { data: sessionQuestionsData, error: sqError } = await supabase
      .from('session_questions')
      .select('question_id, question_order')
      .eq('session_id', sessionId)
      .order('question_order', { ascending: true })

    if (sqError) {
      return { session: null, error: handleError(sqError, 'failedResumeSession') }
    }

    if (!sessionQuestionsData || sessionQuestionsData.length === 0) {
      return { session: null, error: errorMessages().sessionQuestionsNotFound }
    }

    const questionIds = sessionQuestionsData.map((sq) => sq.question_id)

    // Fetch the actual question data
    const { data: questionsData, error: qError } = await supabase
      .from('questions')
      .select('*')
      .in('id', questionIds)

    if (qError) {
      return { session: null, error: handleError(qError, 'failedResumeSession') }
    }

    // Create a map for quick lookup
    const questionsMap = new Map<string, Question>()
    if (questionsData) {
      for (const row of questionsData) {
        questionsMap.set(row.id, rowToQuestion(row, curriculumStore))
      }
    }

    // Build questions array in the original order
    result.session.questions = sessionQuestionsData
      .map((sq) => questionsMap.get(sq.question_id))
      .filter((q): q is Question => q !== undefined)

    currentSession.value = result.session

    return { session: result.session, error: null }
  }

  // Practice navigation setters
  function setPracticeSubject(subjectId: string | null) {
    practiceNavigation.value.selectedSubjectId = subjectId
    // Reset topic when subject changes
    practiceNavigation.value.selectedTopicId = null
  }

  function setPracticeTopic(topicId: string | null) {
    practiceNavigation.value.selectedTopicId = topicId
  }

  function resetPracticeNavigation() {
    practiceNavigation.value = {
      selectedSubjectId: null,
      selectedTopicId: null,
    }
  }

  /**
   * Fetch the number of DISTINCT answered questions per sub-topic for the
   * current student. Counts from practice_answers (rows written only when a
   * question is actually answered) — NOT student_question_progress, whose rows
   * are inserted at session creation and overstated completion. Server-side
   * aggregation avoids the default 1000-row limit.
   */
  async function fetchSubTopicProgress(): Promise<void> {
    if (!authStore.user) return

    try {
      const { data, error: fetchError } = await supabase.rpc('get_subtopic_answered_counts')

      if (fetchError) {
        console.error('Error fetching sub-topic progress:', fetchError)
        return
      }

      const countMap = new Map<string, number>()
      for (const row of data ?? []) {
        countMap.set(row.sub_topic_id, row.answered_count)
      }
      subTopicProgress.value = countMap
    } catch (err) {
      console.error('Error fetching sub-topic progress:', err)
    }
  }

  /**
   * Get answered question count for a specific sub-topic
   */
  function getSubTopicAnsweredCount(subTopicId: string): number {
    return subTopicProgress.value.get(subTopicId) ?? 0
  }

  // Reset store state (call on logout)
  function $reset() {
    currentSession.value = null
    isLoading.value = false
    error.value = null
    subTopicProgress.value = new Map()
    resetPracticeNavigation()
    usePracticeHistoryStore().$reset()
  }

  /**
   * Generate AI summary for a completed session (Edge Function)
   */
  async function generateSessionSummary(
    sessionId: string,
  ): Promise<{ summary: string | null; error: string | null }> {
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-session-summary', {
        body: { sessionId },
      })

      if (fnError) {
        return { summary: null, error: handleError(fnError, 'failedGenerateSummary') }
      }

      return { summary: data?.summary ?? null, error: null }
    } catch (err) {
      return { summary: null, error: handleError(err, 'failedGenerateSummary') }
    }
  }

  return {
    currentSession,
    isLoading,
    error,
    isSessionActive,
    currentQuestion,
    currentQuestionNumber,
    totalQuestions,
    currentAnswer,
    isCurrentQuestionAnswered,
    // Practice navigation
    practiceNavigation,
    setPracticeSubject,
    setPracticeTopic,
    resetPracticeNavigation,
    // Sub-topic progress
    subTopicProgress,
    fetchSubTopicProgress,
    getSubTopicAnsweredCount,
    // Actions
    startSession,
    submitAnswer,
    nextQuestion,
    previousQuestion,
    goToQuestion,
    completeSession,
    endSession,
    generateSessionSummary,
    resumeSession,
    optionNumberToId,
    optionNumbersToIds,
    $reset,
  }
})
