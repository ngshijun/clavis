import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import type { Database } from '@/types/database.types'
import { useCurriculumStore } from './curriculum'
import { handleError } from '@/lib/errors'
import {
  uploadStorageFile,
  deleteStorageFile,
  removeStorageObjects,
  createBucketImageHelpers,
} from '@/lib/storage'

export type QuestionRow = Database['public']['Tables']['questions']['Row']
export type QuestionType = Database['public']['Enums']['question_type']

/** A learning point attached to a question (from the global tags library). */
export interface QuestionTag {
  id: string
  name: string
}

/** Row shape when the question is selected with its tags embedded. */
export type QuestionRowWithTags = QuestionRow & {
  question_tags?: { tags: QuestionTag | null }[]
}

const QUESTION_WITH_TAGS_SELECT = '*, question_tags (tags (id, name))'

export interface MCQOption {
  id: 'a' | 'b' | 'c' | 'd'
  text: string | null
  imagePath: string | null
  isCorrect: boolean
  /** Shown to a student who picked this option and got the question wrong. */
  tip: string | null
}

export interface Question {
  id: string
  type: QuestionType
  question: string
  imagePath: string | null
  subTopicId: string
  gradeLevelId: string | null
  subjectId: string | null
  answer: string | null // For short_answer type
  options: MCQOption[] // For MCQ/MRQ type (each option carries its own tip)
  /** Learning points this question practises (empty when not embedded). */
  tags: QuestionTag[]
  createdAt: string | null
  updatedAt: string | null
  imageHash: string | null // SHA-256 hash of all images for duplicate detection
  // Denormalized names for display
  gradeLevelName: string
  subjectName: string
  topicName: string
  subTopicName: string
}

/**
 * A bank question as STAFF may see it: no answer, no option correctness, no
 * tips — the columns behind those are revoked from `authenticated` entirely
 * (P11a/decision 76), and staff have no definer read path to them.
 */
export interface BankQuestionSummary {
  id: string
  type: QuestionType
  question: string
  subTopicId: string
  subTopicName: string
}

export interface CreateQuestionInput {
  type: QuestionType
  question: string
  imagePath?: string | null
  subTopicId: string
  gradeLevelId?: string | null
  subjectId?: string | null
  answer?: string | null
  options?: MCQOption[]
  imageHash?: string | null // SHA-256 hash of all images for duplicate detection
  tagIds?: string[] // Learning-point tags to attach
}

export interface UpdateQuestionInput {
  type?: QuestionType
  question?: string
  imagePath?: string | null
  answer?: string | null
  options?: MCQOption[]
  imageHash?: string | null // SHA-256 hash of all images for duplicate detection
  tagIds?: string[] // Full desired tag set; diffed against the stored set
}

/**
 * Convert database row to Question interface
 */
