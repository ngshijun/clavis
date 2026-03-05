import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import type { Database } from '@/types/database.types'
import { useCurriculumStore } from './curriculum'
import { handleError } from '@/lib/errors'
import { getStorageImageUrl, type ImageTransformOptions } from '@/lib/storage'
import { useCascadingFilters } from '@/composables/useCascadingFilters'

type QuestionRow = Database['public']['Tables']['questions']['Row']
export type QuestionType = Database['public']['Enums']['question_type']

export interface MCQOption {
  id: 'a' | 'b' | 'c' | 'd'
  text: string | null
  imagePath: string | null
  isCorrect: boolean
}

export interface Question {
  id: string
  type: QuestionType
  question: string
  imagePath: string | null
  subTopicId: string // topic_id column now references sub_topics
  gradeLevelId: string | null
  subjectId: string | null
  explanation: string | null
  answer: string | null // For short_answer type
  options: MCQOption[] // For MCQ type
  createdAt: string | null
  updatedAt: string | null
  imageHash: string | null // SHA-256 hash of all images for duplicate detection
  // Denormalized names for display
  gradeLevelName: string
  subjectName: string
  topicName: string
  subTopicName: string
}

export interface QuestionStatistics {
  questionId: string
  attempts: number
  correctCount: number
  correctnessRate: number
  averageTimeSeconds: number
}

export interface QuestionWithStats extends Question {
  stats: QuestionStatistics
}

export interface CreateQuestionInput {
  type: QuestionType
  question: string
  imagePath?: string | null
  subTopicId: string // topic_id column now references sub_topics
  gradeLevelId?: string | null
  subjectId?: string | null
  explanation?: string | null
  answer?: string | null
  options?: MCQOption[]
  imageHash?: string | null // SHA-256 hash of all images for duplicate detection
}

export interface UpdateQuestionInput {
  type?: QuestionType
  question?: string
  imagePath?: string | null
  subTopicId?: string // topic_id column now references sub_topics
  gradeLevelId?: string | null
  subjectId?: string | null
  explanation?: string | null
  answer?: string | null
  options?: MCQOption[]
  imageHash?: string | null // SHA-256 hash of all images for duplicate detection
}

/**
 * Convert database row to Question interface
 * Note: topic_id in DB now references sub_topics table
 */
function rowToQuestion(
  row: QuestionRow,
  curriculumStore: ReturnType<typeof useCurriculumStore>,
): Question {
  const options: MCQOption[] = [
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
  ]

  // Get names from curriculum store using sub_topic hierarchy
  let gradeLevelName = ''
  let subjectName = ''
  let topicName = ''
  let subTopicName = ''

  // topic_id now references sub_topics, so use getSubTopicWithHierarchy
  const hierarchy = curriculumStore.getSubTopicWithHierarchy(row.topic_id)
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
    subTopicId: row.topic_id, // topic_id column references sub_topics
    gradeLevelId: row.grade_level_id,
    subjectId: row.subject_id,
    explanation: row.explanation,
    answer: row.answer,
    options,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    imageHash: row.image_hash,
    gradeLevelName,
    subjectName,
    topicName,
    subTopicName,
  }
}

