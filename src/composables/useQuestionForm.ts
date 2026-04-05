import { ref, computed, onMounted } from 'vue'
import { useForm } from 'vee-validate'
import { z } from 'zod'
import { useCurriculumStore } from '@/stores/curriculum'
import { useQuestionsStore, type MCQOption, type Question } from '@/stores/questions'
import type { Database } from '@/types/database.types'

type QuestionType = Database['public']['Enums']['question_type']

// Define MCQ option schema
const mcqOptionSchema = z.object({
  id: z.enum(['a', 'b', 'c', 'd']),
  text: z.string().nullable(),
  imagePath: z.string().nullable(),
  isCorrect: z.boolean(),
})

// Helper to check if an option is filled
const isOptionFilled = (opt: { text: string | null; imagePath: string | null }) =>
  (opt.text && opt.text.trim()) || opt.imagePath

// Dynamic validation schema based on question type
const questionFormSchema = z
  .object({
    type: z.enum(['mcq', 'mrq', 'short_answer']),
    gradeLevelId: z.string().min(1, 'Grade level is required'),
    subjectId: z.string().min(1, 'Subject is required'),
    topicId: z.string().min(1, 'Topic is required'),
    subTopicId: z.string().min(1, 'Sub-topic is required'),
    question: z.string().min(1, 'Question text is required'),
    explanation: z.string().optional(),
    answer: z.string().optional(),
    options: z.array(mcqOptionSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.type === 'mcq' || data.type === 'mrq') && data.options) {
      const filledOptions = data.options.filter(isOptionFilled)
      if (filledOptions.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'At least 2 options must have text or an image',
          path: ['options'],
        })
      }

      // Check that options are filled consecutively from the beginning (A, B, C, D order)
      let foundEmpty = false
      for (const opt of data.options) {
        const isFilled = isOptionFilled(opt)
        if (foundEmpty && isFilled) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Options must be filled consecutively from Option A',
            path: ['options'],
          })
          break
        }
        if (!isFilled) {
          foundEmpty = true
        }
      }

      const correctCount = data.options.filter((opt) => opt.isCorrect).length
      if (data.type === 'mcq' && correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'MCQ must have exactly one correct answer',
          path: ['options'],
        })
      }
      if (data.type === 'mrq' && correctCount < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'MRQ must have at least one correct answer',
          path: ['options'],
        })
      }
    }
    if (data.type === 'short_answer' && (!data.answer || !data.answer.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Answer is required',
        path: ['answer'],
      })
    }
  })

export const defaultOptions: MCQOption[] = [
  { id: 'a', text: '', imagePath: null, isCorrect: false },
  { id: 'b', text: '', imagePath: null, isCorrect: false },
  { id: 'c', text: '', imagePath: null, isCorrect: false },
  { id: 'd', text: '', imagePath: null, isCorrect: false },
]

export interface QuestionImageState {
  displayUrl: string
  file: File | null
  originalPath: string | null
  removed: boolean
}

export interface OptionImageState {
  file: File | null
  originalPath: string | null
  removed: boolean
}

type OptionId = 'a' | 'b' | 'c' | 'd'
export type OptionImagesMap = Record<OptionId, OptionImageState>

const defaultQuestionImage: QuestionImageState = {
  displayUrl: '',
  file: null,
  originalPath: null,
  removed: false,
}

function freshOptionImages(): OptionImagesMap {
  return {
    a: { file: null, originalPath: null, removed: false },
    b: { file: null, originalPath: null, removed: false },
    c: { file: null, originalPath: null, removed: false },
    d: { file: null, originalPath: null, removed: false },
  }
}

