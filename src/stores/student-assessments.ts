import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import type { Database } from '@/types/database.types'
import { handleError, errorMessages } from '@/lib/errors'

export type QuestionType = Database['public']['Enums']['question_type']

export type AssignedStatus = 'not_started' | 'in_progress' | 'completed'

export interface AssignedAssessment {
  id: string
  title: string
  description: string | null
  timeLimitSeconds: number | null
  /** Earliest due date among the assignments reaching this student (urgency display). */
  dueAt: string | null
  /**
   * Mirror of the server start gate (most-permissive union): true when ANY
   * assignment reaching the student has no due date or a future one. The
   * server re-checks on start — this only drives the CTA state.
   */
  canStart: boolean
  status: AssignedStatus
  attemptId: string | null
  correctCount: number | null
  totalQuestions: number | null
  scorePercent: number | null
  completedAt: string | null
}

export interface RunnerOption {
  /** 1-based ordinal the grader expects in attempt_answers.selected_options. */
  number: number
  text: string
  imagePath: string | null
}

export interface RunnerQuestion {
  assessmentQuestionId: string
  questionOrder: number
  points: number
  type: QuestionType
  question: string
  imagePath: string | null
  options: RunnerOption[]
}

export interface RunnerAnswer {
  selectedOptions: number[] | null
  textAnswer: string | null
}

export interface ActiveAttempt {
  attemptId: string
  assessmentId: string
  title: string
  timeLimitSeconds: number | null
  /** started_at + time limit (EXCLUDES the 30s server grace); null when untimed. */
  expiresAt: string | null
  totalQuestions: number
  resumed: boolean
}

export interface CompletionResult {
  correctCount: number
  total: number
  scorePercent: number
  alreadyCompleted: boolean
}

export interface ReviewQuestion extends RunnerQuestion {
  isCorrect: boolean
  answered: boolean
  selectedOptions: number[] | null
  textAnswer: string | null
}

export interface AttemptReview {
  attemptId: string
  assessmentId: string
  title: string
  completedAt: string | null
  correctCount: number
  totalQuestions: number
  scorePercent: number
  questions: ReviewQuestion[]
}

interface SaveAnswerOutcome {
  error: string | null
  timeLimitExceeded: boolean
  attemptCompleted: boolean
}

/** Extract the message of a PL/pgSQL RAISE EXCEPTION (SQLSTATE P0001), if any. */
function p0001Message(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null
  const e = err as { code?: string; message?: string }
  return e.code === 'P0001' ? (e.message ?? '') : null
}

function parseRunnerQuestions(raw: unknown): RunnerQuestion[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      const q = entry as {
        assessment_question_id: string
        question_order: number
        points: number
        type: QuestionType
        question: string
        image_path: string | null
        options: { number: number; text: string | null; image_path: string | null }[]
      }
      return {
        assessmentQuestionId: q.assessment_question_id,
        questionOrder: q.question_order,
        points: q.points,
        type: q.type,
        question: q.question ?? '',
        imagePath: q.image_path ?? null,
        options: (q.options ?? []).map((option) => ({
          number: option.number,
          text: option.text ?? '',
          imagePath: option.image_path ?? null,
        })),
      }
    })
    .sort((a, b) => a.questionOrder - b.questionOrder)
}

/**
 * Student-side assessment surface: assigned list, the timed resumable runner,
 * and the post-completion review.
 *
 * Security contracts (P3a decisions 32–33) this store is built around:
 * - Question content comes ONLY from the `get_attempt_questions` RPC —
 *   students have no SELECT path on `assessment_questions`.
 * - Correctness comes ONLY from the `get_attempt_result` RPC after completion —
 *   `attempt_answers.is_correct` is column-revoked, so every read of
 *   `attempt_answers` names its columns explicitly (a `select('*')` errors).
 * - Attempts are created/scored only via the `start_assessment_attempt` /
 *   `complete_assessment_attempt` RPCs; the single direct attempt write is the
 *   `current_question_index` cursor.
 */
