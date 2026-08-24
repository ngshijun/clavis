import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { useCurriculumStore } from './curriculum'
import { handleError, errorMessages } from '@/lib/errors'
import {
  type PracticeQuestion,
  fetchPracticeQuestions,
  shuffle,
  optionIdToNumber,
  optionNumberToId,
  optionNumbersToIds,
} from '@/lib/practiceHelpers'
import { usePracticeHistoryStore } from './practice-history'

export type { PracticeAnswer, PracticeSession } from '@/lib/practiceHelpers'

/** One question's answer while the attempt is still in the browser. */
export interface DraftAnswer {
  questionId: string
  selectedOptions: number[] | null
  textAnswer: string | null
  timeSpentSeconds: number
}

/**
 * A practice attempt in progress. It exists ONLY in memory (decision 85):
 * nothing is written until `submitAttempt`, so a reload or a walk-away leaves
 * no trace in the database.
 */
export interface PracticeAttempt {
  subTopicId: string
  gradeLevelName: string
  subjectName: string
  topicName: string
  subTopicName: string
  /** Cycle the selected questions belong to; recorded as progress at submit. */
  cycleNumber: number
  questions: PracticeQuestion[]
  /** Answers given so far, in the order they were first given. */
  answers: DraftAnswer[]
  currentIndex: number
}

