import type { ParsedQuestion, ParsedQuestionImage } from './questionExcel'
import { useQuestionsStore, type CreateQuestionInput } from '@/stores/questions'
import { useCurriculumStore } from '@/stores/curriculum'
import { computeQuestionImageHash } from '@/lib/imageHash'
import { supabase } from '@/lib/supabaseClient'

// ============================================
// TYPES
// ============================================

export interface DuplicateInfo {
  row: number
  existingId: string
  question: string
}

export interface InvalidInfo {
  row: number
  errors: string[]
}

export interface WithinFileDuplicate {
  rows: number[]
  question: string
}

export interface ValidatedQuestion extends ParsedQuestion {
  imageHash: string | null // Pre-computed image hash for duplicate detection
}

export interface UploadValidationResult {
  valid: ValidatedQuestion[]
  duplicates: DuplicateInfo[]
  invalid: InvalidInfo[]
  withinFileDuplicates: WithinFileDuplicate[]
  curriculumErrors: InvalidInfo[]
}

export interface BulkUploadOptions {
  questions: ValidatedQuestion[]
  onProgress?: (current: number, total: number) => void
}

export interface BulkUploadResult {
  success: number
  failed: Array<{ row: number; error: string }>
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ')
}

function getQuestionKey(
  question: string,
  gradeLevel: string,
  subject: string,
  topic: string,
  subTopic: string,
  imageHash?: string | null,
): string {
  const baseKey = `${normalizeText(question)}|${normalizeText(gradeLevel)}|${normalizeText(subject)}|${normalizeText(topic)}|${normalizeText(subTopic)}`
  // Include image hash in key if present
  return imageHash ? `${baseKey}|${imageHash}` : baseKey
}

/**
 * Build the dedup lookup map of existing questions keyed by question text +
 * hierarchy names + image hash, mapping to the existing question id.
 *
 * Selects only the columns the dedup key needs (question, sub_topic_id, image_hash)
 * and resolves hierarchy names from the already-loaded curriculum store, rather
 * than fetching '*' and hydrating full Question objects.
 */
async function buildExistingQuestionMap(
  curriculumStore: ReturnType<typeof useCurriculumStore>,
): Promise<Map<string, string>> {
  const existingMap = new Map<string, string>()
  const BATCH_SIZE = 1000
  let from = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question, sub_topic_id, image_hash')
      .range(from, from + BATCH_SIZE - 1)

    if (error) throw error

    const rows = data ?? []
    for (const row of rows) {
      // Resolve the full hierarchy for names.
      const hierarchy = curriculumStore.getSubTopicWithHierarchy(row.sub_topic_id)
      if (!hierarchy) continue

      const key = getQuestionKey(
        row.question,
        hierarchy.gradeLevel.name,
        hierarchy.subject.name,
        hierarchy.topic.name,
        hierarchy.subTopic.name,
        row.image_hash,
      )
      existingMap.set(key, row.id)
    }

    hasMore = rows.length === BATCH_SIZE
    from += BATCH_SIZE
  }

  return existingMap
}

/**
 * Check if a parsed question has any images
 */
function hasImages(q: ParsedQuestion): boolean {
  return !!(q.questionImage || q.optionAImage || q.optionBImage || q.optionCImage || q.optionDImage)
}

/**
 * Compute image hash for a parsed question from base64 images
 */
async function computeParsedQuestionHash(q: ParsedQuestion): Promise<string> {
  return computeQuestionImageHash({
    questionImage: q.questionImage?.base64,
    optionAImage: q.optionAImage?.base64,
    optionBImage: q.optionBImage?.base64,
    optionCImage: q.optionCImage?.base64,
    optionDImage: q.optionDImage?.base64,
  })
}

// ============================================
// VALIDATION
// ============================================

