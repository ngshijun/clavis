import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import type { Database, Json } from '@/types/database.types'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'

export type AssessmentStatus = Database['public']['Enums']['assessment_status']
export type QuestionType = Database['public']['Enums']['question_type']
type QuestionRow = Database['public']['Tables']['questions']['Row']
type AssessmentQuestionRow = Database['public']['Tables']['assessment_questions']['Row']

export interface AssessmentListItem {
  id: string
  title: string
  description: string | null
  status: AssessmentStatus
  timeLimitSeconds: number | null
  shuffleQuestions: boolean
  createdBy: string
  createdByName: string
  questionCount: number
  createdAt: string
  updatedAt: string
}

/**
 * The EXACT ad-hoc question payload shape graded by the DB
 * (P3A-HANDOFF §2). `options[].is_correct` MUST be a JSON boolean —
 * the grader treats the string "true" as not correct.
 */
export interface AdhocPayload {
  type: QuestionType
  question: string
  options?: { text: string; is_correct: boolean }[]
  answer?: string
  explanation?: string
}

export interface AssessmentQuestionItem {
  id: string
  assessmentId: string
  position: number
  points: number
  source: 'bank' | 'adhoc'
  questionId: string | null
  type: QuestionType
  question: string
  /** Display options; `number` is the 1-based ordinal the grader expects. */
  options: { number: number; text: string }[]
  answer: string | null
  explanation: string | null
  /** Raw payload for ad-hoc edit round-trips; null for bank questions. */
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
}

export interface AttemptResultQuestion {
  assessmentQuestionId: string
  questionOrder: number
  points: number
  isCorrect: boolean
  selectedOptions: number[] | null
  textAnswer: string | null
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
  questions: AttemptResultQuestion[]
}

