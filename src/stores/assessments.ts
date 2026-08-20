import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import type { Database, Json } from '@/types/database.types'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'
import {
  collectAdhocPayloadImagePaths,
  payloadPrompt,
  type AdhocPayload,
  type AdhocQuestionType,
} from '@/lib/adhocPayload'
import { removeStorageFolder, removeStorageObjects } from '@/lib/storage'
import type { AttemptAnswerResponse } from '@/lib/attemptResponse'

export type { AttemptAnswerResponse }

export type AssessmentStatus = Database['public']['Enums']['assessment_status']
export type QuestionType = Database['public']['Enums']['question_type']
type QuestionRow = Database['public']['Tables']['questions']['Row']

/**
 * The bank columns a staff member may actually SELECT: `answer`,
 * `option_N_is_correct` and `option_N_tip` are revoked from `authenticated`
 * (P11a/decision 76), so the embed MUST name its columns — `questions (*)`
 * fails with 42501 for teachers, managers and admins alike.
 */
const BANK_QUESTION_EMBED =
  'id, type, question, image_path, option_1_text, option_1_image_path, option_2_text, option_2_image_path, option_3_text, option_3_image_path, option_4_text, option_4_image_path'

/** A bank question as embedded by BANK_QUESTION_EMBED — content only, no key. */
type BankQuestionContent = Pick<
  QuestionRow,
  | 'id'
  | 'type'
  | 'question'
  | 'image_path'
  | 'option_1_text'
  | 'option_1_image_path'
  | 'option_2_text'
  | 'option_2_image_path'
  | 'option_3_text'
  | 'option_3_image_path'
  | 'option_4_text'
  | 'option_4_image_path'
>
type AssessmentQuestionRow = Database['public']['Tables']['assessment_questions']['Row']

export interface AssessmentListItem {
  id: string
  title: string
  description: string | null
  status: AssessmentStatus
  /** Platform-wide template (admin-authored, org-less, never assignable). */
  isTemplate: boolean
  /**
   * Grade+subject scope (P8a). TEMPLATES ONLY: it decides which centers may
   * see and clone a template. Non-templates carry NULL and are scoped by
   * `classroomId` instead (decision 81) — the pairing cannot identify a
   * classroom, since two classrooms may share one.
   */
  gradeLevelId: string | null
  gradeLevelName: string | null
  subjectId: string | null
  subjectName: string | null
  timeLimitSeconds: number | null
  shuffleQuestions: boolean
  /**
   * Decision 70: while a submitted attempt still has unmarked long answers,
   * `true` shows the student their auto-marked subtotal, `false` withholds
   * the score entirely ("awaiting marking"). Ordinary authoring setting —
   * editable through the normal assessment update path.
   */
  showAutoScoreWhilePending: boolean
  /**
   * Decision 71: non-null once a teacher released the answer keys to
   * students. Written ONLY by the `release_assessment_answers` RPC — the
   * column is not client-writable.
   */
  answersReleasedAt: string | null
  /** The owning classroom (decision 81). NULL only for templates. */
  classroomId: string | null
  /**
   * Embedded with the row rather than looked up in a store: which store holds
   * the classroom list differs by role, and a manager holds none at all.
   */
  classroomName: string | null
  createdBy: string
  createdByName: string
  questionCount: number
  createdAt: string
  updatedAt: string
}

export interface AssessmentQuestionItem {
  id: string
  assessmentId: string
  position: number
  points: number
  source: 'bank' | 'adhoc'
  questionId: string | null
  type: AdhocQuestionType
  question: string
  /**
   * Question-level image. Bank questions store it in `question-images`;
   * ad-hoc payload images live in `assessment-images` (P10a) — resolve the
   * bucket from `source`.
   */
  imagePath: string | null
  /** Display options (mcq/mrq); `number` is the 1-based ordinal the grader expects. */
  options: { number: number; text: string; imagePath: string | null }[]
  /** Raw payload for ad-hoc edit round-trips and result rendering; null for bank questions. */
  payload: AdhocPayload | null
}

export interface AssessmentAssignment {
  id: string
  assessmentId: string
  classroomId: string | null
  classroomName: string | null
  studentId: string | null
  studentName: string | null
  dueAt: string | null
  createdAt: string
}

export interface AssessmentAttempt {
  id: string
  studentId: string
  studentName: string
  studentUsername: string | null
  startedAt: string
  completedAt: string | null
  correctCount: number
  totalQuestions: number
  scorePercent: number
  /** Answers still awaiting manual marking (P9b) — > 0 means the score is a floor. */
  pendingManualCount: number
}

export interface AttemptResultQuestion {
  assessmentQuestionId: string
  questionOrder: number
  points: number
  /** `attempt_answers.id` — what `mark_attempt_answer` takes; null when unanswered. */
  answerId: string | null
  /** false = wrong or unanswered, null = answered but AWAITING MARKING. */
  isCorrect: boolean | null
  /** Server-computed partial credit; null when unanswered or pending. */
  awardedPoints: number | null
  markerComment: string | null
  markedAt: string | null
  selectedOptions: number[] | null
  textAnswer: string | null
  response: AttemptAnswerResponse | null
  answeredAt: string | null
}