export async function validateQuestions(parsed: ParsedQuestion[]): Promise<UploadValidationResult> {
  const curriculumStore = useCurriculumStore()

  // Ensure curriculum is loaded (needed to resolve sub_topic_id -> hierarchy names)
  if (curriculumStore.gradeLevels.length === 0) {
    await curriculumStore.fetchCurriculum()
  }

  // Build the existing-question dedup map from a lightweight server query that
  // selects only the columns the dedup key needs, instead of hydrating every
  // row into a full Question via fetchQuestions() (which selects '*').
  const existingMap = await buildExistingQuestionMap(curriculumStore)

  // Pre-compute image hashes for all parsed questions with images
  const parsedHashes = new Map<number, string>()
  for (const q of parsed) {
    if (hasImages(q)) {
      const hash = await computeParsedQuestionHash(q)
      parsedHashes.set(q.row, hash)
    }
  }

  const valid: ValidatedQuestion[] = []
  const duplicates: DuplicateInfo[] = []
  const invalid: InvalidInfo[] = []
  const curriculumErrors: InvalidInfo[] = []

  // Track within-file duplicates (maps key to {rows, imageHash})
  const seenInFile = new Map<string, { rows: number[]; firstQuestion: ValidatedQuestion }>()

  for (const q of parsed) {
    // Get the pre-computed image hash if this question has images
    const imageHash = parsedHashes.get(q.row) || null

    const key = getQuestionKey(
      q.question,
      q.gradeLevelName,
      q.subjectName,
      q.topicName,
      q.subTopicName,
      imageHash, // Include image hash in key
    )
    const errors: string[] = []

    // Check curriculum hierarchy: grade_level -> subject -> topic -> sub_topic
    const gradeLevel = curriculumStore.gradeLevels.find(
      (g) => normalizeText(g.name) === normalizeText(q.gradeLevelName),
    )
    if (!gradeLevel) {
      errors.push(`Grade Level "${q.gradeLevelName}" not found`)
    } else {
      const subject = gradeLevel.subjects.find(
        (s) => normalizeText(s.name) === normalizeText(q.subjectName),
      )
      if (!subject) {
        errors.push(`Subject "${q.subjectName}" not found under "${q.gradeLevelName}"`)
      } else {
        // Find topic by name
        const topic = subject.topics.find(
          (t) => normalizeText(t.name) === normalizeText(q.topicName),
        )
        if (!topic) {
          errors.push(`Topic "${q.topicName}" not found under "${q.subjectName}"`)
        } else {
          // Find sub-topic under the specific topic
          const subTopic = topic.subTopics.find(
            (st) => normalizeText(st.name) === normalizeText(q.subTopicName),
          )
          if (!subTopic) {
            errors.push(`Sub-Topic "${q.subTopicName}" not found under "${q.topicName}"`)
          }
        }
      }
    }

    if (errors.length > 0) {
      curriculumErrors.push({ row: q.row, errors })
      continue
    }

    // Create validated question with image hash
    const validatedQuestion: ValidatedQuestion = { ...q, imageHash }

    // Track within-file duplicates BEFORE the DB-duplicate check so repeated
    // rows are consolidated into the within-file report even when they also
    // exist in the DB (otherwise each occurrence is reported as a DB duplicate
    // and the within-file repetition is never surfaced).
    if (seenInFile.has(key)) {
      seenInFile.get(key)!.rows.push(q.row)
      continue
    }
    seenInFile.set(key, { rows: [q.row], firstQuestion: validatedQuestion })

    // First occurrence of this key: report as DB duplicate if it already
    // exists, otherwise accept it as valid.
    const existingId = existingMap.get(key)
    if (existingId) {
      duplicates.push({
        row: q.row,
        existingId,
        question: q.question.length > 100 ? q.question.slice(0, 100) + '...' : q.question,
      })
      continue
    }

    valid.push(validatedQuestion) // Only add first occurrence to valid
  }

  // Extract within-file duplicates (where there's more than one row with same key)
  const withinFileDuplicates: WithinFileDuplicate[] = []
  for (const [, data] of seenInFile.entries()) {
    if (data.rows.length > 1) {
      const questionText = data.firstQuestion.question
      withinFileDuplicates.push({
        rows: data.rows,
        question: questionText.length > 100 ? questionText.slice(0, 100) + '...' : questionText,
      })
    }
  }

  return {
    valid,
    duplicates,
    invalid,
    withinFileDuplicates,
    curriculumErrors,
  }
}

