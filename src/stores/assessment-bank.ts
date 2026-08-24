import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import type { AdhocPayload, AdhocQuestionType } from '@/lib/adhocPayload'
import type { Database } from '@/types/database.types'

export type QuestionDifficulty = Database['public']['Enums']['question_difficulty']

/**
 * MOE UASA `Aras Kesukaran`: Rendah : Sederhana : Tinggi. The published
 * primary-school format targets a 5:3:2 spread, which is why there are
 * exactly three levels.
 */
export const DIFFICULTIES: QuestionDifficulty[] = ['low', 'medium', 'high']

export interface BankQuestion {
  id: string
  payload: AdhocPayload
  type: AdhocQuestionType
  difficulty: QuestionDifficulty
  gradeLevelId: string
  subjectId: string
  points: number
  tagIds: string[]
  createdAt: string
}

const BANK_SELECT =
  'id, payload, difficulty, grade_level_id, subject_id, points, created_at, assessment_bank_question_tags (tag_id)'

interface BankRow {
  id: string
  payload: unknown
  difficulty: QuestionDifficulty
  grade_level_id: string
  subject_id: string
  points: number
  created_at: string
  assessment_bank_question_tags: { tag_id: string }[]
}

function mapRow(row: BankRow): BankQuestion {
  const payload = row.payload as AdhocPayload
  return {
    id: row.id,
    payload,
    type: payload.type,
    difficulty: row.difficulty,
    gradeLevelId: row.grade_level_id,
    subjectId: row.subject_id,
    points: Number(row.points),
    tagIds: row.assessment_bank_question_tags.map((link) => link.tag_id),
    createdAt: row.created_at,
  }
}

/**
 * The admin assessment question bank (P13a) — exam items, distinct from the
 * practice `questions` bank reached by `get_bank_questions()`.
 *
 * Admin-only at every layer: RLS rejects every other role, so there is no
 * client-side role branch here. A bank question is picked into a template BY
 * COPY (see `AssessmentBankPickerDialog`), so nothing in this store mutates a
 * live assessment.
 */
export const useAssessmentBankStore = defineStore('assessmentBank', () => {
  const questions = ref<BankQuestion[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchQuestions(filters?: {
    gradeLevelId?: string | null
    subjectId?: string | null
    difficulty?: QuestionDifficulty | null
  }): Promise<{ error: string | null }> {
    isLoading.value = true
    error.value = null

    try {
      let query = supabase.from('assessment_bank_questions').select(BANK_SELECT)

      if (filters?.gradeLevelId) query = query.eq('grade_level_id', filters.gradeLevelId)
      if (filters?.subjectId) query = query.eq('subject_id', filters.subjectId)
      if (filters?.difficulty) query = query.eq('difficulty', filters.difficulty)

      const { data, error: fetchError } = await query.order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      questions.value = (data ?? []).map((row) => mapRow(row as unknown as BankRow))
      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchQuestions')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  async function createQuestion(input: {
    payload: AdhocPayload
    difficulty: QuestionDifficulty
    gradeLevelId: string
    subjectId: string
    points?: number
  }): Promise<{ question: BankQuestion | null; error: string | null }> {
    try {
      const authStore = useAuthStore()
      const { data, error: insertError } = await supabase
        .from('assessment_bank_questions')
        .insert({
          payload:
            input.payload as unknown as Database['public']['Tables']['assessment_bank_questions']['Insert']['payload'],
          difficulty: input.difficulty,
          grade_level_id: input.gradeLevelId,
          subject_id: input.subjectId,
          points: input.points ?? 1,
          created_by: authStore.user!.id,
        })
        .select(BANK_SELECT)
        .single()

      if (insertError) throw insertError

      const question = mapRow(data as unknown as BankRow)
      questions.value = [question, ...questions.value]
      return { question, error: null }
    } catch (err) {
      return { question: null, error: handleError(err, 'failedAddQuestion') }
    }
  }

  /**
   * Patch one bank question. `payload` and `points` arrive from the shared
   * question card's autosave; `difficulty` and the tags from the bank's own
   * footer controls.
   */
  async function updateQuestion(
    id: string,
    patch: { payload?: AdhocPayload; difficulty?: QuestionDifficulty; points?: number },
  ): Promise<{ error: string | null }> {
    try {
      const { error: updateError } = await supabase
        .from('assessment_bank_questions')
        .update({
          ...(patch.payload
            ? {
                payload:
                  patch.payload as unknown as Database['public']['Tables']['assessment_bank_questions']['Update']['payload'],
              }
            : {}),
          ...(patch.difficulty ? { difficulty: patch.difficulty } : {}),
          ...(patch.points !== undefined ? { points: patch.points } : {}),
        })
        .eq('id', id)

      if (updateError) throw updateError

      const existing = questions.value.find((question) => question.id === id)
      if (existing) {
        if (patch.payload) {
          existing.payload = patch.payload
          existing.type = patch.payload.type
        }
        if (patch.difficulty) existing.difficulty = patch.difficulty
        if (patch.points !== undefined) existing.points = patch.points
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateQuestion') }
    }
  }

  async function deleteQuestion(id: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase
        .from('assessment_bank_questions')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      questions.value = questions.value.filter((question) => question.id !== id)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedDeleteQuestion') }
    }
  }

  /**
   * Replace a question's tags. The join row is nothing but its primary key,
   * so the diff is a delete of the dropped ids plus an insert of the new —
   * there is no UPDATE grant on the table.
   */
  async function setTags(id: string, tagIds: string[]): Promise<{ error: string | null }> {
    try {
      const existing = questions.value.find((question) => question.id === id)
      const before = existing?.tagIds ?? []
      const removed = before.filter((tagId) => !tagIds.includes(tagId))
      const added = tagIds.filter((tagId) => !before.includes(tagId))

      if (removed.length > 0) {
        const { error: deleteError } = await supabase
          .from('assessment_bank_question_tags')
          .delete()
          .eq('assessment_bank_question_id', id)
          .in('tag_id', removed)
        if (deleteError) throw deleteError
      }

      if (added.length > 0) {
        const { error: insertError } = await supabase
          .from('assessment_bank_question_tags')
          .insert(added.map((tagId) => ({ assessment_bank_question_id: id, tag_id: tagId })))
        if (insertError) throw insertError
      }

      if (existing) existing.tagIds = tagIds
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateQuestion') }
    }
  }

  function $reset() {
    questions.value = []
    isLoading.value = false
    error.value = null
  }

  return {
    questions,
    isLoading,
    error,
    fetchQuestions,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    setTags,
    $reset,
  }
})
