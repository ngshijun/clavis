import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import {
  useAssessmentBankStore,
  type BankQuestion,
  type BankQuestionPatch,
  type QuestionDifficulty,
} from '@/stores/assessment-bank'
import { adhocDisplayFields, type AdhocPayload, type QuestionCardItem } from '@/lib/adhocPayload'
import type { Database, Json } from '@/types/database.types'
import type { GenerationLine, GenerationShortfall } from '@/stores/assessments'

type AssessmentStatus = Database['public']['Enums']['assessment_status']

export interface AssessmentTemplate {
  id: string
  title: string
  description: string | null
  status: AssessmentStatus
  /** The pairing that decides who may see and clone the template (decision 61). */
  gradeLevelId: string
  gradeLevelName: string
  subjectId: string
  subjectName: string
  timeLimitSeconds: number | null
  shuffleQuestions: boolean
  createdBy: string
  questionCount: number
  createdAt: string
  updatedAt: string
}

/**
 * A bank question as it sits in a template: the bank row, its position, and
 * the display slice the shared question card renders.
 */
export interface TemplateQuestion extends BankQuestion, QuestionCardItem {
  position: number
}

const TEMPLATE_SELECT = `
  id, title, description, status, grade_level_id, subject_id,
  time_limit_seconds, shuffle_questions, created_by, created_at, updated_at,
  grade_levels!assessment_templates_grade_level_id_fkey (name),
  subjects!assessment_templates_subject_id_fkey (name),
  assessment_template_questions (count)
`

interface TemplateRow {
  id: string
  title: string
  description: string | null
  status: AssessmentStatus
  grade_level_id: string
  subject_id: string
  time_limit_seconds: number | null
  shuffle_questions: boolean
  created_by: string
  created_at: string
  updated_at: string
  grade_levels: { name: string } | null
  subjects: { name: string } | null
  assessment_template_questions: { count: number }[]
}

function rowToTemplate(row: TemplateRow): AssessmentTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    gradeLevelId: row.grade_level_id,
    gradeLevelName: row.grade_levels?.name ?? '',
    subjectId: row.subject_id,
    subjectName: row.subjects?.name ?? '',
    timeLimitSeconds: row.time_limit_seconds,
    shuffleQuestions: row.shuffle_questions,
    createdBy: row.created_by,
    questionCount: row.assessment_template_questions[0]?.count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

type TemplateQuestionRow =
  Database['public']['Functions']['get_template_questions']['Returns'][number]

function rowToTemplateQuestion(row: TemplateQuestionRow): TemplateQuestion {
  const payload = row.payload as unknown as AdhocPayload
  return {
    id: row.id,
    position: row.position,
    payload,
    ...adhocDisplayFields(payload),
    difficulty: row.difficulty,
    subTopicId: row.sub_topic_id,
    points: Number(row.points),
    tagIds: row.tag_ids,
    usedInTemplates: 0,
    createdAt: '',
  }
}

/**
 * Admin assessment templates (decision 89): a template is a title, a
 * grade+subject pairing, a status, the delivery settings a clone inherits —
 * and an ORDERED LIST OF REFERENCES into the assessment bank. It holds no
 * question content of its own.
 *
 * Admins read and write everything here. Org staff see only published
 * templates whose pairing matches a classroom of theirs (RLS), read their
 * questions through `get_template_questions`, and "use" one by cloning it
 * into a classroom — a copy, so no later bank edit reaches an attempt.
 *
 * Editing a question inside a template edits the BANK row, and therefore
 * every template holding it: the question writes below go through the bank
 * store and patch this store's local rows.
 */