// ============================================
// BULK UPLOAD EXECUTION
// ============================================

export async function executeBulkUpload(options: BulkUploadOptions): Promise<BulkUploadResult> {
  const { questions, onProgress } = options
  const questionsStore = useQuestionsStore()
  const curriculumStore = useCurriculumStore()

  let success = 0
  const failed: Array<{ row: number; error: string }> = []

  for (const [i, q] of questions.entries()) {
    // Track uploaded image paths outside the try so the catch can clean them up.
    let uploadedImages: UploadedImages | null = null
    try {
      // Resolve curriculum IDs: grade_level -> subject -> topic -> sub_topic
      const gradeLevel = curriculumStore.gradeLevels.find(
        (g) => normalizeText(g.name) === normalizeText(q.gradeLevelName),
      )
      const subject = gradeLevel?.subjects.find(
        (s) => normalizeText(s.name) === normalizeText(q.subjectName),
      )
      const topic = subject?.topics.find(
        (t) => normalizeText(t.name) === normalizeText(q.topicName),
      )
      const subTopic = topic?.subTopics.find(
        (st) => normalizeText(st.name) === normalizeText(q.subTopicName),
      )

      if (!gradeLevel || !subject || !topic || !subTopic) {
        failed.push({ row: q.row, error: 'Curriculum hierarchy not found' })
        onProgress?.(i + 1, questions.length)
        continue
      }

      // Upload images BEFORE creating the question so image paths are included
      // in the initial INSERT (required by DB constraints like mcq_has_two_options)
      uploadedImages = await uploadImagesBeforeCreate(questionsStore, q)

      // Build question input (including pre-computed image hash for duplicate detection)
      const input: CreateQuestionInput = {
        type: q.type,
        gradeLevelId: gradeLevel.id,
        subjectId: subject.id,
        subTopicId: subTopic.id,
        question: q.question,
        explanation: q.explanation || undefined,
        imagePath: uploadedImages.questionImagePath,
        imageHash: q.imageHash, // Pre-computed during validation
      }

      if (q.type === 'mcq') {
        // MCQ: single correct answer
        const correctIndex = q.correctAnswer.charCodeAt(0) - 65 // A=0, B=1, etc
        input.options = [
          {
            id: 'a',
            text: q.optionA,
            imagePath: uploadedImages.optionImagePaths.a,
            isCorrect: correctIndex === 0,
          },
          {
            id: 'b',
            text: q.optionB,
            imagePath: uploadedImages.optionImagePaths.b,
            isCorrect: correctIndex === 1,
          },
          {
            id: 'c',
            text: q.optionC,
            imagePath: uploadedImages.optionImagePaths.c,
            isCorrect: correctIndex === 2,
          },
          {
            id: 'd',
            text: q.optionD,
            imagePath: uploadedImages.optionImagePaths.d,
            isCorrect: correctIndex === 3,
          },
        ]
      } else if (q.type === 'mrq') {
        // MRQ: multiple correct answers (e.g., "A,B" or "A,C,D")
        const correctAnswers = q.correctAnswer.split(',').map((a) => a.trim().toUpperCase())
        input.options = [
          {
            id: 'a',
            text: q.optionA,
            imagePath: uploadedImages.optionImagePaths.a,
            isCorrect: correctAnswers.includes('A'),
          },
          {
            id: 'b',
            text: q.optionB,
            imagePath: uploadedImages.optionImagePaths.b,
            isCorrect: correctAnswers.includes('B'),
          },
          {
            id: 'c',
            text: q.optionC,
            imagePath: uploadedImages.optionImagePaths.c,
            isCorrect: correctAnswers.includes('C'),
          },
          {
            id: 'd',
            text: q.optionD,
            imagePath: uploadedImages.optionImagePaths.d,
            isCorrect: correctAnswers.includes('D'),
          },
        ]
      } else {
        // short_answer
        input.answer = q.correctAnswer
      }

      // Create question (skip page refresh during bulk — one refresh at end)
      const result = await questionsStore.addQuestion(input, { skipRefresh: true })
      if (result.error || !result.id) {
        // INSERT failed — remove the already-uploaded images so storage is not orphaned.
        await cleanupUploadedImages(questionsStore, uploadedImages)
        failed.push({ row: q.row, error: result.error || 'Unknown error' })
        onProgress?.(i + 1, questions.length)
        continue
      }

      success++
    } catch (error) {
      // Unexpected failure after upload — best-effort remove orphaned images.
      await cleanupUploadedImages(questionsStore, uploadedImages)
      failed.push({ row: q.row, error: String(error) })
    }

    onProgress?.(i + 1, questions.length)
  }

  // Single page refresh after all questions are inserted
  if (success > 0) {
    await questionsStore.fetchQuestionBankPage()
  }

  return { success, failed }
}