export interface AttemptResult {
  attemptId: string
  assessmentId: string
  studentId: string
  startedAt: string
  completedAt: string | null
  correctCount: number
  totalQuestions: number
  scorePercent: number
  /** Live count of answers awaiting manual marking. */
  pendingCount: number
  pointsAwarded: number | null
  pointsTotal: number | null
  answersReleasedAt: string | null
  questions: AttemptResultQuestion[]
}

/** `mark_attempt_answer` return — attempt totals AFTER the server recompute. */
export interface MarkAnswerResult {
  answerId: string
  attemptId: string
  awardedPoints: number
  isCorrect: boolean
  markedAt: string
  correctCount: number
  totalQuestions: number
  scorePercent: number
  pendingCount: number
}

/** Display fields derived from an ad-hoc payload (list rows, result dialogs). */
function adhocDisplayFields(payload: AdhocPayload): {
  type: AdhocQuestionType
  question: string
  imagePath: string | null
  options: { number: number; text: string; imagePath: string | null }[]
} {
  return {
    type: payload.type ?? 'mcq',
    question: payloadPrompt(payload) ?? '',
    imagePath: payload.image_path ?? null,
    options:
      payload.type === 'mcq' || payload.type === 'mrq'
        ? payload.options.map((option, index) => ({
            number: index + 1,
            text: option.text,
            imagePath: option.image_path ?? null,
          }))
        : [],
  }
}

function rowToAssessmentQuestion(
  row: AssessmentQuestionRow & { questions: BankQuestionContent | null },
): AssessmentQuestionItem {
  if (row.question_id && row.questions) {
    const bank = row.questions
    const bankOptions = [
      { text: bank.option_1_text, imagePath: bank.option_1_image_path },
      { text: bank.option_2_text, imagePath: bank.option_2_image_path },
      { text: bank.option_3_text, imagePath: bank.option_3_image_path },
      { text: bank.option_4_text, imagePath: bank.option_4_image_path },
    ]
    return {
      id: row.id,
      assessmentId: row.assessment_id,
      position: row.position,
      points: row.points,
      source: 'bank',
      questionId: row.question_id,
      type: bank.type,
      question: bank.question,
      imagePath: bank.image_path,
      options:
        bank.type === 'short_answer'
          ? []
          : bankOptions
              .map((option, index) => ({
                number: index + 1,
                text: option.text ?? '',
                imagePath: option.imagePath,
              }))
              .filter((option) => Boolean(option.text) || Boolean(option.imagePath)),
      payload: null,
    }
  }

  const payload = (row.payload ?? {}) as unknown as AdhocPayload
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    position: row.position,
    points: row.points,
    source: 'adhoc',
    questionId: null,
    ...adhocDisplayFields(payload),
    payload,
  }
}

/**
 * Staff (teacher/manager) assessment surface: list + builder + assignments +
 * attempts. RLS scopes every read to the caller's organization; writes are
 * limited to managers and the creating teacher.
 *
 * Per-attempt correctness is served ONLY by the `get_attempt_result` RPC —
 * `attempt_answers.is_correct` is column-revoked and any direct read of it
 * fails with 42501 (P3a decisions 32–33).
 */