export const useAssessmentTemplatesStore = defineStore('assessmentTemplates', () => {
  const authStore = useAuthStore()
  const bankStore = useAssessmentBankStore()

  const templates = ref<AssessmentTemplate[]>([])
  const isLoading = ref(false)

  const currentTemplate = ref<AssessmentTemplate | null>(null)
  const currentQuestions = ref<TemplateQuestion[]>([])
  const isLoadingCurrent = ref(false)

  async function fetchTemplates(): Promise<{ error: string | null }> {
    isLoading.value = true
    try {
      const { data, error: fetchError } = await supabase
        .from('assessment_templates')
        .select(TEMPLATE_SELECT)
        .order('updated_at', { ascending: false })

      if (fetchError) throw fetchError

      templates.value = ((data ?? []) as unknown as TemplateRow[]).map(rowToTemplate)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchTemplates') }
    } finally {
      isLoading.value = false
    }
  }

  async function fetchTemplateQuestions(templateId: string): Promise<{ error: string | null }> {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_template_questions', {
        p_template_id: templateId,
      })
      if (rpcError) throw rpcError
      const questions = (data ?? []).map(rowToTemplateQuestion)

      // The reach of an edit: how many templates each question sits in. The
      // reference table is admin-readable in full; staff previews skip it.
      if (authStore.isAdmin && questions.length > 0) {
        const { data: refs, error: refsError } = await supabase
          .from('assessment_template_questions')
          .select('bank_question_id')
          .in(
            'bank_question_id',
            questions.map((question) => question.id),
          )
        if (refsError) throw refsError
        const counts = new Map<string, number>()
        for (const ref of refs ?? []) {
          counts.set(ref.bank_question_id, (counts.get(ref.bank_question_id) ?? 0) + 1)
        }
        for (const question of questions) {
          question.usedInTemplates = counts.get(question.id) ?? 0
        }
      }

      currentQuestions.value = questions
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchTemplates') }
    }
  }

  /** Load one template plus its questions into the builder state. */
  async function fetchTemplateDetail(id: string): Promise<{ error: string | null }> {
    isLoadingCurrent.value = true
    currentTemplate.value = null
    currentQuestions.value = []
    try {
      const [{ data, error: fetchError }, questionsResult] = await Promise.all([
        supabase.from('assessment_templates').select(TEMPLATE_SELECT).eq('id', id).single(),
        fetchTemplateQuestions(id),
      ])
      if (fetchError) throw fetchError
      if (questionsResult.error) return { error: questionsResult.error }

      currentTemplate.value = rowToTemplate(data as unknown as TemplateRow)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchTemplates') }
    } finally {
      isLoadingCurrent.value = false
    }
  }

  async function createTemplate(input: {
    title: string
    gradeLevelId: string
    subjectId: string
  }): Promise<{ id: string | null; error: string | null }> {
    try {
      const { data, error: insertError } = await supabase
        .from('assessment_templates')
        .insert({
          title: input.title,
          grade_level_id: input.gradeLevelId,
          subject_id: input.subjectId,
          created_by: authStore.user!.id,
        })
        .select('id')
        .single()

      if (insertError) throw insertError
      return { id: data.id, error: null }
    } catch (err) {
      return { id: null, error: handleError(err, 'failedCreateAssessment') }
    }
  }

  /** Decision 90, admin variant: a draft template of random bank references. */
  async function generateTemplate(input: {
    title: string
    gradeLevelId: string
    subjectId: string
    lines: GenerationLine[]
  }): Promise<{ id: string | null; shortfalls: GenerationShortfall[]; error: string | null }> {
    try {
      const spec: Json = input.lines.map((line) => ({
        sub_topic_id: line.subTopicId,
        tag_ids: line.tagIds,
        difficulty: line.difficulty,
        count: line.count,
      }))
      const { data, error: rpcError } = await supabase.rpc('generate_template_from_bank', {
        p_title: input.title,
        p_grade_level_id: input.gradeLevelId,
        p_subject_id: input.subjectId,
        p_spec: spec,
      })
      if (rpcError) throw rpcError
      const result = data as unknown as { template_id: string; shortfalls: GenerationShortfall[] }
      return { id: result.template_id, shortfalls: result.shortfalls, error: null }
    } catch (err) {
      return { id: null, shortfalls: [], error: handleError(err, 'failedCreateAssessment') }
    }
  }

  async function updateTemplate(
    id: string,
    updates: {
      title?: string
      description?: string | null
      timeLimitSeconds?: number | null
      shuffleQuestions?: boolean
      status?: AssessmentStatus
    },
  ): Promise<{ error: string | null }> {
    try {
      const patch: Database['public']['Tables']['assessment_templates']['Update'] = {}
      if (updates.title !== undefined) patch.title = updates.title
      if (updates.description !== undefined) patch.description = updates.description
      if (updates.timeLimitSeconds !== undefined)
        patch.time_limit_seconds = updates.timeLimitSeconds
      if (updates.shuffleQuestions !== undefined) patch.shuffle_questions = updates.shuffleQuestions
      if (updates.status !== undefined) patch.status = updates.status

      const { data, error: updateError } = await supabase
        .from('assessment_templates')
        .update(patch)
        .eq('id', id)
        .select(TEMPLATE_SELECT)
        .single()

      if (updateError) throw updateError

      const updated = rowToTemplate(data as unknown as TemplateRow)
      if (currentTemplate.value?.id === id) currentTemplate.value = updated
      templates.value = templates.value.map((item) => (item.id === id ? updated : item))
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateAssessment') }
    }
  }

  async function deleteTemplate(id: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase
        .from('assessment_templates')
        .delete()
        .eq('id', id)
      if (deleteError) throw deleteError

      templates.value = templates.value.filter((item) => item.id !== id)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedDeleteAssessment') }
    }
  }

  // ── questions: references into the bank ────────────────────

  function nextPosition(): number {
    return currentQuestions.value.reduce((max, q) => Math.max(max, q.position), -1) + 1
  }

  function bumpQuestionCount(templateId: string, delta: number) {
    if (currentTemplate.value?.id === templateId) currentTemplate.value.questionCount += delta
  }

  /** Reference existing bank questions, appended in the given order. */
  async function addBankQuestions(
    templateId: string,
    bankQuestionIds: string[],
  ): Promise<{ error: string | null }> {
    if (bankQuestionIds.length === 0) return { error: null }
    try {
      const base = nextPosition()
      const { error: insertError } = await supabase.from('assessment_template_questions').insert(
        bankQuestionIds.map((bankQuestionId, index) => ({
          template_id: templateId,
          bank_question_id: bankQuestionId,
          position: base + index,
        })),
      )
      if (insertError) throw insertError

      bumpQuestionCount(templateId, bankQuestionIds.length)
      return await fetchTemplateQuestions(templateId)
    } catch (err) {
      return { error: handleError(err, 'failedAddAssessmentQuestions') }
    }
  }

  /**
   * Author a question inside the template: it is created IN THE BANK, filed
   * under `subTopicId`, then referenced. Returns the new bank question id.
   */
  async function createQuestion(
    templateId: string,
    input: {
      payload: AdhocPayload
      subTopicId: string
      difficulty?: QuestionDifficulty
      points?: number
    },
  ): Promise<{ id: string | null; error: string | null }> {
    const { question, error } = await bankStore.createQuestion({
      payload: input.payload,
      difficulty: input.difficulty ?? 'medium',
      subTopicId: input.subTopicId,
      points: input.points,
    })
    if (error || !question) return { id: null, error }

    const { error: linkError } = await addBankQuestions(templateId, [question.id])
    if (linkError) return { id: null, error: linkError }
    return { id: question.id, error: null }
  }

  /** Drop the reference; the bank keeps the question. */
  async function removeQuestion(
    templateId: string,
    bankQuestionId: string,
  ): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase
        .from('assessment_template_questions')
        .delete()
        .eq('template_id', templateId)
        .eq('bank_question_id', bankQuestionId)
      if (deleteError) throw deleteError

      currentQuestions.value = currentQuestions.value.filter((q) => q.id !== bankQuestionId)
      bumpQuestionCount(templateId, -1)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedRemoveAssessmentQuestion') }
    }
  }

  /** Optimistic reorder; returns the previous order for rollback. */
  function applyQuestionOrder(orderedIds: string[]): string[] | null {
    const byId = new Map(currentQuestions.value.map((q) => [q.id, q]))
    if (orderedIds.length !== byId.size || orderedIds.some((id) => !byId.has(id))) return null
    const previous = currentQuestions.value.map((q) => q.id)
    currentQuestions.value = orderedIds.map((id, index) => ({ ...byId.get(id)!, position: index }))
    return previous
  }

  async function persistQuestionOrder(
    templateId: string,
    orderedIds: string[],
  ): Promise<{ error: string | null }> {
    try {
      const { error: rpcError } = await supabase.rpc('reorder_template_questions', {
        p_template_id: templateId,
        p_ids: orderedIds,
      })
      if (rpcError) throw rpcError
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedReorderAssessmentQuestions') }
    }
  }

  /** Patch the local template row for a bank question (optimistic apply). */
  function applyQuestionPatch(id: string, patch: BankQuestionPatch) {
    const existing = currentQuestions.value.find((q) => q.id === id)
    if (!existing) return
    if (patch.payload) {
      Object.assign(existing, adhocDisplayFields(patch.payload), { payload: patch.payload })
    }
    if (patch.difficulty) existing.difficulty = patch.difficulty
    if (patch.points !== undefined) existing.points = patch.points
    if (patch.subTopicId) existing.subTopicId = patch.subTopicId
  }

  /** Persist a bank patch — the write is the bank's; every template sees it. */
  async function persistQuestionPatch(
    id: string,
    patch: BankQuestionPatch,
  ): Promise<{ error: string | null }> {
    const result = await bankStore.updateQuestion(id, patch)
    if (!result.error) applyQuestionPatch(id, patch)
    return result
  }

  async function setQuestionTags(id: string, tagIds: string[]): Promise<{ error: string | null }> {
    const existing = currentQuestions.value.find((q) => q.id === id)
    const result = await bankStore.setTags(id, tagIds, existing?.tagIds ?? [])
    if (!result.error && existing) existing.tagIds = tagIds
    return result
  }

  /**
   * Clone a published template INTO a classroom (decision 81): the clone is a
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
      return { id: data, error: null }
    } catch (err) {
      return { id: null, error: handleError(err, 'failedCloneTemplate') }
    }
  }

  function $reset() {
    templates.value = []
    isLoading.value = false
    currentTemplate.value = null
    currentQuestions.value = []
    isLoadingCurrent.value = false
  }

  return {
    templates,
    isLoading,
    currentTemplate,
    currentQuestions,
    isLoadingCurrent,
    fetchTemplates,
    fetchTemplateDetail,
    createTemplate,
    generateTemplate,
    updateTemplate,
    deleteTemplate,
    addBankQuestions,
    createQuestion,
    removeQuestion,
    applyQuestionOrder,
    persistQuestionOrder,
    applyQuestionPatch,
    persistQuestionPatch,
    setQuestionTags,
    cloneTemplate,
    $reset,
  }
})