export function rowToQuestion(
  row: QuestionRowWithTags,
  curriculumStore: ReturnType<typeof useCurriculumStore>,
): Question {
  const options: MCQOption[] = [
    {
      id: 'a',
      text: row.option_1_text,
      imagePath: row.option_1_image_path,
      isCorrect: row.option_1_is_correct ?? false,
      tip: row.option_1_tip,
    },
    {
      id: 'b',
      text: row.option_2_text,
      imagePath: row.option_2_image_path,
      isCorrect: row.option_2_is_correct ?? false,
      tip: row.option_2_tip,
    },
    {
      id: 'c',
      text: row.option_3_text,
      imagePath: row.option_3_image_path,
      isCorrect: row.option_3_is_correct ?? false,
      tip: row.option_3_tip,
    },
    {
      id: 'd',
      text: row.option_4_text,
      imagePath: row.option_4_image_path,
      isCorrect: row.option_4_is_correct ?? false,
      tip: row.option_4_tip,
    },
  ]

  // Get names from curriculum store using sub_topic hierarchy
  let gradeLevelName = ''
  let subjectName = ''
  let topicName = ''
  let subTopicName = ''

  const hierarchy = curriculumStore.getSubTopicWithHierarchy(row.sub_topic_id)
  if (hierarchy) {
    gradeLevelName = hierarchy.gradeLevel.name
    subjectName = hierarchy.subject.name
    topicName = hierarchy.topic.name
    subTopicName = hierarchy.subTopic.name
  }

  return {
    id: row.id,
    type: row.type,
    question: row.question,
    imagePath: row.image_path,
    subTopicId: row.sub_topic_id,
    gradeLevelId: row.grade_level_id,
    subjectId: row.subject_id,
    answer: row.answer,
    options,
    tags: (row.question_tags ?? [])
      .map((link) => link.tags)
      .filter((tag): tag is QuestionTag => tag !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    imageHash: row.image_hash,
    gradeLevelName,
    subjectName,
    topicName,
    subTopicName,
  }
}

/** Write MCQ/MRQ options (text, image, correctness, tip) into a row payload */
function applyOptionsToRow(
  target: Database['public']['Tables']['questions']['Update'],
  options: MCQOption[],
): void {
  const optionA = options.find((o) => o.id === 'a')
  const optionB = options.find((o) => o.id === 'b')
  const optionC = options.find((o) => o.id === 'c')
  const optionD = options.find((o) => o.id === 'd')

  target.option_1_text = optionA?.text ?? null
  target.option_1_image_path = optionA?.imagePath ?? null
  target.option_1_is_correct = optionA?.isCorrect ?? false
  target.option_1_tip = optionA?.tip ?? null

  target.option_2_text = optionB?.text ?? null
  target.option_2_image_path = optionB?.imagePath ?? null
  target.option_2_is_correct = optionB?.isCorrect ?? false
  target.option_2_tip = optionB?.tip ?? null

  target.option_3_text = optionC?.text ?? null
  target.option_3_image_path = optionC?.imagePath ?? null
  target.option_3_is_correct = optionC?.isCorrect ?? false
  target.option_3_tip = optionC?.tip ?? null

  target.option_4_text = optionD?.text ?? null
  target.option_4_image_path = optionD?.imagePath ?? null
  target.option_4_is_correct = optionD?.isCorrect ?? false
  target.option_4_tip = optionD?.tip ?? null
}

/**
 * The global question bank.
 *
 * Read paths after P11a (decision 76) — `questions.answer`,
 * `option_N_is_correct` and `option_N_tip` are REVOKED from `authenticated`,
 * so a `select('*')` on the table now fails with 42501 for every role:
 * - ADMIN authoring → `get_bank_questions` (definer, admin-gated) →
 *   `questions` (full fidelity).
 * - STAFF (teacher/manager) → `fetchBankSummaries`, named content columns
 *   only → `bankSummaries` (no correctness of any kind).
 * - STUDENTS never read the bank through this store; practice content comes
 *   from `get_practice_session_questions` (see `@/lib/practiceHelpers`).
 *
 * Writes are unaffected (the INSERT/UPDATE grants are intact) as long as no
 * write returns the row: see `addQuestion` / `updateQuestion`.
 */
export const useQuestionsStore = defineStore('questions', () => {
  const curriculumStore = useCurriculumStore()

  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Staff-facing, key-free listing (assessment builder's bank picker)
  const bankSummaries = ref<BankQuestionSummary[]>([])

  /**
   * Resolve a selected name-path to the exact set of sub_topic IDs by walking
   * the curriculum hierarchy. A level set to `undefined` means "ALL" (no
   * constraint at that level). Crucially, a child name only matches WITHIN
   * branches whose selected ancestors also match — so a sub-topic/topic/subject
   * name shared across different parents (e.g. "Addition" under multiple topics,
   * or "Math" under P1 and P2) is NOT conflated across unrelated branches.
   */
  function resolveSubTopicIdsForPath(
    gradeLevel: string | undefined,
    subject: string | undefined,
    topic: string | undefined,
    subTopic: string | undefined,
  ): string[] {
    const ids: string[] = []
    for (const gl of curriculumStore.gradeLevels) {
      if (gradeLevel && gl.name !== gradeLevel) continue
      for (const sub of gl.subjects) {
        if (subject && sub.name !== subject) continue
        for (const t of sub.topics) {
          if (topic && t.name !== topic) continue
          for (const st of t.subTopics) {
            if (subTopic && st.name !== subTopic) continue
            ids.push(st.id)
          }
        }
      }
    }
    return ids
  }

  /**
   * ADMIN ONLY — the authoring panel's questions for one sub-topic, keys and
   * tips included. `get_bank_questions` is the only read path left: the key
   * columns are revoked from `authenticated` (P11a/decision 76), so a direct
   * table read of `*` fails with 42501 for every role, admins included.
   */
  async function fetchBankQuestionsBySubTopic(
    subTopicId: string,
  ): Promise<{ questions: Question[]; error: string | null }> {
    try {
      // Ensure curriculum is loaded
      if (curriculumStore.gradeLevels.length === 0) {
        await curriculumStore.fetchCurriculum()
      }

      const { data, error: fetchError } = await supabase
        .rpc('get_bank_questions', { p_sub_topic_id: subTopicId })
        .select(QUESTION_WITH_TAGS_SELECT)
        .order('created_at', { ascending: false })

      if (fetchError) {
        return { questions: [], error: handleError(fetchError, 'failedFetchQuestions') }
      }

      return {
        questions: (data ?? []).map((row) => rowToQuestion(row, curriculumStore)),
        error: null,
      }
    } catch (err) {
      const message = handleError(err, 'failedFetchQuestions')
      return { questions: [], error: message }
    }
  }

  /**
   * STAFF-SAFE — the bank listing behind the assessment builder's question
   * picker. Selects only columns `authenticated` may read, so teachers and
   * managers (who have no key access at all) can browse the bank; nothing here
   * can carry correctness.
   */
  async function fetchBankSummaries(): Promise<{ error: string | null }> {
    try {
      if (curriculumStore.gradeLevels.length === 0) {
        await curriculumStore.fetchCurriculum()
      }

      const BATCH_SIZE = 1000
      const rows: { id: string; type: QuestionType; question: string; sub_topic_id: string }[] = []
      let from = 0
      let hasMore = true

      while (hasMore) {
        const { data, error: fetchError } = await supabase
          .from('questions')
          .select('id, type, question, sub_topic_id')
          .order('created_at', { ascending: false })
          .range(from, from + BATCH_SIZE - 1)

        if (fetchError) throw fetchError
        rows.push(...(data ?? []))
        hasMore = (data?.length ?? 0) === BATCH_SIZE
        from += BATCH_SIZE
      }

      bankSummaries.value = rows.map((row) => ({
        id: row.id,
        type: row.type,
        question: row.question,
        subTopicId: row.sub_topic_id,
        subTopicName:
          curriculumStore.getSubTopicWithHierarchy(row.sub_topic_id)?.subTopic.name ?? '',
      }))

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchQuestions') }
    }
  }

  /**
   * Make a question's stored tag set equal `tagIds` (diff add/remove on
   * `question_tags` — the table has no UPDATE grant, only INSERT/DELETE).
   */
  async function applyTagSet(questionId: string, tagIds: string[]): Promise<void> {
    const { data, error: fetchError } = await supabase
      .from('question_tags')
      .select('tag_id')
      .eq('question_id', questionId)

    if (fetchError) throw fetchError

    const current = new Set((data ?? []).map((row) => row.tag_id))
    const desired = new Set(tagIds)
    const toAdd = tagIds.filter((id) => !current.has(id))
    const toRemove = [...current].filter((id) => !desired.has(id))

    if (toAdd.length > 0) {
      const { error: insertError } = await supabase
        .from('question_tags')
        .insert(toAdd.map((tagId) => ({ question_id: questionId, tag_id: tagId })))
      if (insertError) throw insertError
    }

    if (toRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from('question_tags')
        .delete()
        .eq('question_id', questionId)
        .in('tag_id', toRemove)
      if (deleteError) throw deleteError
    }
  }

  /**
   * Add a new question. The caller owns list refreshes (the per-sub-topic
   * question panel refetches its own sub-topic after a successful write).
   */
  async function addQuestion(
    input: CreateQuestionInput,
  ): Promise<{ error: string | null; id?: string }> {
    try {
      const insertData: Database['public']['Tables']['questions']['Insert'] = {
        type: input.type,
        question: input.question,
        image_path: input.imagePath ?? null,
        sub_topic_id: input.subTopicId,
        grade_level_id: input.gradeLevelId ?? null,
        subject_id: input.subjectId ?? null,
        answer: input.type === 'short_answer' ? (input.answer ?? null) : null,
        image_hash: input.imageHash ?? null,
      }

      // Add MCQ/MRQ options if present
      if ((input.type === 'mcq' || input.type === 'mrq') && input.options) {
        applyOptionsToRow(insertData, input.options)
      }

      // `select('id')` — NOT a bare `select()`: returning the whole row would
      // read the revoked key columns and fail with 42501 (P11a).
      const { data, error: insertError } = await supabase
        .from('questions')
        .insert(insertData)
        .select('id')
        .single()

      if (insertError) throw insertError

      if (input.tagIds && input.tagIds.length > 0) {
        await applyTagSet(data.id, input.tagIds)
      }

      return { error: null, id: data.id }
    } catch (err) {
      const message = handleError(err, 'failedAddQuestion')
      return { error: message }
    }
  }

  /**
   * Update an existing question
   */
  async function updateQuestion(
    id: string,
    input: UpdateQuestionInput,
  ): Promise<{ error: string | null }> {
    try {
      const updateData: Database['public']['Tables']['questions']['Update'] = {}

      if (input.type !== undefined) updateData.type = input.type
      if (input.question !== undefined) updateData.question = input.question
      if (input.imagePath !== undefined) updateData.image_path = input.imagePath
      if (input.answer !== undefined) updateData.answer = input.answer
      if (input.imageHash !== undefined) updateData.image_hash = input.imageHash

      // Update MCQ options if present
      if (input.options) {
        applyOptionsToRow(updateData, input.options)
      }

      // Tag-only edits are valid (updateData may be empty otherwise)
      if (Object.keys(updateData).length > 0) {
        // No returning select: reading the row back would touch the revoked
        // key columns (P11a), and nothing here consumes it.
        const { error: updateError } = await supabase
          .from('questions')
          .update(updateData)
          .eq('id', id)

        if (updateError) throw updateError
      }

      if (input.tagIds !== undefined) {
        await applyTagSet(id, input.tagIds)
      }

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedUpdateQuestion')
      return { error: message }
    }
  }

  /**
   * Delete a question
   */
  async function deleteQuestion(question: Question): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase.from('questions').delete().eq('id', question.id)

      if (deleteError) throw deleteError

      // Storage cleanup (decision 78): the row is gone, so its question and
      // option images are unreferenced. Best-effort — a storage failure only
      // leaves an orphan, it never surfaces as a failed delete.
      void removeStorageObjects('question-images', [
        question.imagePath,
        ...question.options.map((option) => option.imagePath),
      ])

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedDeleteQuestion')
      return { error: message }
    }
  }

  function uploadQuestionImage(file: File, optionId?: 'a' | 'b' | 'c' | 'd') {
    const folder = optionId ? `options/${optionId}` : 'questions'
    return uploadStorageFile('question-images', file, { folder })
  }

  function deleteQuestionImage(path: string) {
    return deleteStorageFile('question-images', path)
  }

  const {
    getImageUrl: getQuestionImageUrl,
    getOptimizedImageUrl: getOptimizedQuestionImageUrl,
    getThumbnailImageUrl: getThumbnailQuestionImageUrl,
  } = createBucketImageHelpers('question-images')

  // Filter helpers — derive from curriculum store (works without loading all questions)
  function getGradeLevels(): string[] {
    return curriculumStore.gradeLevels.map((gl) => gl.name)
  }

  function getSubjects(gradeLevelName?: string): string[] {
    const subjects: string[] = []
    for (const gl of curriculumStore.gradeLevels) {
      if (gradeLevelName && gl.name !== gradeLevelName) continue
      for (const sub of gl.subjects) {
        subjects.push(sub.name)
      }
    }
    return [...new Set(subjects)]
  }

  function getTopics(gradeLevelName?: string, subjectName?: string): string[] {
    const topics: string[] = []
    for (const gl of curriculumStore.gradeLevels) {
      if (gradeLevelName && gl.name !== gradeLevelName) continue
      for (const sub of gl.subjects) {
        if (subjectName && sub.name !== subjectName) continue
        for (const t of sub.topics) {
          topics.push(t.name)
        }
      }
    }
    return [...new Set(topics)]
  }

  function getSubTopics(
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
  ): string[] {
    const subTopics: string[] = []
    for (const gl of curriculumStore.gradeLevels) {
      if (gradeLevelName && gl.name !== gradeLevelName) continue
      for (const sub of gl.subjects) {
        if (subjectName && sub.name !== subjectName) continue
        for (const t of sub.topics) {
          if (topicName && t.name !== topicName) continue
          for (const st of t.subTopics) {
            subTopics.push(st.name)
          }
        }
      }
    }
    return [...new Set(subTopics)]
  }

  /**
   * Build the set of sub_topic IDs matching a selected name-path, scoped
   * hierarchically. Returns null when no level is constrained (match all).
   * Filtering by sub_topic ID (rather than independent name equality at each
   * level) prevents questions from same-named branches under different parents
   * from being conflated — each question's subTopicId belongs to exactly one
   * branch.
   */
  function resolveFilterSubTopicIdSet(
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
    subTopicName?: string,
  ): Set<string> | null {
    if (!gradeLevelName && !subjectName && !topicName && !subTopicName) return null
    return new Set(resolveSubTopicIdsForPath(gradeLevelName, subjectName, topicName, subTopicName))
  }

  /** Staff bank picker: the same name-path filtering over the key-free list. */
  function getFilteredBankSummaries(
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
    subTopicName?: string,
  ): BankQuestionSummary[] {
    const idSet = resolveFilterSubTopicIdSet(gradeLevelName, subjectName, topicName, subTopicName)
    if (idSet === null) return bankSummaries.value
    return bankSummaries.value.filter((q) => idSet.has(q.subTopicId))
  }

  function $reset() {
    bankSummaries.value = []
    isLoading.value = false
    error.value = null
  }

  return {
    // State
    bankSummaries,
    isLoading,
    error,

    // Actions
    fetchBankQuestionsBySubTopic,
    fetchBankSummaries,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    uploadQuestionImage,
    deleteQuestionImage,
    getQuestionImageUrl,
    getOptimizedQuestionImageUrl,
    getThumbnailQuestionImageUrl,

    // Filter helpers
    getGradeLevels,
    getSubjects,
    getTopics,
    getSubTopics,
    getFilteredBankSummaries,

    $reset,
  }
})
