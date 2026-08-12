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
  withinFileDuplicates: WithinFileDuplicate[]
}

export interface BulkUploadOptions {
  questions: ValidatedQuestion[]
  /** Every imported question is created in this sub-topic (the one in view). */
  subTopicId: string
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

/**
 * Dedup key within the target sub-topic: normalized question text, plus the
 * image hash when the question carries images. The file's curriculum name
 * columns play no part — the import is scoped to one sub-topic.
 */
function getQuestionKey(question: string, imageHash?: string | null): string {
  const baseKey = normalizeText(question)
  return imageHash ? `${baseKey}|${imageHash}` : baseKey
}

/**
 * Build the dedup lookup map of the target sub-topic's existing questions,
 * keyed by question text + image hash, mapping to the existing question id.
 */
async function buildExistingQuestionMap(subTopicId: string): Promise<Map<string, string>> {
  const existingMap = new Map<string, string>()
  const BATCH_SIZE = 1000
  let from = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question, image_hash')
      .eq('sub_topic_id', subTopicId)
      .range(from, from + BATCH_SIZE - 1)

    if (error) throw error

    const rows = data ?? []
    for (const row of rows) {
      existingMap.set(getQuestionKey(row.question, row.image_hash), row.id)
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

export async function validateQuestions(
  parsed: ParsedQuestion[],
  subTopicId: string,
): Promise<UploadValidationResult> {
  // Build the existing-question dedup map for the target sub-topic only.
  const existingMap = await buildExistingQuestionMap(subTopicId)

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

  // Track within-file duplicates (maps key to {rows, imageHash})
  const seenInFile = new Map<string, { rows: number[]; firstQuestion: ValidatedQuestion }>()

  for (const q of parsed) {
    // Get the pre-computed image hash if this question has images
    const imageHash = parsedHashes.get(q.row) || null

    const key = getQuestionKey(q.question, imageHash)

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
    withinFileDuplicates,
  }
}

// ============================================
// BULK UPLOAD EXECUTION
// ============================================

export async function executeBulkUpload(options: BulkUploadOptions): Promise<BulkUploadResult> {
  const { questions, subTopicId, onProgress } = options
  const questionsStore = useQuestionsStore()
  const curriculumStore = useCurriculumStore()

  // The whole import targets one sub-topic; resolve its hierarchy once for the
  // denormalized grade_level_id / subject_id columns.
  if (curriculumStore.gradeLevels.length === 0) {
    await curriculumStore.fetchCurriculum()
  }
  const hierarchy = curriculumStore.getSubTopicWithHierarchy(subTopicId)

  let success = 0
  const failed: Array<{ row: number; error: string }> = []

  for (const [i, q] of questions.entries()) {
    // Track uploaded image paths outside the try so the catch can clean them up.
    let uploadedImages: UploadedImages | null = null
    try {
      // Upload images BEFORE creating the question so image paths are included
      // in the initial INSERT (required by DB constraints like mcq_has_two_options)
      uploadedImages = await uploadImagesBeforeCreate(questionsStore, q)

      // Build question input (including pre-computed image hash for duplicate detection)
      const input: CreateQuestionInput = {
        type: q.type,
        subTopicId,
        gradeLevelId: hierarchy?.gradeLevel.id ?? null,
        subjectId: hierarchy?.subject.id ?? null,
        question: q.question,
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
            tip: null,
          },
          {
            id: 'b',
            text: q.optionB,
            imagePath: uploadedImages.optionImagePaths.b,
            isCorrect: correctIndex === 1,
            tip: null,
          },
          {
            id: 'c',
            text: q.optionC,
            imagePath: uploadedImages.optionImagePaths.c,
            isCorrect: correctIndex === 2,
            tip: null,
          },
          {
            id: 'd',
            text: q.optionD,
            imagePath: uploadedImages.optionImagePaths.d,
            isCorrect: correctIndex === 3,
            tip: null,
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
            tip: null,
          },
          {
            id: 'b',
            text: q.optionB,
            imagePath: uploadedImages.optionImagePaths.b,
            isCorrect: correctAnswers.includes('B'),
            tip: null,
          },
          {
            id: 'c',
            text: q.optionC,
            imagePath: uploadedImages.optionImagePaths.c,
            isCorrect: correctAnswers.includes('C'),
            tip: null,
          },
          {
            id: 'd',
            text: q.optionD,
            imagePath: uploadedImages.optionImagePaths.d,
            isCorrect: correctAnswers.includes('D'),
            tip: null,
          },
        ]
      } else {
        // short_answer
        input.answer = q.correctAnswer
      }

      const result = await questionsStore.addQuestion(input)
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
