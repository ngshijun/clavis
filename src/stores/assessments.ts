import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import type { Database, Json } from '@/types/database.types'
import type { QuestionDifficulty } from '@/stores/assessment-bank'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'
import {
  collectAdhocPayloadImagePaths,
  adhocDisplayFields,
  type AdhocPayload,
  type AdhocQuestionType,
} from '@/lib/adhocPayload'
import { removeStorageFolder, removeStorageObjects } from '@/lib/storage'
import type { AttemptAnswerResponse } from '@/lib/attemptResponse'

export type { AttemptAnswerResponse }

export type AssessmentStatus = Database['public']['Enums']['assessment_status']
export type QuestionType = Database['public']['Enums']['question_type']

type AssessmentQuestionRow = Database['public']['Tables']['assessment_questions']['Row']

export interface AssessmentListItem {
  id: string
  title: string
  description: string | null
  status: AssessmentStatus
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
  /** The owning classroom (decision 81). */
  classroomId: string
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
  type: AdhocQuestionType
  question: string
  /** Question-level image — always a path in `assessment-images` (P10a). */
  imagePath: string | null
  /** Display options (mcq/mrq); `number` is the 1-based ordinal the grader expects. */
  options: { number: number; text: string; imagePath: string | null }[]
  /** Raw payload — every assessment question is a self-contained ad-hoc payload (decision 88). */
  payload: AdhocPayload
  /**
   * Which spec line this question was generated for (decision 90), or null
   * for a hand-written one. Generated questions can be regenerated while the
   * assessment is a draft.
   */
  generationLine: number | null
}

/** One line of a generation spec (decision 90): what to draw, and how many. */
export interface GenerationLine {
  subTopicId: string
  tagIds: string[]
  difficulty: QuestionDifficulty | null
  count: number
}

/** A line that asked for more than the bank could give. */
export interface GenerationShortfall {
  line: number
  requested: number
  picked: number
}

function specToJson(lines: GenerationLine[]): Json {
  return lines.map((line) => ({
    sub_topic_id: line.subTopicId,
    tag_ids: line.tagIds,
    difficulty: line.difficulty,
    count: line.count,
  }))
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

function rowToAssessmentQuestion(row: AssessmentQuestionRow): AssessmentQuestionItem {
  const payload = row.payload as unknown as AdhocPayload
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    position: row.position,
    points: row.points,
    ...adhocDisplayFields(payload),
    payload,
    generationLine: row.generation_line,
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
   * Managers are deliberately excluded (decision 80): their role is to manage
   * people and read data, not to author teaching material. The exclusion is
   * unconditional — a manager who authored an assessment before this rule
   * still cannot edit it — and the DB enforces the same thing, so this only
   * decides which controls are worth rendering.
   */
  function canEdit(item: Pick<AssessmentListItem, 'createdBy'>): boolean {
    if (authStore.isManager) return false
    return item.createdBy === authStore.user?.id
  }

  const ASSESSMENT_SELECT = `
    id,
    title,
    description,
    status,
    time_limit_seconds,
    shuffle_questions,
    show_auto_score_while_pending,
    answers_released_at,
    created_by,
    created_at,
    updated_at,
    profiles!assessments_created_by_fkey (name),
    classroom_id,
    classrooms!assessments_classroom_id_fkey (name),
    assessment_questions (count)
  `

  interface AssessmentSelectRow {
    id: string
    title: string
    description: string | null
    status: AssessmentStatus
    time_limit_seconds: number | null
    shuffle_questions: boolean
    show_auto_score_while_pending: boolean
    answers_released_at: string | null
    created_by: string
    created_at: string
    updated_at: string
    profiles: { name: string } | null
    classroom_id: string
    classrooms: { name: string } | null
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
   * The classroom's assessments (decisions 79/81). Every assessment belongs
   * to exactly one classroom — set at creation, never null — so the
   * classroom in the URL is the only scope the list needs.
   */
  async function fetchAssessments(classroomId: string): Promise<{ error: string | null }> {
    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('assessments')
        .select(ASSESSMENT_SELECT)
        .eq('classroom_id', classroomId)
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

  /**
   * An assessment is born INTO a classroom (decision 81) and carries
   * `classroom_id` from the start; RLS additionally requires the caller to
   * teach that classroom.
   */
  async function createAssessment(input: {
    title: string
    classroomId: string
  }): Promise<{ id: string | null; error: string | null }> {
    const userId = authStore.user?.id
    const organizationId = authStore.organizationId
    if (!userId || !organizationId) {
      return { id: null, error: errorMessages().notAuthenticated }
    }

    try {
      const { data, error: insertError } = await supabase
        .from('assessments')
        .insert({
          title: input.title,
          organization_id: organizationId,
          created_by: userId,
          classroom_id: input.classroomId,
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      return { id: data.id, error: null }
    } catch (err) {
      return { id: null, error: handleError(err, 'failedCreateAssessment') }
    }
  }

  /**
   * Decision 90: a draft built from random bank picks matching `lines`, in
   * the classroom. The RPC copies the picks, so the teacher owns them and
   * can edit or regenerate each one. Lines the bank could not fill come
   * back as shortfalls.
   */
  async function generateAssessment(input: {
    classroomId: string
    title: string
    lines: GenerationLine[]
  }): Promise<{ id: string | null; shortfalls: GenerationShortfall[]; error: string | null }> {
    try {
      const { data, error: rpcError } = await supabase.rpc('generate_assessment_from_bank', {
        p_classroom_id: input.classroomId,
        p_title: input.title,
        p_spec: specToJson(input.lines),
      })
      if (rpcError) throw rpcError
      const result = data as unknown as { assessment_id: string; shortfalls: GenerationShortfall[] }
      return { id: result.assessment_id, shortfalls: result.shortfalls, error: null }
    } catch (err) {
      return { id: null, shortfalls: [], error: handleError(err, 'failedCreateAssessment') }
    }
  }

  /**
   * Replace one generated question with another random pick from its spec
   * line — the RPC excludes everything already in the assessment and
   * rewrites the row in place, so the id and position survive.
   */
  async function regenerateQuestion(id: string): Promise<{ error: string | null }> {
    try {
      const { data, error: rpcError } = await supabase.rpc('regenerate_assessment_question', {
        p_question_id: id,
      })
      if (rpcError) throw rpcError
      const result = data as unknown as { payload: Json; points: number }
      const payload = result.payload as unknown as AdhocPayload
      const item = currentQuestions.value.find((q) => q.id === id)
      if (item) {
        Object.assign(item, adhocDisplayFields(payload), {
          payload,
          points: Number(result.points),
        })
      }
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateAssessmentQuestion') }
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
        .select('*')
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
   * previous payload (the rollback baseline), or null for an unknown question.
   */
  function applyAdhocPayload(id: string, payload: AdhocPayload): AdhocPayload | null {
    const item = currentQuestions.value.find((q) => q.id === id)
    if (!item) return null
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
      if (removed) {
        const stillReferenced = new Set(
          currentQuestions.value.flatMap((q) => collectAdhocPayloadImagePaths(q.payload)),
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
    fetchAssessments,
    createAssessment,
    generateAssessment,
    regenerateQuestion,
    updateAssessment,
    publishAssessment,
    deleteAssessment,
    fetchAssessmentDetail,
    fetchAssessmentQuestions,
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
