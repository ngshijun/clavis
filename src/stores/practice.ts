import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useQuestionsStore, type Question } from './questions'
import { useAuthStore } from './auth'
import { useCurriculumStore } from './curriculum'
import { handleError } from '@/lib/errors'
import { computeScorePercent, mapAnswerRow } from '@/lib/questionHelpers'
import {
  useStudentSubscriptionStore,
  type StudentSubscriptionStatus,
  type SessionLimitStatus,
} from '@/stores/student-subscription'
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
export type { StudentSubscriptionStatus, SessionLimitStatus }

export const usePracticeStore = defineStore('practice', () => {
  const currentSession = ref<PracticeSession | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const aiSummaryStatus = ref<'idle' | 'generating' | 'generated' | 'failed'>('idle')

  const subscription = useStudentSubscriptionStore()

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

  const sessionResults = computed(() => {
    if (!currentSession.value) return null
    const totalAnswered = currentSession.value.answers.length
    const correctAnswers = currentSession.value.answers.filter((a) => a.isCorrect).length
    return {
      total: totalQuestions.value,
      answered: totalAnswered,
      correct: correctAnswers,
      incorrect: totalAnswered - correctAnswers,
      score: computeScorePercent(correctAnswers, totalAnswered),
    }
  })

  /**
   * Start a new practice session
   * Note: subTopicId parameter corresponds to topic_id column which now references sub_topics table
   */
  async function startSession(
    subTopicId: string,
    questionCount: number = 10,
  ): Promise<{ session: PracticeSession | null; error: string | null; limitReached?: boolean }> {
    if (!authStore.user || authStore.user.userType !== 'student') {
      return { session: null, error: 'Only students can start practice sessions' }
    }

    isLoading.value = true
    error.value = null

    try {
      // Check session limit before starting
      const limitStatus = await subscription.checkSessionLimit()
      if (!limitStatus.canStartSession) {
        const subStatus = await subscription.getStudentSubscriptionStatus()
        const isTopTier = subStatus.tier === 'pro' || subStatus.tier === 'max'
        return {
          session: null,
          error: isTopTier
            ? `You have reached your daily session limit (${limitStatus.sessionLimit} sessions). Come back tomorrow!`
            : `You have reached your daily session limit (${limitStatus.sessionLimit} sessions). Upgrade your plan for more sessions!`,
          limitReached: true,
        }
      }

      // Ensure curriculum is loaded
      if (curriculumStore.gradeLevels.length === 0) {
        await curriculumStore.fetchCurriculum()
      }

      // Get sub-topic hierarchy for grade_level_id and subject_id
      const hierarchy = curriculumStore.getSubTopicWithHierarchy(subTopicId)
      if (!hierarchy) {
        return { session: null, error: 'Sub-topic not found' }
      }

      // Fetch questions for this sub-topic
      const questionsResult = await questionsStore.fetchQuestionsBySubTopic(subTopicId)
      if (questionsResult.error) {
        return { session: null, error: questionsResult.error }
      }

      const allQuestions = questionsResult.questions
      if (allQuestions.length === 0) {
        return { session: null, error: 'No questions available for this sub-topic' }
      }

      // Get current cycle and answered questions for this student+sub-topic
      const { data: progressData } = await supabase
        .from('student_question_progress')
        .select('question_id, cycle_number')
        .eq('student_id', authStore.user.id)
        .eq('topic_id', subTopicId)
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
      let unansweredQuestions = allQuestions.filter((q) => !answeredQuestionIds.has(q.id))

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
          p_topic_id: subTopicId,
          p_grade_level_id: hierarchy.gradeLevel.id,
          p_subject_id: hierarchy.subject.id,
          p_questions: questionsPayload,
          p_cycle_number: currentCycle,
        },
      )

      if (createError) {
        return { session: null, error: handleError(createError, 'Failed to start session.') }
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
        xpEarned: null,
        coinsEarned: null,
        aiSummary: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
        questions: selectedQuestions,
        answers: [],
      }

      currentSession.value = session
      usePracticeHistoryStore().addToHistory(session)

      // Invalidate session limit cache (session count changed)
      subscription.invalidateSessionLimitCache()

      return { session, error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to start session.')
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
      return { answer: null, error: 'No active session or question' }
    }

    const question = currentQuestion.value
    let isCorrect = false

    if (question.type === 'mcq' && selectedOptionIds && selectedOptionIds.length === 1) {
      // MCQ: single correct answer
      const selectedOption = question.options.find((o) => o.id === selectedOptionIds[0])
      isCorrect = selectedOption?.isCorrect ?? false
    } else if (question.type === 'mrq' && selectedOptionIds && selectedOptionIds.length > 0) {
      // MRQ: must select ALL correct options and NO incorrect options
      const correctOptionIds = question.options
        .filter((o) => o.isCorrect)
        .map((o) => o.id as string)
      const selectedSet = new Set(selectedOptionIds)
      const correctSet = new Set(correctOptionIds)

      // Check if sets are equal (same size and all elements match)
      isCorrect =
        selectedSet.size === correctSet.size && [...selectedSet].every((id) => correctSet.has(id))
    } else if (question.type === 'short_answer' && textAnswer && question.answer) {
      // Simple case-insensitive comparison for short answers
      isCorrect = textAnswer.trim().toLowerCase() === question.answer.trim().toLowerCase()
    }

    try {
      // Convert option IDs to numbers for database storage
      const selectedOptionsNumbers =
        selectedOptionIds && selectedOptionIds.length > 0
          ? selectedOptionIds.map((id) => optionIdToNumber(id))
          : null

      // Insert answer into database
      const { data: answerData, error: insertError } = await supabase
        .from('practice_answers')
        .insert({
          session_id: currentSession.value.id,
          question_id: question.id,
          selected_options: selectedOptionsNumbers,
          text_answer: textAnswer ?? null,
          is_correct: isCorrect,
          time_spent_seconds: timeSpentSeconds ?? null,
        })
        .select()
        .single()

      if (insertError) {
        return { answer: null, error: handleError(insertError, 'Failed to submit answer.') }
      }

      const answer = mapAnswerRow(answerData)
      currentSession.value.answers.push(answer)

      // Update local counts for UI
      currentSession.value.answerCount++
      if (isCorrect) {
        currentSession.value.correctAnswers++
      }

      return { answer, error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to submit answer.')
      return { answer: null, error: message }
    }
  }

  /**
   * Move to the next question
   */
  async function nextQuestion(): Promise<boolean> {
    if (!currentSession.value) return false

    if (currentSession.value.currentQuestionIndex < currentSession.value.totalQuestions - 1) {
      currentSession.value.currentQuestionIndex++

      // Update in database
      await supabase
        .from('practice_sessions')
        .update({ current_question_index: currentSession.value.currentQuestionIndex })
        .eq('id', currentSession.value.id)

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

      // Update in database
      await supabase
        .from('practice_sessions')
        .update({ current_question_index: currentSession.value.currentQuestionIndex })
        .eq('id', currentSession.value.id)

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

      // Update in database
      await supabase
        .from('practice_sessions')
        .update({ current_question_index: index })
        .eq('id', currentSession.value.id)

      return true
    }
    return false
  }

  /**
   * Complete the current session
   */
  async function completeSession(): Promise<{
    session: PracticeSession | null
    error: string | null
  }> {
    if (!currentSession.value) {
      return { session: null, error: 'No active session' }
    }

    try {
      // Complete session atomically using RPC function
      // Server counts correct answers from practice_answers and calculates rewards
      const { data: rewards, error: completeError } = await supabase.rpc(
        'complete_practice_session',
        { p_session_id: currentSession.value.id },
      )

      if (completeError) {
        return { session: null, error: handleError(completeError, 'Failed to complete session.') }
      }

      const result = rewards as { xp_earned: number; coins_earned: number; correct_count: number }

      // Update local session state with server-calculated values
      currentSession.value.completedAt = new Date().toISOString()
      currentSession.value.durationSeconds = currentSession.value.answers.reduce(
        (sum, a) => sum + (a.timeSpentSeconds ?? 0),
        0,
      )
      currentSession.value.correctAnswers = result.correct_count
      currentSession.value.xpEarned = result.xp_earned
      currentSession.value.coinsEarned = result.coins_earned

      // Update the corresponding entry in history store
      const historyStore = usePracticeHistoryStore()
      historyStore.updateInHistory(currentSession.value)
      historyStore.invalidateCache()

      // Refresh auth store to get updated XP/coins from database
      await authStore.refreshProfile()

      // Invalidate session limit cache (session count changed)
      subscription.invalidateSessionLimitCache()

      // Generate AI summary for Pro tier and above (non-blocking)
      generateAiSummary(currentSession.value.id)

      return { session: currentSession.value, error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to complete session.')
      return { session: null, error: message }
    }
  }

  /**
   * Generate AI summary for a session (Pro tier and above)
   * This is called non-blocking after session completion
   */
  async function generateAiSummary(sessionId: string): Promise<void> {
    try {
      // Check subscription status
      const subscriptionStatus = await subscription.getStudentSubscriptionStatus()
      if (subscriptionStatus.tier !== 'pro' && subscriptionStatus.tier !== 'max') {
        return // Only Pro tier and above gets AI summaries
      }

      aiSummaryStatus.value = 'generating'

      // Call Edge Function to generate summary
      const { data, error } = await supabase.functions.invoke('generate-session-summary', {
        body: { sessionId },
      })

      if (error) {
        console.error('Failed to generate AI summary:', error)
        aiSummaryStatus.value = 'failed'
        return
      }

      // Update current session if it's still loaded
      if (currentSession.value?.id === sessionId && data?.summary) {
        currentSession.value.aiSummary = data.summary
      }
      aiSummaryStatus.value = 'generated'
    } catch (err) {
      console.error('Error generating AI summary:', err)
      aiSummaryStatus.value = 'failed'
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
      return { session: null, error: 'Session is already completed' }
    }

    // Fetch questions from session_questions table to get the original question order
    const { data: sessionQuestionsData, error: sqError } = await supabase
      .from('session_questions')
      .select('question_id, question_order')
      .eq('session_id', sessionId)
      .order('question_order', { ascending: true })

    if (sqError) {
      return { session: null, error: handleError(sqError, 'Failed to resume session.') }
    }

    if (!sessionQuestionsData || sessionQuestionsData.length === 0) {
      return { session: null, error: 'Session questions not found' }
    }

    const questionIds = sessionQuestionsData.map((sq) => sq.question_id)

    // Fetch the actual question data
    const { data: questionsData, error: qError } = await supabase
      .from('questions')
      .select('*')
      .in('id', questionIds)

    if (qError) {
      return { session: null, error: handleError(qError, 'Failed to resume session.') }
    }

    // Create a map for quick lookup
    const questionsMap = new Map<string, Question>()
    if (questionsData) {
      for (const row of questionsData) {
        const hierarchy = curriculumStore.getSubTopicWithHierarchy(row.topic_id)
        questionsMap.set(row.id, {
          id: row.id,
          type: row.type,
          question: row.question,
          imagePath: row.image_path,
          subTopicId: row.topic_id, // topic_id column references sub_topics
          gradeLevelId: row.grade_level_id,
          subjectId: row.subject_id,
          explanation: row.explanation,
          answer: row.answer,
          options: [
            {
              id: 'a',
              text: row.option_1_text,
              imagePath: row.option_1_image_path,
              isCorrect: row.option_1_is_correct ?? false,
            },
            {
              id: 'b',
              text: row.option_2_text,
              imagePath: row.option_2_image_path,
              isCorrect: row.option_2_is_correct ?? false,
            },
            {
              id: 'c',
              text: row.option_3_text,
              imagePath: row.option_3_image_path,
              isCorrect: row.option_3_is_correct ?? false,
            },
            {
              id: 'd',
              text: row.option_4_text,
              imagePath: row.option_4_image_path,
              isCorrect: row.option_4_is_correct ?? false,
            },
          ],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          imageHash: row.image_hash,
          gradeLevelName: hierarchy?.gradeLevel.name ?? '',
          subjectName: hierarchy?.subject.name ?? '',
          topicName: hierarchy?.topic.name ?? '',
          subTopicName: hierarchy?.subTopic.name ?? '',
        })
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
   * Fetch unique questions answered per sub-topic for the current student
   * Uses server-side aggregation to avoid the default 1000-row limit
   */
  async function fetchSubTopicProgress(): Promise<void> {
    if (!authStore.user) return

    try {
      const { data, error: fetchError } = await supabase
        .from('student_question_progress')
        .select('topic_id, question_id.count()')
        .eq('student_id', authStore.user.id)

      if (fetchError) {
        console.error('Error fetching sub-topic progress:', fetchError)
        return
      }

      const countMap = new Map<string, number>()
      for (const row of (data ?? []) as unknown as { topic_id: string; count: number }[]) {
        countMap.set(row.topic_id, row.count)
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
    aiSummaryStatus.value = 'idle'
    subscription.$reset()
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
        return { summary: null, error: handleError(fnError, 'Failed to generate AI summary') }
      }

      return { summary: data?.summary ?? null, error: null }
    } catch (err) {
      return { summary: null, error: handleError(err, 'Failed to generate AI summary') }
    }
  }

  return {
    currentSession,
    isLoading,
    error,
    aiSummaryStatus,
    isSessionActive,
    currentQuestion,
    currentQuestionNumber,
    totalQuestions,
    currentAnswer,
    isCurrentQuestionAnswered,
    sessionResults,
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
    getStudentSubscriptionStatus: subscription.getStudentSubscriptionStatus,
    checkSessionLimit: subscription.checkSessionLimit,
    $reset,
  }
})