export const usePracticeStore = defineStore('practice', () => {
  const currentAttempt = ref<PracticeAttempt | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Time banked per question, kept outside `answers` so clearing an answer
  // does not throw away the time already spent on it.
  const elapsedByQuestion = ref<Map<string, number>>(new Map())

  // Practice page navigation state (persisted across navigation). The subject
  // is no longer part of it — it comes from the selected classroom (decision
  // 79), so the only thing the page still navigates is topic → map.
  const practiceNavigation = ref({
    selectedTopicId: null as string | null,
  })

  // Sub-topic progress tracking (unique questions answered per sub-topic)
  const subTopicProgress = ref<Map<string, number>>(new Map())

  const authStore = useAuthStore()
  const curriculumStore = useCurriculumStore()

  const isAttemptActive = computed(() => currentAttempt.value !== null)

  const currentQuestion = computed(() => {
    if (!currentAttempt.value) return null
    return currentAttempt.value.questions[currentAttempt.value.currentIndex] ?? null
  })

  const currentQuestionNumber = computed(() => {
    if (!currentAttempt.value) return 0
    return currentAttempt.value.currentIndex + 1
  })

  const totalQuestions = computed(() => currentAttempt.value?.questions.length ?? 0)

  const currentAnswer = computed(() => {
    if (!currentAttempt.value || !currentQuestion.value) return null
    return (
      currentAttempt.value.answers.find((a) => a.questionId === currentQuestion.value!.id) ?? null
    )
  })

  const isCurrentQuestionAnswered = computed(() => currentAnswer.value !== null)

  const answeredQuestionIds = computed(
    () => new Set((currentAttempt.value?.answers ?? []).map((a) => a.questionId)),
  )

  const allQuestionsAnswered = computed(() => {
    if (!currentAttempt.value) return false
    return currentAttempt.value.answers.length === currentAttempt.value.questions.length
  })

  const unansweredCount = computed(() => {
    if (!currentAttempt.value) return 0
    return currentAttempt.value.questions.length - currentAttempt.value.answers.length
  })

  /**
   * Begin an attempt. Nothing is written: the question set, the running order
   * and every answer live in memory until `submitAttempt` (decision 85). An
   * abandoned attempt therefore leaves no session row, no frozen question set
   * and no cycle progress behind.
   */
  async function startAttempt(
    subTopicId: string,
    questionCount: number = 10,
  ): Promise<{ attempt: PracticeAttempt | null; error: string | null }> {
    if (!authStore.user || authStore.user.userType !== 'student') {
      return { attempt: null, error: errorMessages().onlyStudentsCanPractice }
    }

    isLoading.value = true
    error.value = null

    try {
      if (curriculumStore.gradeLevels.length === 0) {
        await curriculumStore.fetchCurriculum()
      }

      const hierarchy = curriculumStore.getSubTopicWithHierarchy(subTopicId)
      if (!hierarchy) {
        return { attempt: null, error: errorMessages().subTopicNotFound }
      }

      // Question pool for this sub-topic: IDs ONLY. Students have no read path
      // on the bank's key columns (P11a/decision 76), and the cycle/selection
      // logic below needs nothing but ids — the content of the chosen
      // questions is served by get_practice_questions.
      const { data: poolRows, error: poolError } = await supabase
        .from('questions')
        .select('id')
        .eq('sub_topic_id', subTopicId)

      if (poolError) {
        return { attempt: null, error: handleError(poolError, 'failedStartSession') }
      }

      const allQuestionIds = (poolRows ?? []).map((row) => row.id)
      if (allQuestionIds.length === 0) {
        return { attempt: null, error: errorMessages().noQuestionsAvailable }
      }

      // Current cycle and the questions already seen in it. Progress rows are
      // written at SUBMIT now, so an abandoned attempt no longer burns them.
      const { data: progressData } = await supabase
        .from('student_question_progress')
        .select('question_id, cycle_number')
        .eq('student_id', authStore.user.id)
        .eq('sub_topic_id', subTopicId)
        .order('cycle_number', { ascending: false })

      let currentCycle = 1
      const answeredQuestionIds = new Set<string>()

      if (progressData && progressData.length > 0) {
        const firstRow = progressData[0]
        if (firstRow) {
          currentCycle = firstRow.cycle_number
          for (const row of progressData) {
            if (row.cycle_number === currentCycle) {
              answeredQuestionIds.add(row.question_id)
            }
          }
        }
      }

      const unansweredIds = allQuestionIds.filter((id) => !answeredQuestionIds.has(id))

      let selectedIds: string[] = []

      if (unansweredIds.length >= questionCount) {
        selectedIds = shuffle(unansweredIds).slice(0, questionCount)
      } else {
        // Not enough unseen questions — take what is left and open a new cycle
        // for the remainder, then shuffle so old and new are mixed.
        selectedIds = [...unansweredIds]
        const questionsFromNewCycle = questionCount - unansweredIds.length

        if (questionsFromNewCycle > 0) {
          currentCycle++
          const alreadySelected = new Set(selectedIds)
          const remainingPool = allQuestionIds.filter((id) => !alreadySelected.has(id))
          selectedIds = [
            ...selectedIds,
            ...shuffle(remainingPool).slice(
              0,
              Math.min(questionsFromNewCycle, remainingPool.length),
            ),
          ]
        }

        selectedIds = shuffle(selectedIds)
      }

      // Sanitized content in the order chosen above (decision 76) — never a
      // direct bank read of the key columns.
      const { questions, error: contentError } = await fetchPracticeQuestions(selectedIds)

      if (contentError) {
        return { attempt: null, error: handleError(contentError, 'failedStartSession') }
      }

      if (questions.length === 0) {
        return { attempt: null, error: errorMessages().noQuestionsAvailable }
      }

      const attempt: PracticeAttempt = {
        subTopicId,
        gradeLevelName: hierarchy.gradeLevel.name,
        subjectName: hierarchy.subject.name,
        topicName: hierarchy.topic.name,
        subTopicName: hierarchy.subTopic.name,
        cycleNumber: currentCycle,
        questions,
        answers: [],
        currentIndex: 0,
      }

      currentAttempt.value = attempt

      return { attempt, error: null }
    } catch (err) {
      const message = handleError(err, 'failedStartSession')
      error.value = message
      return { attempt: null, error: message }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Record (or revise) the answer to the current question. Purely local — the
   * student may come back and change it any number of times before submitting.
   * `timeSpentSeconds` accumulates across visits rather than replacing, so
   * revisiting a question does not erase the time already spent on it.
   */
  function recordAnswer(
    selectedOptionIds?: string[],
    textAnswer?: string,
    timeSpentSeconds: number = 0,
  ): void {
    if (!currentAttempt.value || !currentQuestion.value) return

    const questionId = currentQuestion.value.id
    const selectedOptions =
      selectedOptionIds && selectedOptionIds.length > 0
        ? selectedOptionIds.map((id) => optionIdToNumber(id)).sort((a, b) => a - b)
        : null
    const trimmedText = textAnswer?.trim() ?? null

    // An empty answer is a REMOVAL: deselecting every MRQ option or clearing
    // the text box must return the question to "unanswered" so the submit gate
    // still holds.
    if (selectedOptions === null && !trimmedText) {
      const existingIndex = currentAttempt.value.answers.findIndex(
        (a) => a.questionId === questionId,
      )
      if (existingIndex >= 0) {
        const [removed] = currentAttempt.value.answers.splice(existingIndex, 1)
        if (removed) elapsedByQuestion.value.set(questionId, removed.timeSpentSeconds)
      }
      return
    }

    const accumulated = (elapsedByQuestion.value.get(questionId) ?? 0) + timeSpentSeconds
    elapsedByQuestion.value.set(questionId, accumulated)

    const draft: DraftAnswer = {
      questionId,
      selectedOptions,
      textAnswer: trimmedText,
      timeSpentSeconds: accumulated,
    }

    const existingIndex = currentAttempt.value.answers.findIndex((a) => a.questionId === questionId)
    if (existingIndex >= 0) {
      currentAttempt.value.answers[existingIndex] = draft
    } else {
      currentAttempt.value.answers.push(draft)
    }
  }

  function nextQuestion(): boolean {
    if (!currentAttempt.value) return false
    if (currentAttempt.value.currentIndex < currentAttempt.value.questions.length - 1) {
      currentAttempt.value.currentIndex++
      return true
    }
    return false
  }

  function previousQuestion(): boolean {
    if (!currentAttempt.value) return false
    if (currentAttempt.value.currentIndex > 0) {
      currentAttempt.value.currentIndex--
      return true
    }
    return false
  }

  function goToQuestion(index: number): boolean {
    if (!currentAttempt.value) return false
    if (index < 0 || index >= currentAttempt.value.questions.length) return false
    currentAttempt.value.currentIndex = index
    return true
  }

  interface SubmissionResult {
    session_id: string
    correct_count: number
    total: number
  }

  function parseSubmissionResult(result: unknown): SubmissionResult | null {
    if (typeof result !== 'object' || result === null) return null
    const r = result as Record<string, unknown>
    if (typeof r.session_id !== 'string' || r.session_id.length === 0) return null
    if (typeof r.correct_count !== 'number' || !Number.isFinite(r.correct_count)) return null
    if (typeof r.total !== 'number' || !Number.isFinite(r.total)) return null
    return { session_id: r.session_id, correct_count: r.correct_count, total: r.total }
  }

  /**
   * Submit the whole attempt. One definer RPC writes the session, its frozen
   * question set, the cycle progress, every answer and the completion in a
   * single transaction — this is the only point at which practice touches the
   * database.
   *
   * Answers are sent in DISPLAY order (not the order they were given), so the
   * stored question_order matches what the student actually saw.
   */
  async function submitAttempt(): Promise<{ sessionId: string | null; error: string | null }> {
    if (!currentAttempt.value) {
      return { sessionId: null, error: errorMessages().noActiveSession }
    }

    const attempt = currentAttempt.value
    const answerByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]))
    const payload = attempt.questions.map((question) => {
      const answer = answerByQuestion.get(question.id)
      return {
        question_id: question.id,
        selected_options: answer?.selectedOptions ?? null,
        text_answer: answer?.textAnswer ?? null,
        time_spent_seconds: answer?.timeSpentSeconds ?? 0,
      }
    })

    try {
      const { data, error: submitError } = await supabase.rpc('submit_practice_session', {
        p_sub_topic_id: attempt.subTopicId,
        p_cycle_number: attempt.cycleNumber,
        p_answers: payload,
      })

      if (submitError) {
        return { sessionId: null, error: handleError(submitError, 'failedCompleteSession') }
      }

      const result = parseSubmissionResult(data)
      if (!result) {
        return { sessionId: null, error: errorMessages().failedCompleteSession }
      }

      // The attempt is now a stored session; the history list must refetch.
      usePracticeHistoryStore().invalidateCache()
      currentAttempt.value = null
      elapsedByQuestion.value = new Map()

      return { sessionId: result.session_id, error: null }
    } catch (err) {
      return { sessionId: null, error: handleError(err, 'failedCompleteSession') }
    }
  }

  /** Abandon the attempt. Nothing was stored, so nothing needs cleaning up. */
  function endAttempt() {
    currentAttempt.value = null
    elapsedByQuestion.value = new Map()
  }

  // Practice navigation setters
  function setPracticeTopic(topicId: string | null) {
    practiceNavigation.value.selectedTopicId = topicId
  }

  function resetPracticeNavigation() {
    practiceNavigation.value = { selectedTopicId: null }
  }

  /**
   * Fetch the number of DISTINCT answered questions per sub-topic for the
   * current student. Counts from practice_answers rather than
   * student_question_progress: the latter records every question PRESENTED in
   * a submitted attempt, including ones left blank. Server-side aggregation
   * avoids the default 1000-row limit.
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
    currentAttempt.value = null
    elapsedByQuestion.value = new Map()
    isLoading.value = false
    error.value = null
    subTopicProgress.value = new Map()
    resetPracticeNavigation()
    usePracticeHistoryStore().$reset()
  }

  return {
    currentAttempt,
    isLoading,
    error,
    isAttemptActive,
    currentQuestion,
    currentQuestionNumber,
    totalQuestions,
    currentAnswer,
    isCurrentQuestionAnswered,
    answeredQuestionIds,
    allQuestionsAnswered,
    unansweredCount,
    // Practice navigation
    practiceNavigation,
    setPracticeTopic,
    resetPracticeNavigation,
    // Sub-topic progress
    subTopicProgress,
    fetchSubTopicProgress,
    getSubTopicAnsweredCount,
    // Actions
    startAttempt,
    recordAnswer,
    nextQuestion,
    previousQuestion,
    goToQuestion,
    submitAttempt,
    endAttempt,
    optionNumberToId,
    optionNumbersToIds,
    $reset,
  }
})
