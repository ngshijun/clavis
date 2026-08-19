import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import type { Json } from '@/types/database.types'
import { handleError, errorMessages } from '@/lib/errors'
import type { AdhocQuestionType } from '@/lib/adhocPayload'
import type { AttemptAnswerResponse } from '@/lib/attemptResponse'

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
  /** Answers awaiting manual marking (P9b) — > 0 means the stored score is a floor. */
  pendingManualCount: number
  /** Decision 70: whether the auto subtotal may be shown while marking is pending. */
  showAutoScoreWhilePending: boolean
}

export interface RunnerOption {
  /** 1-based ordinal the grader expects in attempt_answers.selected_options. */
  number: number
  text: string
  imagePath: string | null
  /**
   * Bucket holding `imagePath`, emitted by the RPC (P10a): bank images live
   * in `question-images`, ad-hoc images in `assessment-images`. Null when
   * there is no image.
   */
  imageBucket: string | null
}

export interface RunnerItem {
  id: string
  text: string
}

export interface RunnerQuestion {
  assessmentQuestionId: string
  questionOrder: number
  points: number
  type: AdhocQuestionType
  /** Empty for a promptless cloze — render `clozeText` instead. */
  question: string
  imagePath: string | null
  /** Bucket holding `imagePath` (P10a, see RunnerOption.imageBucket). */
  imageBucket: string | null
  /** mcq / mrq only. */
  options: RunnerOption[]
  /** numeric only. */
  unit: string | null
  /** cloze only: the text with `{{n}}` placeholders (never the accepted values). */
  clozeText: string | null
  /** cloze only: the graded blank indices, ascending. */
  clozeBlankIndices: number[]
  /** matching only. `right` arrives pre-scrambled per attempt — do NOT re-shuffle. */
  matchingLeft: RunnerItem[]
  matchingRight: RunnerItem[]
  /** ordering only — pre-scrambled per attempt. */
  orderingItems: RunnerItem[]
}

export interface RunnerAnswer {
  selectedOptions: number[] | null
  textAnswer: string | null
  response: AttemptAnswerResponse | null
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

/**
 * The per-type answer key, present ONLY when the teacher has released the
 * answers (`answers_revealed` — decision 71). Normalized from the RPC's
 * `correct` object; fields are per question type.
 */
export interface ReviewCorrectInfo {
  /** mcq / mrq — 1-based option ordinals. */
  correctOptions: number[] | null
  /** true_false */
  answerBoolean: boolean | null
  /** numeric */
  answerNumber: number | null
  tolerance: number | null
  /** short_answer (bank or ad-hoc) */
  acceptedAnswers: string[] | null
  /** cloze */
  blanks: { index: number; accepted: string[] }[] | null
  /** matching */
  pairs: { left_id: string; right_id: string }[] | null
  /** ordering */
  correctOrder: string[] | null
  /** long_answer */
  rubric: string | null
  /** ad-hoc questions with an authored explanation. */
  explanation: string | null
}

export interface ReviewQuestion extends RunnerQuestion {
  answered: boolean
  /**
   * null = awaiting marking (or the whole score is withheld); false includes
   * unanswered questions (server contract).
   */
  isCorrect: boolean | null
  /** Server-computed partial credit; null when unanswered, pending or withheld. */
  awardedPoints: number | null
  /** Teacher feedback on a marked answer; null while pending or withheld. */
  markerComment: string | null
  selectedOptions: number[] | null
  textAnswer: string | null
  response: AttemptAnswerResponse | null
  /** Present only when `answersRevealed`. */
  correct: ReviewCorrectInfo | null
}

export interface AttemptReview {
  attemptId: string
  assessmentId: string
  title: string
  completedAt: string | null
  totalQuestions: number
  /** Answers awaiting manual marking (live). */
  pendingCount: number
  /** Decision 70: true → every score field below is null ("awaiting marking"). */
  scoreWithheld: boolean
  /** Decision 71: true → each question carries its `correct` key. */
  answersRevealed: boolean
  correctCount: number | null
  scorePercent: number | null
  pointsAwarded: number | null
  pointsTotal: number | null
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

interface RawRunnerItem {
  id: string
  text: string | null
}

function parseItems(raw: RawRunnerItem[] | undefined): RunnerItem[] {
  return (raw ?? []).map((item) => ({ id: item.id, text: item.text ?? '' }))
}

function parseRunnerQuestions(raw: unknown): RunnerQuestion[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      const q = entry as {
        assessment_question_id: string
        question_order: number
        points: number
        type: AdhocQuestionType
        question: string | null
        image_path: string | null
        image_bucket: string | null
        options: {
          number: number
          text: string | null
          image_path: string | null
          image_bucket: string | null
        }[]
        unit?: string | null
        text?: string | null
        blanks?: { index: number }[]
        left?: RawRunnerItem[]
        right?: RawRunnerItem[]
        items?: RawRunnerItem[]
      }
      return {
        assessmentQuestionId: q.assessment_question_id,
        questionOrder: q.question_order,
        points: q.points,
        type: q.type,
        question: q.question ?? '',
        imagePath: q.image_path ?? null,
        imageBucket: q.image_bucket ?? null,
        options: (q.options ?? []).map((option) => ({
          number: option.number,
          text: option.text ?? '',
          imagePath: option.image_path ?? null,
          imageBucket: option.image_bucket ?? null,
        })),
        unit: q.unit ?? null,
        clozeText: q.text ?? null,
        clozeBlankIndices: (q.blanks ?? [])
          .map((blank) => blank.index)
          .filter((index) => Number.isInteger(index) && index >= 1)
          .sort((a, b) => a - b),
        matchingLeft: parseItems(q.left),
        matchingRight: parseItems(q.right),
        orderingItems: parseItems(q.items),
      }
    })
    .sort((a, b) => a.questionOrder - b.questionOrder)
}