interface UploadedImages {
  questionImagePath: string | null
  optionImagePaths: Record<'a' | 'b' | 'c' | 'd', string | null>
}

/**
 * Upload all images for a question BEFORE creating the DB record.
 * This ensures image paths are included in the initial INSERT,
 * satisfying DB constraints (e.g. mcq_has_two_options) for image-only options.
 */
async function uploadImagesBeforeCreate(
  store: ReturnType<typeof useQuestionsStore>,
  q: ParsedQuestion,
): Promise<UploadedImages> {
  const result: UploadedImages = {
    questionImagePath: null,
    optionImagePaths: { a: null, b: null, c: null, d: null },
  }

  // Upload all images in parallel
  const uploads: Promise<void>[] = []

  if (q.questionImage) {
    uploads.push(
      (async () => {
        const file = base64ToFile(q.questionImage!, `question_bulk`)
        const uploadResult = await store.uploadQuestionImage(file)
        result.questionImagePath = uploadResult.path
      })(),
    )
  }

  const optionEntries: Array<{ key: 'a' | 'b' | 'c' | 'd'; image: ParsedQuestionImage | null }> = [
    { key: 'a', image: q.optionAImage },
    { key: 'b', image: q.optionBImage },
    { key: 'c', image: q.optionCImage },
    { key: 'd', image: q.optionDImage },
  ]

  for (const { key, image } of optionEntries) {
    if (image) {
      uploads.push(
        (async () => {
          const file = base64ToFile(image, `option_${key}_bulk`)
          const uploadResult = await store.uploadQuestionImage(file, key)
          result.optionImagePaths[key] = uploadResult.path
        })(),
      )
    }
  }

  await Promise.all(uploads)

  return result
}

/**
 * Best-effort removal of images uploaded for a question whose INSERT failed,
 * so the question-images bucket is not left with orphaned files.
 */
async function cleanupUploadedImages(
  store: ReturnType<typeof useQuestionsStore>,
  uploaded: UploadedImages | null,
): Promise<void> {
  if (!uploaded) return

  const paths = [
    uploaded.questionImagePath,
    uploaded.optionImagePaths.a,
    uploaded.optionImagePaths.b,
    uploaded.optionImagePaths.c,
    uploaded.optionImagePaths.d,
  ].filter((p): p is string => !!p)

  await Promise.all(
    paths.map(async (path) => {
      try {
        await store.deleteQuestionImage(path)
      } catch (error) {
        console.error(`Failed to clean up orphaned image ${path}:`, error)
      }
    }),
  )
}

function base64ToFile(image: ParsedQuestionImage, filename: string): File {
  const byteString = atob(image.base64)
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i)
  }
  const blob = new Blob([ab], { type: image.mimeType })
  return new File([blob], `${filename}.${image.extension}`, { type: image.mimeType })
}