export const useQuestionsStore = defineStore('questions', () => {
  const curriculumStore = useCurriculumStore()

  const questions = ref<Question[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Question statistics (fetched separately or computed from practice_answers)
  const questionStatistics = ref<QuestionStatistics[]>([])

  // ============================================
  // Question Bank Page State (persisted across navigation)
  // ============================================
  const {
    filters: questionBankFilters,
    pagination: questionBankPagination,
    setGradeLevel: _setQuestionBankGradeLevel,
    setSubject: _setQuestionBankSubject,
    setTopic: _setQuestionBankTopic,
    setSubTopic: _setQuestionBankSubTopic,
    setSearch: _setQuestionBankSearch,
    setPageIndex: _setQuestionBankPageIndex,
    setPageSize: _setQuestionBankPageSize,
    resetFilters: resetQuestionBankFilters,
  } = useCascadingFilters({ hasSearch: true })

  // Server-side pagination state for question bank
  const serverQuestions = ref<Question[]>([])
  const serverTotalCount = ref(0)
  const serverIsLoading = ref(false)
  let fetchVersion = 0
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

  // ============================================
  // Question Feedback Page State (persisted across navigation)
  // ============================================
  const questionFeedbackFilters = ref({
    search: '',
  })

  const questionFeedbackPagination = ref({
    pageIndex: 0,
    pageSize: 10,
  })

  // ============================================
  // Question Statistics Page State (persisted across navigation)
  // ============================================
  const {
    filters: questionStatisticsFilters,
    pagination: questionStatisticsPagination,
    setGradeLevel: setQuestionStatisticsGradeLevel,
    setSubject: setQuestionStatisticsSubject,
    setTopic: setQuestionStatisticsTopic,
    setSubTopic: setQuestionStatisticsSubTopic,
    setSearch: setQuestionStatisticsSearch,
    setPageIndex: setQuestionStatisticsPageIndex,
    setPageSize: setQuestionStatisticsPageSize,
    resetFilters: resetQuestionStatisticsFilters,
  } = useCascadingFilters({ hasSearch: true })

  const ALL_VALUE = '__all__'

  /**
   * Resolve current question bank filters to an array of sub_topic IDs
   * using the already-loaded curriculum hierarchy.
   * Returns null if no filters are applied (fetch all questions).
   */
  function resolveSubTopicIds(): string[] | null {
    const f = questionBankFilters.value
    const gradeLevel = f.gradeLevel !== ALL_VALUE ? f.gradeLevel : undefined
    const subject = f.subject !== ALL_VALUE ? f.subject : undefined
    const topic = f.topic !== ALL_VALUE ? f.topic : undefined
    const subTopic = f.subTopic !== ALL_VALUE ? f.subTopic : undefined

    if (!gradeLevel && !subject && !topic && !subTopic) return null

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

  /** Escape SQL LIKE wildcards so user input is matched literally */
  function escapeLikePattern(value: string): string {
    return value.replace(/%/g, '\\%').replace(/_/g, '\\_')
  }

  /**
   * Get current filter parameters for query building.
   */
  function getFilterParams() {
    return {
      subTopicIds: resolveSubTopicIds(),
      search: (questionBankFilters.value as { search?: string }).search?.trim() || '',
    }
  }

  /**
   * Fetch a single page of questions for the question bank (server-side pagination).
   */
  async function fetchQuestionBankPage(): Promise<void> {
    const version = ++fetchVersion
    serverIsLoading.value = true
    error.value = null

    try {
      // Ensure curriculum is loaded first
      if (curriculumStore.gradeLevels.length === 0) {
        await curriculumStore.fetchCurriculum()
      }

      const { pageIndex, pageSize } = questionBankPagination.value
      const from = pageIndex * pageSize
      const to = from + pageSize - 1
      const { subTopicIds, search } = getFilterParams()

      // No sub-topics match filters — return empty immediately
      if (subTopicIds !== null && subTopicIds.length === 0) {
        serverQuestions.value = []
        serverTotalCount.value = 0
        serverIsLoading.value = false
        return
      }

      let query = supabase.from('questions').select('*', { count: 'exact', head: false })

      if (subTopicIds !== null) {
        query = query.in('topic_id', subTopicIds)
      }
      if (search) {
        query = query.ilike('question', `%${escapeLikePattern(search)}%`)
      }

      const {
        data,
        count,
        error: fetchError,
      } = await query.order('created_at', { ascending: false }).range(from, to)

      if (fetchError) throw fetchError

      // Discard stale responses
      if (version !== fetchVersion) return

      serverQuestions.value = (data ?? []).map((row) => rowToQuestion(row, curriculumStore))
      serverTotalCount.value = count ?? 0
    } catch (err) {
      if (version !== fetchVersion) return
      error.value = handleError(err, 'Failed to fetch questions.')
    } finally {
      if (version === fetchVersion) {
        serverIsLoading.value = false
      }
    }
  }

  /**
   * Fetch ALL questions matching current filters (for export).
   * Uses batch fetching since exports can exceed 1000 rows.
   * Only called on explicit export actions, not on page load.
   */
  async function fetchAllFilteredQuestions(): Promise<Question[]> {
    if (curriculumStore.gradeLevels.length === 0) {
      await curriculumStore.fetchCurriculum()
    }

    const { subTopicIds, search } = getFilterParams()

    // No sub-topics match filters — return empty immediately
    if (subTopicIds !== null && subTopicIds.length === 0) {
      return []
    }

    const BATCH_SIZE = 1000
    const allRows: QuestionRow[] = []
    let from = 0
    let hasMore = true

    while (hasMore) {
      let query = supabase.from('questions').select('*')

      if (subTopicIds !== null) {
        query = query.in('topic_id', subTopicIds)
      }
      if (search) {
        query = query.ilike('question', `%${escapeLikePattern(search)}%`)
      }

      const { data, error: fetchError } = await query
        .order('created_at', { ascending: false })
        .range(from, from + BATCH_SIZE - 1)

      if (fetchError) throw fetchError
      allRows.push(...(data ?? []))
      hasMore = (data?.length ?? 0) === BATCH_SIZE
      from += BATCH_SIZE
    }

    return allRows.map((row) => rowToQuestion(row, curriculumStore))
  }

  /**
   * Fetch all questions into local `questions` array.
   * Used by question statistics and feedback pages that still need all questions loaded.
   */
  async function fetchQuestions(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      if (curriculumStore.gradeLevels.length === 0) {
        await curriculumStore.fetchCurriculum()
      }

      const BATCH_SIZE = 1000
      const allRows: QuestionRow[] = []
      let from = 0
      let hasMore = true

      while (hasMore) {
        const { data, error: fetchError } = await supabase
          .from('questions')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + BATCH_SIZE - 1)

        if (fetchError) throw fetchError
        allRows.push(...(data ?? []))
        hasMore = (data?.length ?? 0) === BATCH_SIZE
        from += BATCH_SIZE
      }

      questions.value = allRows.map((row) => rowToQuestion(row, curriculumStore))
    } catch (err) {
      error.value = handleError(err, 'Failed to fetch questions.')
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Fetch questions for a specific sub-topic
   * Note: topic_id column in DB now references sub_topics table
   */
  async function fetchQuestionsBySubTopic(
    subTopicId: string,
  ): Promise<{ questions: Question[]; error: string | null }> {
    try {
      // Ensure curriculum is loaded
      if (curriculumStore.gradeLevels.length === 0) {
        await curriculumStore.fetchCurriculum()
      }

      const { data, error: fetchError } = await supabase
        .from('questions')
        .select('*')
        .eq('topic_id', subTopicId)
        .order('created_at', { ascending: false })

      if (fetchError) {
        return { questions: [], error: handleError(fetchError, 'Failed to fetch questions.') }
      }

      return {
        questions: (data ?? []).map((row) => rowToQuestion(row, curriculumStore)),
        error: null,
      }
    } catch (err) {
      const message = handleError(err, 'Failed to fetch questions.')
      return { questions: [], error: message }
    }
  }

  /**
   * Add a new question
   */
  async function addQuestion(
    input: CreateQuestionInput,
  ): Promise<{ error: string | null; id?: string }> {
    try {
      const insertData: Database['public']['Tables']['questions']['Insert'] = {
        type: input.type,
        question: input.question,
        image_path: input.imagePath ?? null,
        topic_id: input.subTopicId,
        grade_level_id: input.gradeLevelId ?? null,
        subject_id: input.subjectId ?? null,
        explanation: input.explanation ?? null,
        answer: input.type === 'short_answer' ? (input.answer ?? null) : null,
        image_hash: input.imageHash ?? null,
      }

      // Add MCQ/MRQ options if present
      if ((input.type === 'mcq' || input.type === 'mrq') && input.options) {
        const optionA = input.options.find((o) => o.id === 'a')
        const optionB = input.options.find((o) => o.id === 'b')
        const optionC = input.options.find((o) => o.id === 'c')
        const optionD = input.options.find((o) => o.id === 'd')

        insertData.option_1_text = optionA?.text ?? null
        insertData.option_1_image_path = optionA?.imagePath ?? null
        insertData.option_1_is_correct = optionA?.isCorrect ?? false

        insertData.option_2_text = optionB?.text ?? null
        insertData.option_2_image_path = optionB?.imagePath ?? null
        insertData.option_2_is_correct = optionB?.isCorrect ?? false

        insertData.option_3_text = optionC?.text ?? null
        insertData.option_3_image_path = optionC?.imagePath ?? null
        insertData.option_3_is_correct = optionC?.isCorrect ?? false

        insertData.option_4_text = optionD?.text ?? null
        insertData.option_4_image_path = optionD?.imagePath ?? null
        insertData.option_4_is_correct = optionD?.isCorrect ?? false
      }

      const { data, error: insertError } = await supabase
        .from('questions')
        .insert(insertData)
        .select()
        .single()

      if (insertError) throw insertError

      // Refresh current page to show the new question
      await fetchQuestionBankPage()

      return { error: null, id: data.id }
    } catch (err) {
      const message = handleError(err, 'Failed to add question.')
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
      if (input.subTopicId !== undefined) updateData.topic_id = input.subTopicId
      if (input.gradeLevelId !== undefined) updateData.grade_level_id = input.gradeLevelId
      if (input.subjectId !== undefined) updateData.subject_id = input.subjectId
      if (input.explanation !== undefined) updateData.explanation = input.explanation
      if (input.answer !== undefined) updateData.answer = input.answer
      if (input.imageHash !== undefined) updateData.image_hash = input.imageHash

      // Update MCQ options if present
      if (input.options) {
        const optionA = input.options.find((o) => o.id === 'a')
        const optionB = input.options.find((o) => o.id === 'b')
        const optionC = input.options.find((o) => o.id === 'c')
        const optionD = input.options.find((o) => o.id === 'd')

        updateData.option_1_text = optionA?.text ?? null
        updateData.option_1_image_path = optionA?.imagePath ?? null
        updateData.option_1_is_correct = optionA?.isCorrect ?? false

        updateData.option_2_text = optionB?.text ?? null
        updateData.option_2_image_path = optionB?.imagePath ?? null
        updateData.option_2_is_correct = optionB?.isCorrect ?? false

        updateData.option_3_text = optionC?.text ?? null
        updateData.option_3_image_path = optionC?.imagePath ?? null
        updateData.option_3_is_correct = optionC?.isCorrect ?? false

        updateData.option_4_text = optionD?.text ?? null
        updateData.option_4_image_path = optionD?.imagePath ?? null
        updateData.option_4_is_correct = optionD?.isCorrect ?? false
      }

      const { data, error: updateError } = await supabase
        .from('questions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      // Refresh current page
      await fetchQuestionBankPage()

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to update question.')
      return { error: message }
    }
  }

  /**
   * Delete a question
   */
  async function deleteQuestion(id: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase.from('questions').delete().eq('id', id)

      if (deleteError) throw deleteError

      // Refresh current page
      await fetchQuestionBankPage()

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to delete question.')
      return { error: message }
    }
  }

  /**
   * Get a question by ID
   */
  function getQuestionById(id: string): Question | undefined {
    return questions.value.find((q) => q.id === id)
  }

  /**
   * Fetch a single question by ID and add/update it in the store
   * Used for on-demand loading (e.g., feedback page preview)
   */
  async function fetchQuestionById(id: string): Promise<{ error: string | null }> {
    try {
      const { data, error: fetchError } = await supabase
        .from('questions')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) {
        return { error: handleError(fetchError, 'Failed to fetch question.') }
      }

      if (data) {
        const question = rowToQuestion(data, curriculumStore)
        // Update existing or add new
        const existingIndex = questions.value.findIndex((q) => q.id === id)
        if (existingIndex >= 0) {
          questions.value[existingIndex] = question
        } else {
          questions.value.push(question)
        }
      }

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to fetch question.')
      return { error: message }
    }
  }

  /**
   * Upload a question or option image
   * Sets high cache-control value for better CDN caching (1 year)
   */
  async function uploadQuestionImage(
    file: File,
    questionId: string,
    optionId?: 'a' | 'b' | 'c' | 'd',
  ): Promise<{ path: string | null; error: string | null }> {
    try {
      const fileExt = file.name.split('.').pop()
      const folder = optionId ? `options/${optionId}` : 'questions'
      const filePath = `${folder}/${questionId}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('question-images')
        .upload(filePath, file, {
          upsert: true,
          // High cache-control value (1 year) for better CDN caching
          // Smart CDN will auto-invalidate when file is updated
          cacheControl: '31536000',
        })

      if (uploadError) throw uploadError

      return { path: filePath, error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to upload image.')
      return { path: null, error: message }
    }
  }

  /**
   * Delete a question image from storage
   */
  async function deleteQuestionImage(path: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase.storage.from('question-images').remove([path])

      if (deleteError) throw deleteError

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to delete image.')
      return { error: message }
    }
  }

  function getQuestionImageUrl(path: string | null, transform?: ImageTransformOptions): string {
    return getStorageImageUrl('question-images', path, transform)
  }

  /**
   * Get optimized image URL for question display (medium size)
   * Uses width=800 which is suitable for most question displays
   */
  function getOptimizedQuestionImageUrl(path: string | null): string {
    return getQuestionImageUrl(path, { width: 800, quality: 80 })
  }

  /**
   * Get thumbnail URL for question image (small size for lists/previews)
   */
  function getThumbnailQuestionImageUrl(path: string | null): string {
    return getQuestionImageUrl(path, { width: 200, quality: 70 })
  }

  /**
   * Fetch question statistics via admin-only RPC function
   */
  async function fetchQuestionStatistics(): Promise<void> {
    try {
      const { data, error: fetchError } = await supabase.rpc('get_question_statistics')

      if (fetchError) throw fetchError

      questionStatistics.value = (data ?? [])
        .filter((row) => row.question_id !== null)
        .map((row) => ({
          questionId: row.question_id!,
          attempts: row.attempts ?? 0,
          correctCount: row.correct_count ?? 0,
          correctnessRate: row.correctness_rate ?? 0,
          averageTimeSeconds: row.avg_time_seconds ?? 0,
        }))
    } catch (err) {
      console.error('Error fetching question statistics:', err)
    }
  }

  /**
   * Get statistics for a specific question
   */
  function getStatsByQuestionId(id: string): QuestionStatistics | undefined {
    return questionStatistics.value.find((s) => s.questionId === id)
  }

  /**
   * Refresh the materialized view for question statistics and re-fetch
   */
  async function refreshQuestionStatistics(): Promise<{ error: string | null }> {
    try {
      const { error: rpcError } = await supabase.rpc('refresh_question_statistics')
      if (rpcError) throw rpcError

      await fetchQuestionStatistics()
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'Failed to refresh statistics') }
    }
  }

  /**
   * Get questions with statistics
   */
  const questionsWithStats = computed<QuestionWithStats[]>(() => {
    return questions.value.map((q) => {
      const stats = questionStatistics.value.find((s) => s.questionId === q.id) ?? {
        questionId: q.id,
        attempts: 0,
        correctCount: 0,
        correctnessRate: 0,
        averageTimeSeconds: 0,
      }
      return { ...q, stats }
    })
  })

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

  function getFilteredQuestions(
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
    subTopicName?: string,
  ): Question[] {
    let filtered = questions.value
    if (gradeLevelName) {
      filtered = filtered.filter((q) => q.gradeLevelName === gradeLevelName)
    }
    if (subjectName) {
      filtered = filtered.filter((q) => q.subjectName === subjectName)
    }
    if (topicName) {
      filtered = filtered.filter((q) => q.topicName === topicName)
    }
    if (subTopicName) {
      filtered = filtered.filter((q) => q.subTopicName === subTopicName)
    }
    return filtered
  }

  function getFilteredQuestionsWithStats(
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
    subTopicName?: string,
  ): QuestionWithStats[] {
    let filtered = questionsWithStats.value
    if (gradeLevelName) {
      filtered = filtered.filter((q) => q.gradeLevelName === gradeLevelName)
    }
    if (subjectName) {
      filtered = filtered.filter((q) => q.subjectName === subjectName)
    }
    if (topicName) {
      filtered = filtered.filter((q) => q.topicName === topicName)
    }
    if (subTopicName) {
      filtered = filtered.filter((q) => q.subTopicName === subTopicName)
    }
    return filtered
  }

  // ============================================
  // Question Feedback Page Setters (simpler, no cascading)
  // ============================================
  function setQuestionFeedbackSearch(value: string) {
    questionFeedbackFilters.value.search = value
    questionFeedbackPagination.value.pageIndex = 0
  }

  function setQuestionFeedbackPageIndex(value: number) {
    questionFeedbackPagination.value.pageIndex = value
  }

  function setQuestionFeedbackPageSize(value: number) {
    questionFeedbackPagination.value.pageSize = value
    questionFeedbackPagination.value.pageIndex = 0
  }

  // ============================================
  // Question Bank filter setters (trigger server refetch)
  // ============================================
  function setQuestionBankGradeLevel(value: string) {
    _setQuestionBankGradeLevel(value)
    fetchQuestionBankPage()
  }
  function setQuestionBankSubject(value: string) {
    _setQuestionBankSubject(value)
    fetchQuestionBankPage()
  }
  function setQuestionBankTopic(value: string) {
    _setQuestionBankTopic(value)
    fetchQuestionBankPage()
  }
  function setQuestionBankSubTopic(value: string) {
    _setQuestionBankSubTopic(value)
    fetchQuestionBankPage()
  }
  function setQuestionBankSearch(value: string) {
    // Intentionally bypasses _setQuestionBankSearch to avoid resetting pageIndex on every keystroke.
    // pageIndex is reset in the debounce callback so the page and data update together.
    ;(questionBankFilters.value as { search: string }).search = value
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      questionBankPagination.value.pageIndex = 0
      fetchQuestionBankPage()
    }, 300)
  }
  function setQuestionBankPageIndex(value: number) {
    _setQuestionBankPageIndex(value)
    fetchQuestionBankPage()
  }
  function setQuestionBankPageSize(value: number) {
    _setQuestionBankPageSize(value)
    fetchQuestionBankPage()
  }

  function $reset() {
    questions.value = []
    serverQuestions.value = []
    serverTotalCount.value = 0
    serverIsLoading.value = false
    questionStatistics.value = []
    isLoading.value = false
    error.value = null
    resetQuestionBankFilters()
    resetQuestionStatisticsFilters()
    questionFeedbackFilters.value = { search: '' }
    questionFeedbackPagination.value = { pageIndex: 0, pageSize: 10 }
  }

  return {
    // State
    questions,
    questionStatistics,
    questionsWithStats,
    isLoading,
    error,

    // Server-side pagination state (question bank)
    serverQuestions,
    serverTotalCount,
    serverIsLoading,

    // Actions
    fetchQuestions,
    fetchQuestionBankPage,
    fetchAllFilteredQuestions,
    fetchQuestionsBySubTopic,
    fetchQuestionById,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    getQuestionById,
    uploadQuestionImage,
    deleteQuestionImage,
    getQuestionImageUrl,
    getOptimizedQuestionImageUrl,
    getThumbnailQuestionImageUrl,
    fetchQuestionStatistics,
    refreshQuestionStatistics,
    getStatsByQuestionId,

    // Filter helpers
    getGradeLevels,
    getSubjects,
    getTopics,
    getSubTopics,
    getFilteredQuestions,
    getFilteredQuestionsWithStats,

    // Question Bank Page State
    questionBankFilters,
    questionBankPagination,
    setQuestionBankGradeLevel,
    setQuestionBankSubject,
    setQuestionBankTopic,
    setQuestionBankSubTopic,
    setQuestionBankSearch,
    setQuestionBankPageIndex,
    setQuestionBankPageSize,

    // Question Feedback Page State
    questionFeedbackFilters,
    questionFeedbackPagination,
    setQuestionFeedbackSearch,
    setQuestionFeedbackPageIndex,
    setQuestionFeedbackPageSize,

    // Question Statistics Page State
    questionStatisticsFilters,
    questionStatisticsPagination,
    setQuestionStatisticsGradeLevel,
    setQuestionStatisticsSubject,
    setQuestionStatisticsTopic,
    setQuestionStatisticsSubTopic,
    setQuestionStatisticsSearch,
    setQuestionStatisticsPageIndex,
    setQuestionStatisticsPageSize,

    $reset,
  }
})