function rowToAssessmentQuestion(
  row: AssessmentQuestionRow & { questions: QuestionRow | null },
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
      options:
        bank.type === 'short_answer'
          ? []
          : bankOptions
              .map((option, index) => ({ number: index + 1, text: option.text ?? '' }))
              .filter((option, index) => {
                const source = bankOptions[index]
                return Boolean(source?.text) || Boolean(source?.imagePath)
              }),
      answer: bank.answer,
      // The bank carries per-option tips now, not an explanation; the ad-hoc
      // payload shape has no slot for tips, so bank copies carry none.
      explanation: null,
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
    type: payload.type ?? 'mcq',
    question: payload.question ?? '',
    options: (payload.options ?? []).map((option, index) => ({
      number: index + 1,
      text: option.text,
    })),
    answer: payload.answer ?? null,
    explanation: payload.explanation ?? null,
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

  const filters = ref({ search: '' })
  const pagination = ref({ pageIndex: 0, pageSize: 10 })

  // Builder state for the assessment currently open (keyed by id)
  const currentAssessment = ref<AssessmentListItem | null>(null)
  const currentQuestions = ref<AssessmentQuestionItem[]>([])
  const currentAssignments = ref<AssessmentAssignment[]>([])
  const currentAttempts = ref<AssessmentAttempt[]>([])
  const isLoadingCurrent = ref(false)
  const isSavingOrder = ref(false)

  const filteredAssessments = computed(() => {
    const query = filters.value.search.toLowerCase().trim()
    if (!query) return assessments.value

    return assessments.value.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.createdByName.toLowerCase().includes(query),
    )
  })

  /** Managers may edit any org assessment; teachers only their own (RLS mirror). */
  function canEdit(item: Pick<AssessmentListItem, 'createdBy'>): boolean {
    return authStore.isManager || item.createdBy === authStore.user?.id
  }

  const ASSESSMENT_SELECT = `
    id,
    title,
    description,
    status,
    time_limit_seconds,
    shuffle_questions,
    created_by,
    created_at,
    updated_at,
    profiles!assessments_created_by_fkey (name),
    assessment_questions (count)
  `

  interface AssessmentSelectRow {
    id: string
    title: string
    description: string | null
    status: AssessmentStatus
    time_limit_seconds: number | null
    shuffle_questions: boolean
    created_by: string
    created_at: string
    updated_at: string
    profiles: { name: string } | null
    assessment_questions: { count: number }[]
  }

  function rowToListItem(row: AssessmentSelectRow): AssessmentListItem {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      timeLimitSeconds: row.time_limit_seconds,
      shuffleQuestions: row.shuffle_questions,
      createdBy: row.created_by,
      createdByName: row.profiles?.name ?? '',
      questionCount: row.assessment_questions[0]?.count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async function fetchAssessments(): Promise<{ error: string | null }> {
    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('assessments')
        .select(ASSESSMENT_SELECT)
        .order('updated_at', { ascending: false })

      if (fetchError) throw fetchError

      assessments.value = ((data ?? []) as unknown as AssessmentSelectRow[]).map(rowToListItem)

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchAssessments')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  async function createAssessment(
    title: string,
  ): Promise<{ id: string | null; error: string | null }> {
    const userId = authStore.user?.id
    const organizationId = authStore.organizationId
    if (!userId || !organizationId) {
      return { id: null, error: errorMessages().notAuthenticated }
    }

    try {
      const { data, error: insertError } = await supabase
        .from('assessments')
        .insert({ title, organization_id: organizationId, created_by: userId })
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

      const { error: updateError } = await supabase
        .from('assessments')
        .update(updateData)
        .eq('id', id)

      if (updateError) throw updateError

      if (currentAssessment.value?.id === id) {
        currentAssessment.value = {
          ...currentAssessment.value,
          title: updates.title ?? currentAssessment.value.title,
          description:
            updates.description !== undefined
              ? updates.description
              : currentAssessment.value.description,
          timeLimitSeconds:
            updates.timeLimitSeconds !== undefined
              ? updates.timeLimitSeconds
              : currentAssessment.value.timeLimitSeconds,
          shuffleQuestions: updates.shuffleQuestions ?? currentAssessment.value.shuffleQuestions,
        }
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
        .select('*, questions (*)')
        .eq('assessment_id', assessmentId)
        .order('position')

      if (fetchError) throw fetchError

      currentQuestions.value = (data ?? []).map((row) =>
        rowToAssessmentQuestion(row as AssessmentQuestionRow & { questions: QuestionRow | null }),
      )

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

  async function addAdhocQuestion(
    assessmentId: string,
    payload: AdhocPayload,
  ): Promise<{ error: string | null }> {
    try {
      const { error: insertError } = await supabase.from('assessment_questions').insert({
        assessment_id: assessmentId,
        payload: payload as unknown as Json,
        position: nextPosition(),
      })

      if (insertError) throw insertError

      return await fetchAssessmentQuestions(assessmentId)
    } catch (err) {
      return { error: handleError(err, 'failedAddAssessmentQuestions') }
    }
  }

  async function updateAdhocQuestion(
    id: string,
    payload: AdhocPayload,
  ): Promise<{ error: string | null }> {
    try {
      const { error: updateError } = await supabase
        .from('assessment_questions')
        .update({ payload: payload as unknown as Json })
        .eq('id', id)

      if (updateError) throw updateError

      const item = currentQuestions.value.find((q) => q.id === id)
      if (item) {
        return await fetchAssessmentQuestions(item.assessmentId)
      }
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateAssessmentQuestion') }
    }
  }

  async function updateQuestionPoints(
    id: string,
    points: number,
  ): Promise<{ error: string | null }> {
    try {
      const { error: updateError } = await supabase
        .from('assessment_questions')
        .update({ points })
        .eq('id', id)

      if (updateError) throw updateError

      const item = currentQuestions.value.find((q) => q.id === id)
      if (item) item.points = points

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateAssessmentQuestion') }
    }
  }

  async function removeQuestion(id: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase
        .from('assessment_questions')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      currentQuestions.value = currentQuestions.value.filter((q) => q.id !== id)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedRemoveAssessmentQuestion') }
    }
  }

  /**
   * Persist a new question order. Optimistic apply, one all-or-nothing upsert
   * (PostgREST runs one request in one transaction), rollback on error —
   * mirrors `curriculum.reorderSubTopics`. The upsert re-sends the full row
   * because `assessment_id` is NOT NULL without a default and the payload/
   * question_id CHECK is evaluated on the proposed row.
   */
  async function reorderQuestions(
    assessmentId: string,
    orderedIds: string[],
  ): Promise<{ error: string | null }> {
    const byId = new Map(currentQuestions.value.map((q) => [q.id, q]))
    if (
      orderedIds.length !== currentQuestions.value.length ||
      orderedIds.some((id) => !byId.has(id))
    ) {
      return { error: errorMessages().failedReorderAssessmentQuestions }
    }

    const previous = currentQuestions.value

    isSavingOrder.value = true
    // Optimistic apply
    currentQuestions.value = orderedIds.map((id, index) => ({ ...byId.get(id)!, position: index }))

    try {
      const { error: upsertError } = await supabase.from('assessment_questions').upsert(
        currentQuestions.value.map((q) => ({
          id: q.id,
          assessment_id: assessmentId,
          question_id: q.questionId,
          payload: q.payload as unknown as Json,
          position: q.position,
          points: q.points,
        })),
        { onConflict: 'id' },
      )

      if (upsertError) throw upsertError

      return { error: null }
    } catch (err) {
      currentQuestions.value = previous
      return { error: handleError(err, 'failedReorderAssessmentQuestions') }
    } finally {
      isSavingOrder.value = false
    }
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
        questions: {
          assessment_question_id: string
          question_order: number
          points: number
          is_correct: boolean
          selected_options?: number[] | null
          text_answer?: string | null
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
          questions: (raw.questions ?? [])
            .map((q) => ({
              assessmentQuestionId: q.assessment_question_id,
              questionOrder: q.question_order,
              points: q.points,
              isCorrect: q.is_correct,
              selectedOptions: q.selected_options ?? null,
              textAnswer: q.text_answer ?? null,
              answeredAt: q.answered_at ?? null,
            }))
            .sort((a, b) => a.questionOrder - b.questionOrder),
        },
        error: null,
      }
    } catch (err) {
      return { result: null, error: handleError(err, 'failedFetchAttemptResult') }
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
    currentAssessment.value = null
    currentQuestions.value = []
    currentAssignments.value = []
    currentAttempts.value = []
    isLoadingCurrent.value = false
    isSavingOrder.value = false
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
    isSavingOrder,
    fetchAssessments,
    createAssessment,
    updateAssessment,
    publishAssessment,
    deleteAssessment,
    fetchAssessmentDetail,
    fetchAssessmentQuestions,
    addBankQuestions,
    addAdhocQuestion,
    updateAdhocQuestion,
    updateQuestionPoints,
    removeQuestion,
    reorderQuestions,
    fetchAssignments,
    createAssignment,
    removeAssignment,
    fetchAttempts,
    fetchAttemptResult,
    $reset,
  }
})