export const useStudentAssessmentsStore = defineStore('student-assessments', () => {
  const assigned = ref<AssignedAssessment[]>([])
  const isLoading = ref(false)
  const hasLoaded = ref(false)
  const error = ref<string | null>(null)

  // Runner state for the attempt currently open
  const activeAttempt = ref<ActiveAttempt | null>(null)
  const runnerQuestions = ref<RunnerQuestion[]>([])
  const runnerAnswers = ref<Map<string, RunnerAnswer>>(new Map())
  const currentQuestionIndex = ref(0)
  const isStarting = ref(false)

  // Review state for the result page
  const review = ref<AttemptReview | null>(null)
  const isLoadingReview = ref(false)

  const pendingAssessments = computed(() =>
    assigned.value.filter(
      (item) => item.status === 'in_progress' || (item.status === 'not_started' && item.canStart),
    ),
  )

  const currentQuestion = computed<RunnerQuestion | null>(
    () => runnerQuestions.value[currentQuestionIndex.value] ?? null,
  )

  const answeredCount = computed(() => runnerAnswers.value.size)

  function getAnswer(assessmentQuestionId: string): RunnerAnswer | null {
    return runnerAnswers.value.get(assessmentQuestionId) ?? null
  }

  /**
   * Assigned list. RLS already scopes `assessments` to published + assigned,
   * `assessment_assignments` to rows reaching the caller, and
   * `assessment_attempts` to the caller's own (unique per assessment).
   */
  async function fetchAssigned(): Promise<{ error: string | null }> {
    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('assessments')
        .select(
          `
          id,
          title,
          description,
          time_limit_seconds,
          assessment_assignments (due_at),
          assessment_attempts (
            id,
            completed_at,
            correct_count,
            total_questions,
            score_percent
          )
        `,
        )
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      const now = Date.now()
      assigned.value = (data ?? []).map((row) => {
        const dueDates = row.assessment_assignments.map((a) => a.due_at)
        const definiteDues = dueDates.filter((d): d is string => d !== null)
        const canStart =
          dueDates.length === 0 || dueDates.some((d) => d === null || Date.parse(d) > now)
        const dueAt =
          definiteDues.length > 0
            ? definiteDues.reduce((min, d) => (Date.parse(d) < Date.parse(min) ? d : min))
            : null

        const attempt = row.assessment_attempts[0] ?? null
        const status: AssignedStatus = attempt
          ? attempt.completed_at
            ? 'completed'
            : 'in_progress'
          : 'not_started'

        return {
          id: row.id,
          title: row.title,
          description: row.description,
          timeLimitSeconds: row.time_limit_seconds,
          dueAt,
          canStart,
          status,
          attemptId: attempt?.id ?? null,
          correctCount: status === 'completed' ? (attempt?.correct_count ?? null) : null,
          totalQuestions: status === 'completed' ? (attempt?.total_questions ?? null) : null,
          scorePercent: status === 'completed' ? (attempt?.score_percent ?? null) : null,
          completedAt: attempt?.completed_at ?? null,
        }
      })

      // In-flight first, then open ones by due date (soonest first, no due date
      // last), completed at the end (most recent first).
      const statusRank: Record<AssignedStatus, number> = {
        in_progress: 0,
        not_started: 1,
        completed: 2,
      }
      assigned.value.sort((a, b) => {
        if (statusRank[a.status] !== statusRank[b.status]) {
          return statusRank[a.status] - statusRank[b.status]
        }
        if (a.status === 'completed') {
          return Date.parse(b.completedAt ?? '') - Date.parse(a.completedAt ?? '')
        }
        const aDue = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY
        const bDue = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY
        return aDue - bDue
      })

      hasLoaded.value = true
      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchAssessments')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Start (or resume) the attempt for an assessment and load the runner:
   * `start_assessment_attempt` → `get_attempt_questions` → prior answers.
   * The start RPC is idempotent — an incomplete attempt is returned with
   * `resumed: true` and its saved cursor.
   */
  async function startAttempt(assessmentId: string): Promise<{ error: string | null }> {
    isStarting.value = true
    clearRunner()

    try {
      const { data: startData, error: startError } = await supabase.rpc(
        'start_assessment_attempt',
        { p_assessment_id: assessmentId },
      )

      if (startError) throw startError

      const start = startData as unknown as {
        attempt_id: string
        started_at: string
        total_questions: number
        current_question_index: number
        time_limit_seconds: number | null
        expires_at: string | null
        resumed: boolean
      }
      if (typeof start?.attempt_id !== 'string') {
        return { error: errorMessages().failedStartAttempt }
      }

      const [{ data: questionsData, error: questionsError }, { data: assessmentRow }] =
        await Promise.all([
          supabase.rpc('get_attempt_questions', { p_attempt_id: start.attempt_id }),
          // Title for the runner header; tolerated to be missing (e.g. the
          // assessment was unpublished mid-flight — the attempt may still finish).
          supabase.from('assessments').select('title').eq('id', assessmentId).maybeSingle(),
        ])

      if (questionsError) throw questionsError

      const questions = parseRunnerQuestions(questionsData)
      if (questions.length === 0) {
        return { error: errorMessages().failedStartAttempt }
      }

      const answers = new Map<string, RunnerAnswer>()
      if (start.resumed) {
        // Named columns only — is_correct is revoked and select('*') would 42501.
        const { data: answerRows, error: answersError } = await supabase
          .from('attempt_answers')
          .select('assessment_question_id, selected_options, text_answer')
          .eq('attempt_id', start.attempt_id)

        if (answersError) throw answersError

        for (const row of answerRows ?? []) {
          answers.set(row.assessment_question_id, {
            selectedOptions: row.selected_options,
            textAnswer: row.text_answer,
          })
        }
      }

      activeAttempt.value = {
        attemptId: start.attempt_id,
        assessmentId,
        title: assessmentRow?.title ?? '',
        timeLimitSeconds: start.time_limit_seconds,
        expiresAt: start.expires_at,
        totalQuestions: questions.length,
        resumed: start.resumed === true,
      }
      runnerQuestions.value = questions
      runnerAnswers.value = answers
      currentQuestionIndex.value = Math.min(
        Math.max(start.current_question_index, 0),
        questions.length - 1,
      )

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedStartAttempt') }
    } finally {
      isStarting.value = false
    }
  }

  /**
   * Upsert one answer. Server-side triggers grade it and enforce the time
   * cutoff (+30s grace); the outcome flags let the runner react to a rejected
   * late write (force-submit) or an already-completed attempt (go to result).
   * Only the granted columns are sent — never `id` or `is_correct` — and no
   * representation is requested (default return=minimal).
   */
  async function saveAnswer(
    assessmentQuestionId: string,
    answer: { selectedOptions?: number[] | null; textAnswer?: string | null },
    timeSpentSeconds?: number,
  ): Promise<SaveAnswerOutcome> {
    if (!activeAttempt.value) {
      return {
        error: errorMessages().noActiveSession,
        timeLimitExceeded: false,
        attemptCompleted: false,
      }
    }

    const payload: RunnerAnswer = {
      selectedOptions: answer.selectedOptions ?? null,
      textAnswer: answer.textAnswer ?? null,
    }

    try {
      const { error: upsertError } = await supabase.from('attempt_answers').upsert(
        {
          attempt_id: activeAttempt.value.attemptId,
          assessment_question_id: assessmentQuestionId,
          selected_options: payload.selectedOptions,
          text_answer: payload.textAnswer,
          time_spent_seconds: timeSpentSeconds ?? null,
          answered_at: new Date().toISOString(),
        },
        { onConflict: 'attempt_id,assessment_question_id' },
      )

      if (upsertError) throw upsertError

      runnerAnswers.value.set(assessmentQuestionId, payload)
      // Reassign to keep Map mutation reactive for answered-count consumers.
      runnerAnswers.value = new Map(runnerAnswers.value)

      return { error: null, timeLimitExceeded: false, attemptCompleted: false }
    } catch (err) {
      const dbMessage = p0001Message(err)
      if (dbMessage === 'Assessment time limit exceeded') {
        return { error: null, timeLimitExceeded: true, attemptCompleted: false }
      }
      if (dbMessage?.startsWith('Attempt already completed')) {
        return { error: null, timeLimitExceeded: false, attemptCompleted: true }
      }
      return {
        error: handleError(err, 'failedSaveAnswer'),
        timeLimitExceeded: false,
        attemptCompleted: false,
      }
    }
  }

  /**
   * Persist the resumable cursor — the one narrow direct UPDATE the client
   * holds on assessment_attempts. Best-effort: a failure must not block
   * navigation, so it is logged rather than surfaced.
   */
  async function persistQuestionIndex(index: number): Promise<void> {
    if (!activeAttempt.value) return

    const { error: updateError } = await supabase
      .from('assessment_attempts')
      .update({ current_question_index: index })
      .eq('id', activeAttempt.value.attemptId)

    if (updateError) {
      console.error('Failed to persist current_question_index:', updateError)
    }
  }

  async function goToQuestion(index: number): Promise<void> {
    if (!activeAttempt.value) return
    if (index < 0 || index >= runnerQuestions.value.length) return

    currentQuestionIndex.value = index
    await persistQuestionIndex(index)
  }

  /**
   * Complete via RPC (server computes the score; idempotent — a concurrent
   * auto-submit and manual submit both receive the stored result).
   */
  async function completeAttempt(): Promise<{
    result: CompletionResult | null
    error: string | null
  }> {
    if (!activeAttempt.value) {
      return { result: null, error: errorMessages().noActiveSession }
    }

    try {
      const { data, error: completeError } = await supabase.rpc('complete_assessment_attempt', {
        p_attempt_id: activeAttempt.value.attemptId,
      })

      if (completeError) throw completeError

      const raw = data as unknown as {
        correct_count: number
        total: number
        score_percent: number
        already_completed: boolean
      }
      if (typeof raw?.correct_count !== 'number' || typeof raw?.total !== 'number') {
        return { result: null, error: errorMessages().failedCompleteAttempt }
      }

      hasLoaded.value = false // assigned list is stale now

      return {
        result: {
          correctCount: raw.correct_count,
          total: raw.total,
          scorePercent: raw.score_percent,
          alreadyCompleted: raw.already_completed === true,
        },
        error: null,
      }
    } catch (err) {
      return { result: null, error: handleError(err, 'failedCompleteAttempt') }
    }
  }

  function clearRunner() {
    activeAttempt.value = null
    runnerQuestions.value = []
    runnerAnswers.value = new Map()
    currentQuestionIndex.value = 0
  }

  /**
   * Post-completion review: correctness from `get_attempt_result` (owner path —
   * no answer key, no staff-only fields), content from `get_attempt_questions`,
   * the student's own answers from `attempt_answers` (named columns).
   */
  async function loadReview(attemptId: string): Promise<{ error: string | null }> {
    isLoadingReview.value = true
    review.value = null

    try {
      const [resultRes, questionsRes, answersRes] = await Promise.all([
        supabase.rpc('get_attempt_result', { p_attempt_id: attemptId }),
        supabase.rpc('get_attempt_questions', { p_attempt_id: attemptId }),
        supabase
          .from('attempt_answers')
          .select('assessment_question_id, selected_options, text_answer')
          .eq('attempt_id', attemptId),
      ])

      if (resultRes.error) throw resultRes.error
      if (questionsRes.error) throw questionsRes.error
      if (answersRes.error) throw answersRes.error

      const result = resultRes.data as unknown as {
        attempt_id: string
        assessment_id: string
        completed_at: string | null
        correct_count: number
        total_questions: number
        score_percent: number
        questions: {
          assessment_question_id: string
          question_order: number
          points: number
          is_correct: boolean
        }[]
      }
      if (typeof result?.attempt_id !== 'string') {
        return { error: errorMessages().failedFetchAttemptResult }
      }

      const correctnessById = new Map(
        (result.questions ?? []).map((q) => [q.assessment_question_id, q.is_correct]),
      )
      const answersById = new Map(
        (answersRes.data ?? []).map((row) => [
          row.assessment_question_id,
          { selectedOptions: row.selected_options, textAnswer: row.text_answer },
        ]),
      )

      // Title is display-only; tolerate a missing row (assessment unpublished
      // or deleted after completion).
      const { data: assessmentRow } = await supabase
        .from('assessments')
        .select('title')
        .eq('id', result.assessment_id)
        .maybeSingle()

      review.value = {
        attemptId: result.attempt_id,
        assessmentId: result.assessment_id,
        title: assessmentRow?.title ?? '',
        completedAt: result.completed_at,
        correctCount: result.correct_count,
        totalQuestions: result.total_questions,
        scorePercent: result.score_percent,
        questions: parseRunnerQuestions(questionsRes.data).map((question) => {
          const answer = answersById.get(question.assessmentQuestionId) ?? null
          return {
            ...question,
            isCorrect: correctnessById.get(question.assessmentQuestionId) ?? false,
            answered: answer !== null,
            selectedOptions: answer?.selectedOptions ?? null,
            textAnswer: answer?.textAnswer ?? null,
          }
        }),
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchAttemptResult') }
    } finally {
      isLoadingReview.value = false
    }
  }

  function $reset() {
    assigned.value = []
    isLoading.value = false
    hasLoaded.value = false
    error.value = null
    clearRunner()
    isStarting.value = false
    review.value = null
    isLoadingReview.value = false
  }

  return {
    assigned,
    isLoading,
    hasLoaded,
    error,
    pendingAssessments,
    fetchAssigned,
    // Runner
    activeAttempt,
    runnerQuestions,
    runnerAnswers,
    currentQuestionIndex,
    currentQuestion,
    answeredCount,
    isStarting,
    getAnswer,
    startAttempt,
    saveAnswer,
    goToQuestion,
    completeAttempt,
    clearRunner,
    // Review
    review,
    isLoadingReview,
    loadReview,
    $reset,
  }
})