/** Normalize the RPC's per-question `correct` object (P9B-HANDOFF §5). */
function parseCorrectInfo(raw: unknown): ReviewCorrectInfo | null {
  if (typeof raw !== 'object' || raw === null) return null
  const c = raw as {
    correct_options?: number[]
    answer?: boolean | number
    tolerance?: number | null
    accepted_answers?: string[]
    blanks?: { index: number; accepted: string[] }[]
    pairs?: { left_id: string; right_id: string }[]
    correct_order?: string[]
    rubric?: string | null
    explanation?: string | null
  }
  return {
    correctOptions: c.correct_options ?? null,
    answerBoolean: typeof c.answer === 'boolean' ? c.answer : null,
    answerNumber: typeof c.answer === 'number' ? c.answer : null,
    tolerance: typeof c.tolerance === 'number' ? c.tolerance : null,
    acceptedAnswers: c.accepted_answers ?? null,
    blanks: c.blanks ?? null,
    pairs: c.pairs ?? null,
    correctOrder: c.correct_order ?? null,
    rubric: c.rubric ?? null,
    explanation: c.explanation ?? null,
  }
}

/**
 * Student-side assessment surface: assigned list, the timed resumable runner,
 * and the post-completion review.
 *
 * Security contracts (P3a decisions 32–33, P9a–b) this store is built around:
 * - Question content comes ONLY from the `get_attempt_questions` RPC —
 *   students have no SELECT path on `assessment_questions`, and the RPC is
 *   key-free (matching `right` / ordering `items` arrive pre-scrambled).
 * - Correctness, score visibility and the released answer keys come ONLY from
 *   the `get_attempt_result` RPC after completion — `attempt_answers.is_correct`
 *   and `awarded_points` are column-revoked, so every read of `attempt_answers`
 *   names its columns explicitly (a `select('*')` errors).
 * - Attempts are created/scored only via the `start_assessment_attempt` /
 *   `complete_assessment_attempt` RPCs; the single direct attempt write is the
 *   `current_question_index` cursor.
 */