export function useQuestionForm() {
  const curriculumStore = useCurriculumStore()
  const questionsStore = useQuestionsStore()

  const isSaving = ref(false)

  const { handleSubmit, values, setFieldValue, resetForm, errors, setFieldTouched, setValues } =
    useForm({
      validationSchema: questionFormSchema,
      initialValues: {
        type: 'mcq' as QuestionType,
        gradeLevelId: '',
        subjectId: '',
        topicId: '',
        subTopicId: '',
        question: '',
        explanation: '',
        answer: '',
        options: [...defaultOptions],
      },
    })

  // ─── Consolidated image state ──────────────────────────────────────────────
  const questionImage = ref<QuestionImageState>({ ...defaultQuestionImage })
  const optionImages = ref<OptionImagesMap>(freshOptionImages())

  const imageInputRef = ref<HTMLInputElement | null>(null)
  const optionImageInputRefs = ref<Record<string, HTMLInputElement | null>>({
    a: null,
    b: null,
    c: null,
    d: null,
  })

  // ─── Curriculum fetch ────────────────────────────────────────────────────────
  onMounted(async () => {
    if (curriculumStore.gradeLevels.length === 0) {
      await curriculumStore.fetchCurriculum()
    }
  })

  // ─── Cascading selects ───────────────────────────────────────────────────────
  const availableSubjects = computed(() => {
    const grade = curriculumStore.gradeLevels.find((g) => g.id === values.gradeLevelId)
    return grade?.subjects ?? []
  })

  const availableTopics = computed(() => {
    const grade = curriculumStore.gradeLevels.find((g) => g.id === values.gradeLevelId)
    const subject = grade?.subjects.find((s) => s.id === values.subjectId)
    return subject?.topics ?? []
  })

  const availableSubTopics = computed(() => {
    const grade = curriculumStore.gradeLevels.find((g) => g.id === values.gradeLevelId)
    const subject = grade?.subjects.find((s) => s.id === values.subjectId)
    const topic = subject?.topics.find((t) => t.id === values.topicId)
    return topic?.subTopics ?? []
  })

  // ─── Image handlers ──────────────────────────────────────────────────────────
  function handleImageUpload(event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (file) {
      questionImage.value.file = file
      const reader = new FileReader()
      reader.onload = (e) => {
        questionImage.value.displayUrl = e.target?.result as string
      }
      reader.readAsDataURL(file)
    }
  }

  function removeImage() {
    // Mark for deletion if there was an original image (edit mode)
    if (questionImage.value.originalPath) {
      questionImage.value.removed = true
    }
    questionImage.value.displayUrl = ''
    questionImage.value.file = null
    if (imageInputRef.value) {
      imageInputRef.value.value = ''
    }
  }

  function handleOptionImageUpload(event: Event, optionId: 'a' | 'b' | 'c' | 'd') {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (file) {
      optionImages.value[optionId].file = file
      // Reset removal flag since we're adding a new image (edit mode)
      optionImages.value[optionId].removed = false
      const reader = new FileReader()
      reader.onload = (e) => {
        const currentOptions = values.options || []
        const options = currentOptions.map((opt) =>
          opt.id === optionId ? { ...opt, imagePath: e.target?.result as string } : opt,
        )
        setFieldValue('options', options)
      }
      reader.readAsDataURL(file)
    }
  }

  function removeOptionImage(optionId: 'a' | 'b' | 'c' | 'd') {
    const currentOptions = values.options || []
    const options = currentOptions.map((opt) =>
      opt.id === optionId ? { ...opt, imagePath: null } : opt,
    )
    setFieldValue('options', options)
    optionImages.value[optionId].file = null
    // Mark for deletion if there was an original image (edit mode)
    if (optionImages.value[optionId].originalPath) {
      optionImages.value[optionId].removed = true
    }
    const inputRef = optionImageInputRefs.value[optionId]
    if (inputRef) {
      inputRef.value = ''
    }
  }

  // ─── Option handlers ──────────────────────────────────────────────────────────
  function setCorrectOption(optionId: string) {
    // For MCQ: single correct answer (radio behavior)
    const options = (values.options || []).map((opt) => ({
      ...opt,
      isCorrect: opt.id === optionId,
    }))
    setFieldValue('options', options)
    setFieldTouched('options', true)
  }

  function toggleCorrectOption(optionId: string) {
    // For MRQ: multiple correct answers (checkbox behavior)
    const options = (values.options || []).map((opt) => ({
      ...opt,
      isCorrect: opt.id === optionId ? !opt.isCorrect : opt.isCorrect,
    }))
    setFieldValue('options', options)
    setFieldTouched('options', true)
  }

  function updateOptionText(optionId: string, text: string) {
    const currentOptions = values.options || []
    const options = currentOptions.map((opt) =>
      opt.id === optionId ? { ...opt, text: text || null } : opt,
    )
    setFieldValue('options', options)
  }

  // ─── Edit-only: get display URL for option images ─────────────────────────────
  function getOptionImageUrl(optionId: 'a' | 'b' | 'c' | 'd'): string {
    const option = values.options?.find((o) => o.id === optionId)
    if (!option?.imagePath) return ''

    // If it's a data URL (newly uploaded), return as-is
    if (option.imagePath.startsWith('data:')) {
      return option.imagePath
    }

    // Otherwise, get the optimized thumbnail URL from storage
    return questionsStore.getThumbnailQuestionImageUrl(option.imagePath)
  }

  // ─── Form initialization helpers ──────────────────────────────────────────────
  function resetToBlank() {
    resetForm({
      values: {
        type: 'mcq',
        gradeLevelId: '',
        subjectId: '',
        topicId: '',
        subTopicId: '',
        question: '',
        explanation: '',
        answer: '',
        options: [...defaultOptions.map((o) => ({ ...o }))],
      },
    })
    questionImage.value = { ...defaultQuestionImage }
    optionImages.value = freshOptionImages()
  }

  function initializeEditForm(question: Question) {
    // Store original image paths for cleanup
    questionImage.value = {
      displayUrl: question.imagePath
        ? questionsStore.getOptimizedQuestionImageUrl(question.imagePath)
        : '',
      file: null,
      originalPath: question.imagePath,
      removed: false,
    }

    optionImages.value = {
      a: {
        file: null,
        originalPath: question.options.find((o) => o.id === 'a')?.imagePath ?? null,
        removed: false,
      },
      b: {
        file: null,
        originalPath: question.options.find((o) => o.id === 'b')?.imagePath ?? null,
        removed: false,
      },
      c: {
        file: null,
        originalPath: question.options.find((o) => o.id === 'c')?.imagePath ?? null,
        removed: false,
      },
      d: {
        file: null,
        originalPath: question.options.find((o) => o.id === 'd')?.imagePath ?? null,
        removed: false,
      },
    }

    // Set form values
    const hierarchy = curriculumStore.getSubTopicWithHierarchy(question.subTopicId)
    setValues({
      type: question.type,
      gradeLevelId: question.gradeLevelId ?? '',
      subjectId: question.subjectId ?? '',
      topicId: hierarchy?.topic.id ?? '',
      subTopicId: question.subTopicId,
      question: question.question,
      explanation: question.explanation ?? '',
      answer: question.answer ?? '',
      options: question.options.map((opt) => ({
        id: opt.id,
        text: opt.text,
        imagePath: opt.imagePath,
        isCorrect: opt.isCorrect,
      })),
    })
  }

  return {
    // Form
    handleSubmit,
    values,
    setFieldValue,
    errors,
    isSaving,

    // Curriculum
    availableSubjects,
    availableTopics,
    availableSubTopics,

    // Consolidated image state
    questionImage,
    optionImages,
    imageInputRef,
    optionImageInputRefs,

    // Image handlers
    handleImageUpload,
    removeImage,
    handleOptionImageUpload,
    removeOptionImage,

    // Option handlers
    setCorrectOption,
    toggleCorrectOption,
    updateOptionText,

    // Edit-only helpers
    getOptionImageUrl,
    initializeEditForm,

    // Add-only helpers
    resetToBlank,
  }
}