export const useAssessmentsStore = defineStore('assessments', () => {
  const authStore = useAuthStore()

  const assessments = ref<AssessmentListItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Staff template library (platform templates, cross-center read-only)
  const templates = ref<AssessmentListItem[]>([])
  const isLoadingTemplates = ref(false)

  const filters = ref({ search: '' })
  const pagination = ref({ pageIndex: 0, pageSize: 10 })

  // Builder state for the assessment currently open (keyed by id)
  const currentAssessment = ref<AssessmentListItem | null>(null)
  const currentQuestions = ref<AssessmentQuestionItem[]>([])
  const currentAssignments = ref<AssessmentAssignment[]>([])
  const currentAttempts = ref<AssessmentAttempt[]>([])
  const isLoadingCurrent = ref(false)

  const filteredAssessments = computed(() => {
    const query = filters.value.search.toLowerCase().trim()
    if (!query) return assessments.value

    return assessments.value.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.createdByName.toLowerCase().includes(query),
    )
  })

  /**
   * Managers may edit any org assessment; teachers only their own (RLS
   * mirror). Admins may edit any template (admin FOR ALL policy).
   */
  /**
   * Managers are deliberately excluded (decision 80): their role is to manage
   * people and read data, not to author teaching material. The exclusion is
   * unconditional — a manager who authored an assessment before this rule
   * still cannot edit it — and the DB enforces the same thing, so this only
   * decides which controls are worth rendering.
   */
  function canEdit(item: Pick<AssessmentListItem, 'createdBy'>): boolean {
    if (authStore.isManager) return false
    return authStore.isAdmin || item.createdBy === authStore.user?.id
  }

  const ASSESSMENT_SELECT = `
    id,
    title,
    description,
    status,
    is_template,
    grade_level_id,
    subject_id,
    time_limit_seconds,
    shuffle_questions,
    show_auto_score_while_pending,
    answers_released_at,
    created_by,
    created_at,
    updated_at,
    profiles!assessments_created_by_fkey (name),
    grade_levels!assessments_grade_level_id_fkey (name),
    subjects!assessments_subject_id_fkey (name),
    classroom_id,
    classrooms!assessments_classroom_id_fkey (name),
    assessment_questions (count)
  `

  interface AssessmentSelectRow {
    id: string
    title: string
    description: string | null
    status: AssessmentStatus
    is_template: boolean
    grade_level_id: string | null
    subject_id: string | null
    time_limit_seconds: number | null
    shuffle_questions: boolean
    show_auto_score_while_pending: boolean
    answers_released_at: string | null
    created_by: string
    created_at: string
    updated_at: string
    profiles: { name: string } | null
    grade_levels: { name: string } | null
    subjects: { name: string } | null
    classroom_id: string | null
    classrooms: { name: string } | null
    assessment_questions: { count: number }[]
  }

  function rowToListItem(row: AssessmentSelectRow): AssessmentListItem {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      isTemplate: row.is_template,
      gradeLevelId: row.grade_level_id,
      gradeLevelName: row.grade_levels?.name ?? null,
      subjectId: row.subject_id,
      subjectName: row.subjects?.name ?? null,
      timeLimitSeconds: row.time_limit_seconds,
      shuffleQuestions: row.shuffle_questions,
      showAutoScoreWhilePending: row.show_auto_score_while_pending,
      answersReleasedAt: row.answers_released_at,
      classroomId: row.classroom_id,
      classroomName: row.classrooms?.name ?? null,
      createdBy: row.created_by,
      createdByName: row.profiles?.name ?? '',
      questionCount: row.assessment_questions[0]?.count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  /**
   * Admin lists platform templates; org staff list their org's assessments.
   * The `is_template` filter is load-bearing for staff: templates are
   * RLS-readable cross-center (P7a) and would otherwise pollute the org list.
   */
  /**
   * Org assessments, narrowed to the selected classroom for staff (decisions
   * 79/81). Admins are unscoped — they work on the platform template library,
   * which belongs to no classroom — so `classroomId` is ignored for them.
   *
   * The bound is the assessment's own `classroom_id`. It is set at creation
   * and never null for a non-template, so there is no "draft with no
   * classroom" case to special-case any more, and no reliance on the
   * grade+subject pairing, which cannot tell two classrooms of the same grade
   * and subject apart.
   */
  async function fetchAssessments(classroomId: string | null): Promise<{ error: string | null }> {
    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('assessments')
        .select(ASSESSMENT_SELECT)
        .eq('is_template', authStore.isAdmin)
        .order('updated_at', { ascending: false })

      if (fetchError) throw fetchError

      const rows = (data ?? []) as unknown as AssessmentSelectRow[]
      const scoped =
        authStore.isAdmin || !classroomId
          ? rows
          : rows.filter((row) => row.classroom_id === classroomId)

      assessments.value = scoped.map(rowToListItem)

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
   * The platform template library, for org staff (manager/teacher).
   * DELIBERATELY separate from `fetchAssessments` — that one hard-filters
   * staff to `is_template=false` so templates never pollute the org list.
   * Templates are read-only for staff; "using" one goes through
   * `cloneTemplate`.
   */
  async function fetchTemplates(): Promise<{ error: string | null }> {
    isLoadingTemplates.value = true

    try {
      const { data, error: fetchError } = await supabase
        .from('assessments')
        .select(ASSESSMENT_SELECT)
        .eq('is_template', true)
        .order('title')

      if (fetchError) throw fetchError

      templates.value = ((data ?? []) as unknown as AssessmentSelectRow[]).map(rowToListItem)

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchTemplates') }
    } finally {
      isLoadingTemplates.value = false
    }
  }

  /**
   * Clone a platform template INTO a classroom (decision 81): the clone is a
   * normal editable draft owned by that classroom; the template is untouched.
   * The RPC checks the caller teaches the classroom and that it matches the
   * template's grade+subject. Returns the new assessment id.
   */
  async function cloneTemplate(
    templateId: string,
    classroomId: string,
  ): Promise<{ id: string | null; error: string | null }> {
    try {
      const { data, error: rpcError } = await supabase.rpc('clone_assessment_template', {
        p_template_id: templateId,
        p_classroom_id: classroomId,
      })

      if (rpcError) throw rpcError

      // No refetch here: both callers navigate straight into the new
      // assessment's builder, and the list reloads on mount anyway now that it
      // is keyed to the selected classroom.
      return { id: data, error: null }
    } catch (err) {
      return { id: null, error: handleError(err, 'failedCloneTemplate') }
    }
  }

  /**
   * Admin creates a platform TEMPLATE (is_template=true, no org — the DB
   * CHECK requires org NULL for templates; a template must also carry a
   * grade+subject pairing, P8a CHECK); org staff create a normal, unscoped
   * org assessment.
   */
  /**
   * Admin templates are platform-wide and carry a grade+subject pairing;
   * everything else is born INTO a classroom (decision 81) and carries
   * `classroom_id` instead. Both are enforced by a DB CHECK, and RLS
   * additionally requires the caller to teach the classroom.
   */
  async function createAssessment(input: {
    title: string
    /** REQUIRED for admin templates (the DB CHECK rejects an unpaired template). */
    gradeLevelId?: string
    subjectId?: string
    /** REQUIRED for staff assessments — the classroom the assessment belongs to. */
    classroomId?: string
  }): Promise<{ id: string | null; error: string | null }> {
    const userId = authStore.user?.id
    const organizationId = authStore.organizationId
    if (!userId || (!authStore.isAdmin && !organizationId)) {
      return { id: null, error: errorMessages().notAuthenticated }
    }
    if (authStore.isAdmin && (!input.gradeLevelId || !input.subjectId)) {
      return { id: null, error: errorMessages().dbMissingField }
    }
    if (!authStore.isAdmin && !input.classroomId) {
      return { id: null, error: errorMessages().dbMissingField }
    }

    try {
      const { data, error: insertError } = await supabase
        .from('assessments')
        .insert(
          authStore.isAdmin
            ? {
                title: input.title,
                is_template: true,
                grade_level_id: input.gradeLevelId,
                subject_id: input.subjectId,
                created_by: userId,
              }
            : {
                title: input.title,
                organization_id: organizationId,
                created_by: userId,
                classroom_id: input.classroomId,
              },
        )
        .select('id')
        .single()

      if (insertError) throw insertError

      return { id: data.id, error: null }
    } catch (err) {
      return { id: null, error: handleError(err, 'failedCreateAssessment') }
    }
  }

  async function updateAssessment(
    id: string,
    updates: {
      title?: string
      description?: string | null
      timeLimitSeconds?: number | null
      shuffleQuestions?: boolean
      showAutoScoreWhilePending?: boolean
      /**
       * Template pairing edit (admin). Always pass BOTH — the DB CHECK
       * forbids a half-set pairing and a template without one.
       */
      gradeLevelId?: string
      subjectId?: string
    },
  ): Promise<{ error: string | null }> {
    try {
      const updateData: Database['public']['Tables']['assessments']['Update'] = {}
      if (updates.title !== undefined) updateData.title = updates.title
      if (updates.description !== undefined) updateData.description = updates.description
      if (updates.timeLimitSeconds !== undefined) {
        updateData.time_limit_seconds = updates.timeLimitSeconds
      }
      if (updates.shuffleQuestions !== undefined) {
        updateData.shuffle_questions = updates.shuffleQuestions
      }
      if (updates.showAutoScoreWhilePending !== undefined) {
        updateData.show_auto_score_while_pending = updates.showAutoScoreWhilePending
      }
      if (updates.gradeLevelId !== undefined && updates.subjectId !== undefined) {
        updateData.grade_level_id = updates.gradeLevelId
        updateData.subject_id = updates.subjectId
      }

      const { error: updateError } = await supabase
        .from('assessments')
        .update(updateData)
        .eq('id', id)

      if (updateError) throw updateError

      // Re-read through the plain SELECT path rather than a mutation-returning
      // representation: ASSESSMENT_SELECT carries an aggregate embed, which is
      // not a shape we rely on PostgREST supporting on a mutation.
      if (currentAssessment.value?.id === id) {
        const { data, error: refetchError } = await supabase
          .from('assessments')
          .select(ASSESSMENT_SELECT)
          .eq('id', id)
          .single()

        if (refetchError) throw refetchError

        currentAssessment.value = rowToListItem(data as unknown as AssessmentSelectRow)
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateAssessment') }
    }
  }

  async function publishAssessment(id: string): Promise<{ error: string | null }> {
    // Guard: an empty assessment must not be published (start_assessment_attempt
    // would reject every student with "Assessment has no questions").
    if (currentAssessment.value?.id === id && currentQuestions.value.length === 0) {
      return { error: errorMessages().assessmentNoQuestions }
    }

    try {
      const { error: updateError } = await supabase
        .from('assessments')
        .update({ status: 'published' })
        .eq('id', id)

      if (updateError) throw updateError

      if (currentAssessment.value?.id === id) {
        currentAssessment.value = { ...currentAssessment.value, status: 'published' }
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedPublishAssessment') }
    }
  }

  async function deleteAssessment(id: string): Promise<{ error: string | null }> {
    // Storage cleanup (decision 78): every image of this assessment lives
    // under `assessment-images/{id}/`. The bucket's delete RLS requires the
    // assessments ROW to still exist (app.can_write_assessment), so the
    // objects must go BEFORE the row — best-effort, a storage failure never
    // blocks the delete (an orphan beats a stuck assessment).
    await removeStorageFolder('assessment-images', id)
    try {
      const { error: deleteError } = await supabase.from('assessments').delete().eq('id', id)

      if (deleteError) throw deleteError

      assessments.value = assessments.value.filter((a) => a.id !== id)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedDeleteAssessment') }
    }
  }

  /** Load one assessment plus its questions into the builder state. */
  async function fetchAssessmentDetail(id: string): Promise<{ error: string | null }> {
    isLoadingCurrent.value = true
    currentAssessment.value = null
    currentQuestions.value = []
    currentAssignments.value = []
    currentAttempts.value = []

    try {
      const [{ data: assessmentRow, error: assessmentError }, questionsResult] = await Promise.all([
        supabase.from('assessments').select(ASSESSMENT_SELECT).eq('id', id).single(),
        fetchAssessmentQuestions(id),
      ])

      if (assessmentError) throw assessmentError
      if (questionsResult.error) return { error: questionsResult.error }

      currentAssessment.value = rowToListItem(assessmentRow as unknown as AssessmentSelectRow)

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchAssessments') }
    } finally {
      isLoadingCurrent.value = false
    }
  }

  async function fetchAssessmentQuestions(assessmentId: string): Promise<{
    error: string | null
  }> {
    try {
      const { data, error: fetchError } = await supabase
        .from('assessment_questions')
        .select(`*, questions (${BANK_QUESTION_EMBED})`)
        .eq('assessment_id', assessmentId)
        .order('position')

      if (fetchError) throw fetchError

      currentQuestions.value = (data ?? []).map((row) => rowToAssessmentQuestion(row))

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchAssessmentQuestions') }
    }
  }

  function nextPosition(): number {
    return currentQuestions.value.reduce((max, q) => Math.max(max, q.position), -1) + 1
  }

  async function addBankQuestions(
    assessmentId: string,
    questionIds: string[],
  ): Promise<{ error: string | null }> {
    if (questionIds.length === 0) return { error: null }

    try {
      const base = nextPosition()
      const { error: insertError } = await supabase.from('assessment_questions').insert(
        questionIds.map((questionId, index) => ({
          assessment_id: assessmentId,
          question_id: questionId,
          position: base + index,
        })),
      )

      if (insertError) throw insertError

      return await fetchAssessmentQuestions(assessmentId)
    } catch (err) {
      return { error: handleError(err, 'failedAddAssessmentQuestions') }
    }
  }

  /**
   * Copy questions out of the admin question bank (P13a) into this
   * assessment. A COPY, not a link: a later bank edit must never mutate a
   * published assessment or an in-flight attempt, and the payload contract is
   * identical, so the copied rows need no translation and no new grader path.
   */
  async function addQuestionsFromBank(
    assessmentId: string,
    entries: { payload: AdhocPayload; points: number }[],
  ): Promise<{ error: string | null }> {
    if (entries.length === 0) return { error: null }

    try {
      const base = nextPosition()
      const { error: insertError } = await supabase.from('assessment_questions').insert(
        entries.map((entry, index) => ({
          assessment_id: assessmentId,
          payload: entry.payload as unknown as Json,
          points: entry.points,
          position: base + index,
        })),
      )

      if (insertError) throw insertError

      return await fetchAssessmentQuestions(assessmentId)
    } catch (err) {
      return { error: handleError(err, 'failedAddAssessmentQuestions') }
    }
  }

  /** Insert an ad-hoc question and return its id (the builder expands it). */
  async function addAdhocQuestion(
    assessmentId: string,
    payload: AdhocPayload,
  ): Promise<{ id: string | null; error: string | null }> {
    try {
      const { data, error: insertError } = await supabase
        .from('assessment_questions')
        .insert({
          assessment_id: assessmentId,
          payload: payload as unknown as Json,
          position: nextPosition(),
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      const { error } = await fetchAssessmentQuestions(assessmentId)
      return { id: data.id, error }
    } catch (err) {
      return { id: null, error: handleError(err, 'failedAddAssessmentQuestions') }
    }
  }

  /**
   * Optimistic local payload update for the Forms-style inline card
   * (autosave). Rewrites the derived display fields in place and returns the
   * previous payload (the rollback baseline), or null for an unknown /
   * bank-sourced question.
   */
  function applyAdhocPayload(id: string, payload: AdhocPayload): AdhocPayload | null {
    const item = currentQuestions.value.find((q) => q.id === id)
    if (!item || item.source !== 'adhoc' || !item.payload) return null
    const previous = item.payload
    Object.assign(item, adhocDisplayFields(payload), { payload })
    return previous
  }

  /** Persist an ad-hoc payload (DB only — local state is applied optimistically). */
  async function persistAdhocPayload(
    id: string,
    payload: AdhocPayload,
  ): Promise<{ error: string | null }> {
    try {
      const { error: updateError } = await supabase
        .from('assessment_questions')
        .update({ payload: payload as unknown as Json })
        .eq('id', id)

      if (updateError) throw updateError
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateAssessmentQuestion') }
    }
  }

  /** Optimistic local points update; returns the previous points, or null. */
  function applyQuestionPoints(id: string, points: number): number | null {
    const item = currentQuestions.value.find((q) => q.id === id)
    if (!item) return null
    const previous = item.points
    item.points = points
    return previous
  }

  /** Persist a question's points (DB only — local state is applied optimistically). */
  async function persistQuestionPoints(
    id: string,
    points: number,
  ): Promise<{ error: string | null }> {
    try {
      const { error: updateError } = await supabase
        .from('assessment_questions')
        .update({ points })
        .eq('id', id)

      if (updateError) throw updateError
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateAssessmentQuestion') }
    }
  }

  async function removeQuestion(id: string): Promise<{ error: string | null }> {
    const removed = currentQuestions.value.find((q) => q.id === id)
    try {
      const { error: deleteError } = await supabase
        .from('assessment_questions')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      currentQuestions.value = currentQuestions.value.filter((q) => q.id !== id)

      // Storage cleanup (decision 78): drop the deleted payload's objects,
      // EXCEPT paths a duplicated sibling still references (duplicate copies
      // paths, not objects — P10b deviation 5). Best-effort, never blocking.
      if (removed?.source === 'adhoc' && removed.payload) {
        const stillReferenced = new Set(
          currentQuestions.value
            .filter((q) => q.source === 'adhoc' && q.payload)
            .flatMap((q) => collectAdhocPayloadImagePaths(q.payload!)),
        )
        void removeStorageObjects(
          'assessment-images',
          collectAdhocPayloadImagePaths(removed.payload).filter(
            (path) => !stillReferenced.has(path),
          ),
        )
      }
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedRemoveAssessmentQuestion') }
    }
  }

  /**
   * Optimistic local question reorder (decision 72b). `position` is rewritten
   * 1-based to mirror what `reorder_assessment_questions` writes. Persistence
   * is decoupled: the builder page debounces/coalesces saves through
   * `useAutosave` and calls `persistQuestionOrder`, rolling back via
   * this same function on final failure.
   *
   * Returns the pre-drag id order (the rollback baseline), or null when
   * `orderedIds` is not a duplicate-free permutation of the current list —
   * a cheap pre-check; the RPC enforces the same server-side.
   */
  function applyQuestionOrder(orderedIds: string[]): string[] | null {
    const previousIds = currentQuestions.value.map((q) => q.id)
    const byId = new Map(currentQuestions.value.map((q) => [q.id, q]))
    const uniqueIds = new Set(orderedIds)
    if (
      orderedIds.length !== currentQuestions.value.length ||
      uniqueIds.size !== orderedIds.length ||
      orderedIds.some((id) => !byId.has(id))
    ) {
      return null
    }

    currentQuestions.value = orderedIds.map((id, index) => ({
      ...byId.get(id)!,
      position: index + 1,
    }))
    return previousIds
  }

  /**
   * Persist a question order via the positional RPC (P9a): sends ONLY the
   * ordered id array — atomic, minimal payload, and it cannot overwrite a
   * concurrent edit to payload/points/name the way the old full-row upsert
   * could.
   */
  async function persistQuestionOrder(
    assessmentId: string,
    orderedIds: string[],
  ): Promise<{ error: string | null }> {
    const { error: rpcError } = await supabase.rpc('reorder_assessment_questions', {
      p_assessment_id: assessmentId,
      p_ids: orderedIds,
    })

    if (rpcError) {
      // Internal/parameterized RAISE text from the reorder RPC — localize.
      return {
        error: handleError(rpcError, 'failedReorderAssessmentQuestions', {
          localizeRaise: true,
        }),
      }
    }
    return { error: null }
  }

  async function fetchAssignments(assessmentId: string): Promise<{ error: string | null }> {
    try {
      const { data, error: fetchError } = await supabase
        .from('assessment_assignments')
        .select(
          `
          id,
          assessment_id,
          classroom_id,
          student_id,
          due_at,
          created_at,
          classrooms (name),
          student_profiles (profiles!student_profiles_id_fkey (name))
        `,
        )
        .eq('assessment_id', assessmentId)
        .order('created_at')

      if (fetchError) throw fetchError

      currentAssignments.value = (data ?? []).map((row) => ({
        id: row.id,
        assessmentId: row.assessment_id,
        classroomId: row.classroom_id,
        classroomName: (row.classrooms as { name: string } | null)?.name ?? null,
        studentId: row.student_id,
        studentName:
          (row.student_profiles as { profiles: { name: string } | null } | null)?.profiles?.name ??
          null,
        dueAt: row.due_at,
        createdAt: row.created_at,
      }))

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchAssignments') }
    }
  }

  async function createAssignment(input: {
    assessmentId: string
    classroomId?: string
    studentId?: string
    dueAt?: string | null
  }): Promise<{ error: string | null }> {
    const userId = authStore.user?.id
    if (!userId) return { error: errorMessages().notAuthenticated }

    try {
      const { error: insertError } = await supabase.from('assessment_assignments').insert({
        assessment_id: input.assessmentId,
        classroom_id: input.classroomId ?? null,
        student_id: input.studentId ?? null,
        due_at: input.dueAt ?? null,
        assigned_by: userId,
      })

      if (insertError) throw insertError

      return await fetchAssignments(input.assessmentId)
    } catch (err) {
      return { error: handleError(err, 'failedCreateAssignment') }
    }
  }

  async function removeAssignment(id: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase
        .from('assessment_assignments')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      currentAssignments.value = currentAssignments.value.filter((a) => a.id !== id)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedRemoveAssignment') }
    }
  }

  async function fetchAttempts(assessmentId: string): Promise<{ error: string | null }> {
    try {
      const { data, error: fetchError } = await supabase
        .from('assessment_attempts')
        .select(
          `
          id,
          student_id,
          started_at,
          completed_at,
          correct_count,
          total_questions,
          score_percent,
          pending_manual_count,
          student_profiles (username, profiles!student_profiles_id_fkey (name))
        `,
        )
        .eq('assessment_id', assessmentId)
        .order('started_at', { ascending: false })

      if (fetchError) throw fetchError

      currentAttempts.value = (data ?? []).map((row) => {
        const student = row.student_profiles as {
          username: string | null
          profiles: { name: string } | null
        } | null
        return {
          id: row.id,
          studentId: row.student_id,
          studentName: student?.profiles?.name ?? '',
          studentUsername: student?.username ?? null,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          correctCount: row.correct_count,
          totalQuestions: row.total_questions,
          scorePercent: row.score_percent,
          pendingManualCount: row.pending_manual_count,
        }
      })

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchAttempts') }
    }
  }

  /**
   * Per-question correctness for one attempt — the ONLY read path for
   * `is_correct` (staff included). Staff also receive the student's given
   * answer per question; for an open attempt the stored score fields are
   * still zero and must not be rendered as a final score.
   */
  async function fetchAttemptResult(
    attemptId: string,
  ): Promise<{ result: AttemptResult | null; error: string | null }> {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_attempt_result', {
        p_attempt_id: attemptId,
      })

      if (rpcError) throw rpcError

      const raw = data as unknown as {
        attempt_id: string
        assessment_id: string
        student_id: string
        started_at: string
        completed_at: string | null
        correct_count: number
        total_questions: number
        score_percent: number
        pending_count?: number
        points_awarded?: number | null
        points_total?: number | null
        answers_released_at?: string | null
        questions: {
          assessment_question_id: string
          question_order: number
          points: number
          answer_id?: string | null
          is_correct?: boolean | null
          awarded_points?: number | null
          marker_comment?: string | null
          marked_at?: string | null
          selected_options?: number[] | null
          text_answer?: string | null
          response?: AttemptAnswerResponse | null
          answered_at?: string | null
        }[]
      }

      return {
        result: {
          attemptId: raw.attempt_id,
          assessmentId: raw.assessment_id,
          studentId: raw.student_id,
          startedAt: raw.started_at,
          completedAt: raw.completed_at,
          correctCount: raw.correct_count,
          totalQuestions: raw.total_questions,
          scorePercent: raw.score_percent,
          pendingCount: raw.pending_count ?? 0,
          pointsAwarded: raw.points_awarded ?? null,
          pointsTotal: raw.points_total ?? null,
          answersReleasedAt: raw.answers_released_at ?? null,
          questions: (raw.questions ?? [])
            .map((q) => ({
              assessmentQuestionId: q.assessment_question_id,
              questionOrder: q.question_order,
              points: q.points,
              answerId: q.answer_id ?? null,
              isCorrect: q.is_correct ?? null,
              awardedPoints: q.awarded_points ?? null,
              markerComment: q.marker_comment ?? null,
              markedAt: q.marked_at ?? null,
              selectedOptions: q.selected_options ?? null,
              textAnswer: q.text_answer ?? null,
              response: q.response ?? null,
              answeredAt: q.answered_at ?? null,
            }))
            .sort((a, b) => a.questionOrder - b.questionOrder),
        },
        error: null,
      }
    } catch (err) {
      // The RPC's known RAISE strings map to localized copy; anything else
      // (e.g. "Attempt not found: %") falls back to the localized generic
      // instead of surfacing raw DB English (P9d verifier finding).
      return {
        result: null,
        error: handleError(err, 'failedFetchAttemptResult', { localizeRaise: true }),
      }
    }
  }

  /**
   * Manual marking of one long-answer response (P9b). Server-authoritative:
   * validates 0 <= points <= question points, recomputes the attempt score
   * and returns the fresh totals. Re-marking simply overwrites.
   */
  async function markAttemptAnswer(
    answerId: string,
    points: number,
    comment: string | null,
  ): Promise<{ result: MarkAnswerResult | null; error: string | null }> {
    try {
      const { data, error: rpcError } = await supabase.rpc('mark_attempt_answer', {
        p_answer_id: answerId,
        p_points: points,
        ...(comment !== null ? { p_comment: comment } : {}),
      })

      if (rpcError) throw rpcError

      const raw = data as unknown as {
        answer_id: string
        attempt_id: string
        awarded_points: number
        is_correct: boolean
        marked_at: string
        correct_count: number
        total_questions: number
        score_percent: number
        pending_count: number
      }

      const result: MarkAnswerResult = {
        answerId: raw.answer_id,
        attemptId: raw.attempt_id,
        awardedPoints: raw.awarded_points,
        isCorrect: raw.is_correct,
        markedAt: raw.marked_at,
        correctCount: raw.correct_count,
        totalQuestions: raw.total_questions,
        scorePercent: raw.score_percent,
        pendingCount: raw.pending_count,
      }

      // Keep the attempts table in sync without a refetch.
      const attempt = currentAttempts.value.find((a) => a.id === result.attemptId)
      if (attempt) {
        attempt.correctCount = result.correctCount
        attempt.scorePercent = result.scorePercent
        attempt.pendingManualCount = result.pendingCount
      }

      return { result, error: null }
    } catch (err) {
      // Fixed RAISE strings map via DB_RAISE_MESSAGE_KEYS; the parameterized
      // ones ("Awarded points must be between 0 and %") are client-prevented
      // and fall back to the localized generic through localizeRaise.
      return {
        result: null,
        error: handleError(err, 'failedMarkAnswer', { localizeRaise: true }),
      }
    }
  }

  /**
   * Manual answer release (decision 71). `released: false` un-releases.
   * Only the RPC can write the release columns; idempotent server-side.
   */
  async function releaseAssessmentAnswers(
    assessmentId: string,
    released: boolean,
  ): Promise<{ error: string | null }> {
    try {
      const { data, error: rpcError } = await supabase.rpc('release_assessment_answers', {
        p_assessment_id: assessmentId,
        p_released: released,
      })

      if (rpcError) throw rpcError

      const raw = data as unknown as { answers_released_at: string | null }
      if (currentAssessment.value?.id === assessmentId) {
        currentAssessment.value = {
          ...currentAssessment.value,
          answersReleasedAt: raw.answers_released_at,
        }
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedReleaseAnswers', { localizeRaise: true }) }
    }
  }

  /**
   * Marking queue (P9b): attempts across the caller's org that still have
   * unmarked long answers, keyed by assessment. RLS scopes the read; the
   * partial index on `pending_manual_count > 0` keeps it cheap.
   */
  const pendingMarkingCounts = ref<Map<string, number>>(new Map())

  async function fetchPendingMarkingCounts(): Promise<{ error: string | null }> {
    try {
      const { data, error: fetchError } = await supabase
        .from('assessment_attempts')
        .select('assessment_id')
        .gt('pending_manual_count', 0)

      if (fetchError) throw fetchError

      const counts = new Map<string, number>()
      for (const row of data ?? []) {
        counts.set(row.assessment_id, (counts.get(row.assessment_id) ?? 0) + 1)
      }
      pendingMarkingCounts.value = counts

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchAttempts') }
    }
  }

  function setSearch(value: string) {
    filters.value.search = value
    pagination.value.pageIndex = 0
  }

  function setPageIndex(value: number) {
    pagination.value.pageIndex = value
  }

  function setPageSize(value: number) {
    pagination.value.pageSize = value
    pagination.value.pageIndex = 0
  }

  function $reset() {
    assessments.value = []
    isLoading.value = false
    error.value = null
    templates.value = []
    isLoadingTemplates.value = false
    currentAssessment.value = null
    currentQuestions.value = []
    currentAssignments.value = []
    currentAttempts.value = []
    isLoadingCurrent.value = false
    pendingMarkingCounts.value = new Map()
    filters.value = { search: '' }
    pagination.value = { pageIndex: 0, pageSize: 10 }
  }

  return {
    assessments,
    isLoading,
    error,
    filteredAssessments,
    filters,
    setSearch,
    pagination,
    setPageIndex,
    setPageSize,
    canEdit,
    currentAssessment,
    currentQuestions,
    currentAssignments,
    currentAttempts,
    isLoadingCurrent,
    templates,
    isLoadingTemplates,
    fetchTemplates,
    cloneTemplate,
    fetchAssessments,
    createAssessment,
    updateAssessment,
    publishAssessment,
    deleteAssessment,
    fetchAssessmentDetail,
    fetchAssessmentQuestions,
    addBankQuestions,
    addQuestionsFromBank,
    addAdhocQuestion,
    applyAdhocPayload,
    persistAdhocPayload,
    applyQuestionPoints,
    persistQuestionPoints,
    removeQuestion,
    applyQuestionOrder,
    persistQuestionOrder,
    fetchAssignments,
    createAssignment,
    removeAssignment,
    fetchAttempts,
    fetchAttemptResult,
    markAttemptAnswer,
    releaseAssessmentAnswers,
    pendingMarkingCounts,
    fetchPendingMarkingCounts,
    $reset,
  }
})