export const useStudentAssessmentsStore = defineStore('student-assessments', () => {
  const assigned = ref<AssignedAssessment[]>([])
  const isLoading = ref(false)
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
   * Assigned list for ONE classroom (decision 79). RLS already scopes
   * `assessments` to published + assigned, `assessment_assignments` to rows
   * reaching the caller, and `assessment_attempts` to the caller's own (unique
   * per assessment); the classroom filter narrows that to the classroom the
   * student is currently looking at.
   *
   * An assessment reaches the student either through the classroom itself or
   * through an individual assignment. Individually-targeted rows carry no
   * classroom_id, so they are matched on the assessment's own grade+subject
   * pairing instead — which P8 already guarantees lines up with a classroom
   * the student belongs to.
   */
  async function fetchAssigned(
    classroom: { id: string; gradeLevelId: string; subjectId: string } | null,
  ): Promise<{ error: string | null }> {
    if (!classroom) {
      assigned.value = []
      return { error: null }
    }

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
          show_auto_score_while_pending,
          grade_level_id,
          subject_id,
          assessment_assignments (due_at, classroom_id),
          assessment_attempts (
            id,
            completed_at,
            correct_count,
            total_questions,
            score_percent,
            pending_manual_count
          )
        `,
        )
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      const now = Date.now()

      // Keep only the assignments that reach the student *through this
      // classroom*, so a due date set for another classroom can never gate
      // this one's CTA.
      const inScope = (data ?? [])
        .map((row) => ({
          row,
          assignments: row.assessment_assignments.filter(
            (a) =>
              a.classroom_id === classroom.id ||
              (a.classroom_id === null &&
                row.grade_level_id === classroom.gradeLevelId &&
                row.subject_id === classroom.subjectId),
          ),
        }))
        .filter((entry) => entry.assignments.length > 0)

      assigned.value = inScope.map(({ row, assignments }) => {
        const dueDates = assignments.map((a) => a.due_at)
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
          pendingManualCount: status === 'completed' ? (attempt?.pending_manual_count ?? 0) : 0,
          showAutoScoreWhilePending: row.show_auto_score_while_pending,
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
        // Named columns only — is_correct/awarded_points are revoked and
        // select('*') would 42501.
        const { data: answerRows, error: answersError } = await supabase
          .from('attempt_answers')
          .select('assessment_question_id, selected_options, text_answer, response')
          .eq('attempt_id', start.attempt_id)

        if (answersError) throw answersError

        for (const row of answerRows ?? []) {
          answers.set(row.assessment_question_id, {
            selectedOptions: row.selected_options,
            textAnswer: row.text_answer,
            response: (row.response as AttemptAnswerResponse | null) ?? null,
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
      return { error: handleError(err, 'failedStartAttempt', { localizeRaise: true }) }
    } finally {
      isStarting.value = false
    }
  }

  /**
   * Upsert one answer. Server-side triggers grade it and enforce the time
   * cutoff (+30s grace); the outcome flags let the runner react to a rejected
   * late write (force-submit) or an already-completed attempt (go to result).
   * Only the granted columns are sent — never `id`, `is_correct` or
   * `awarded_points` — and no representation is requested (default
   * return=minimal). `response` carries the P9a structured shapes
   * (true_false/cloze/matching/ordering); `textAnswer` carries
   * short_answer/numeric/long_answer; `selectedOptions` carries mcq/mrq.
   */
  async function saveAnswer(
    assessmentQuestionId: string,
    answer: {
      selectedOptions?: number[] | null
      textAnswer?: string | null
      response?: AttemptAnswerResponse | null
    },
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
      response: answer.response ?? null,
    }

    try {
      const { error: upsertError } = await supabase.from('attempt_answers').upsert(
        {
          attempt_id: activeAttempt.value.attemptId,
          assessment_question_id: assessmentQuestionId,
          selected_options: payload.selectedOptions,
          text_answer: payload.textAnswer,
          response: payload.response as Json,
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
        error: handleError(err, 'failedSaveAnswer', { localizeRaise: true }),
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
      return {
        result: null,
        error: handleError(err, 'failedCompleteAttempt', { localizeRaise: true }),
      }
    }
  }

  function clearRunner() {
    activeAttempt.value = null
    runnerQuestions.value = []
    runnerAnswers.value = new Map()
    currentQuestionIndex.value = 0
  }

  /**
   * Post-completion review. Visibility is driven ENTIRELY by
   * `get_attempt_result` (P9b contract): `score_withheld` nulls every score
   * field, `answers_revealed` gates the per-question `correct` key, and the
   * owner's own submission rides along. `get_attempt_questions` supplies the
   * sanitized question content (same per-attempt scramble as the runner).
   */
  async function loadReview(attemptId: string): Promise<{ error: string | null }> {
    isLoadingReview.value = true
    review.value = null

    try {
      const [resultRes, questionsRes] = await Promise.all([
        supabase.rpc('get_attempt_result', { p_attempt_id: attemptId }),
        supabase.rpc('get_attempt_questions', { p_attempt_id: attemptId }),
      ])

      if (resultRes.error) throw resultRes.error
      if (questionsRes.error) throw questionsRes.error

      const result = resultRes.data as unknown as {
        attempt_id: string
        assessment_id: string
        completed_at: string | null
        total_questions: number
        pending_count: number
        score_withheld: boolean
        answers_revealed: boolean
        correct_count: number | null
        score_percent: number | null
        points_awarded: number | null
        points_total: number | null
        questions: {
          assessment_question_id: string
          question_order: number
          points: number
          answer_id: string | null
          is_correct: boolean | null
          awarded_points: number | null
          marker_comment: string | null
          selected_options: number[] | null
          text_answer: string | null
          response: AttemptAnswerResponse | null
          answered_at: string | null
          correct?: unknown
        }[]
      }
      if (typeof result?.attempt_id !== 'string') {
        return { error: errorMessages().failedFetchAttemptResult }
      }

      const resultById = new Map((result.questions ?? []).map((q) => [q.assessment_question_id, q]))

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
        totalQuestions: result.total_questions,
        pendingCount: result.pending_count ?? 0,
        scoreWithheld: result.score_withheld === true,
        answersRevealed: result.answers_revealed === true,
        correctCount: result.correct_count ?? null,
        scorePercent: result.score_percent ?? null,
        pointsAwarded: result.points_awarded ?? null,
        pointsTotal: result.points_total ?? null,
        questions: parseRunnerQuestions(questionsRes.data).map((question) => {
          const graded = resultById.get(question.assessmentQuestionId)
          return {
            ...question,
            answered: (graded?.answer_id ?? null) !== null,
            isCorrect: graded?.is_correct ?? null,
            awardedPoints: graded?.awarded_points ?? null,
            markerComment: graded?.marker_comment ?? null,
            selectedOptions: graded?.selected_options ?? null,
            textAnswer: graded?.text_answer ?? null,
            response: graded?.response ?? null,
            correct: result.answers_revealed ? parseCorrectInfo(graded?.correct) : null,
          }
        }),
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchAttemptResult', { localizeRaise: true }) }
    } finally {
      isLoadingReview.value = false
    }
  }

  function $reset() {
    assigned.value = []
    isLoading.value = false
    error.value = null
    clearRunner()
    isStarting.value = false
    review.value = null
    isLoadingReview.value = false
  }

  return {
    assigned,
    isLoading,
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
