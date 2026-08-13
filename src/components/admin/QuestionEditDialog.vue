<script setup lang="ts">
import { watch } from 'vue'
import { useQuestionsStore, type Question } from '@/stores/questions'
import { useQuestionForm } from '@/composables/useQuestionForm'
import { computeQuestionImageHash } from '@/lib/imageHash'
import { Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'vue-sonner'
import QuestionFormFields from './QuestionFormFields.vue'
import { useT } from '@/composables/useT'

const props = defineProps<{
  open: boolean
  question: Question | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: []
}>()

const t = useT()

const questionsStore = useQuestionsStore()

const form = useQuestionForm()

// Populate form when dialog opens with a question
watch(
  () => props.open,
  (open) => {
    if (open && props.question) {
      form.initializeEditForm(props.question)
    }
  },
)

const onSubmit = form.handleSubmit(async (formValues) => {
  if (!props.question) return

  form.isSaving.value = true

  try {
    const questionId = props.question.id

    // Track image paths to update
    let questionImagePath: string | null = props.question.imagePath
    const optionImagePaths: Record<string, string | null> = {
      a: form.optionImages.value.a.originalPath,
      b: form.optionImages.value.b.originalPath,
      c: form.optionImages.value.c.originalPath,
      d: form.optionImages.value.d.originalPath,
    }

    // Handle question image changes
    if (form.questionImage.value.file) {
      if (form.questionImage.value.originalPath) {
        await questionsStore.deleteQuestionImage(form.questionImage.value.originalPath)
      }
      const uploadResult = await questionsStore.uploadQuestionImage(form.questionImage.value.file)
      if (uploadResult.path) {
        questionImagePath = uploadResult.path
      } else {
        console.error('Failed to upload question image:', uploadResult.error)
      }
    } else if (form.questionImage.value.removed && form.questionImage.value.originalPath) {
      await questionsStore.deleteQuestionImage(form.questionImage.value.originalPath)
      questionImagePath = null
    }

    // Handle option image changes (for MCQ/MRQ)
    if (formValues.type === 'mcq' || formValues.type === 'mrq') {
      for (const optionId of ['a', 'b', 'c', 'd'] as const) {
        const optImg = form.optionImages.value[optionId]
        if (optImg.file) {
          if (optImg.originalPath) {
            await questionsStore.deleteQuestionImage(optImg.originalPath)
          }
          const uploadResult = await questionsStore.uploadQuestionImage(optImg.file, optionId)
          if (uploadResult.path) {
            optionImagePaths[optionId] = uploadResult.path
          } else {
            console.error(`Failed to upload option ${optionId} image:`, uploadResult.error)
          }
        } else if (optImg.removed && optImg.originalPath) {
          await questionsStore.deleteQuestionImage(optImg.originalPath)
          optionImagePaths[optionId] = null
        }
      }
    }

    // Build update options with correct image paths (for MCQ/MRQ)
    const updateOptions =
      formValues.type === 'mcq' || formValues.type === 'mrq'
        ? (formValues.options || []).map((opt) => ({
            id: opt.id,
            text: opt.text,
            imagePath: optionImagePaths[opt.id] ?? null,
            isCorrect: opt.isCorrect,
            tip: opt.tip,
          }))
        : undefined

    // Update the question (it stays in its sub-topic — CRUD is per-sub-topic)
    const result = await questionsStore.updateQuestion(questionId, {
      type: formValues.type,
      question: formValues.question,
      imagePath: questionImagePath,
      answer: formValues.type === 'short_answer' ? formValues.answer || null : null,
      options: updateOptions,
      tagIds: form.selectedTagIds.value,
    })

    if (result.error) {
      toast.error(t.value.shared.questionEditDialog.toastFailed(result.error))
      return
    }

    // Recompute image hash if any images were changed
    const imagesChanged =
      form.questionImage.value.file ||
      form.questionImage.value.removed ||
      Object.values(form.optionImages.value).some((o) => o.file !== null) ||
      Object.values(form.optionImages.value).some((o) => o.removed)

    if (imagesChanged) {
      // The question itself was already persisted above. The image-hash recompute is a
      // best-effort follow-up used only for duplicate detection: if hashing fails (e.g. a
      // transient fetch error while re-hashing an unchanged image's storage URL), swallow it
      // so the otherwise-successful edit is not rolled back. The hash can be recomputed later.
      try {
        const imageHash = await computeQuestionImageHash({
          questionImage: form.questionImage.value.file
            ? form.questionImage.value.file
            : form.questionImage.value.removed
              ? null
              : questionImagePath
                ? questionsStore.getQuestionImageUrl(questionImagePath)
                : null,
          optionAImage: form.optionImages.value.a.file
            ? form.optionImages.value.a.file
            : form.optionImages.value.a.removed
              ? null
              : optionImagePaths.a
                ? questionsStore.getQuestionImageUrl(optionImagePaths.a)
                : null,
          optionBImage: form.optionImages.value.b.file
            ? form.optionImages.value.b.file
            : form.optionImages.value.b.removed
              ? null
              : optionImagePaths.b
                ? questionsStore.getQuestionImageUrl(optionImagePaths.b)
                : null,
          optionCImage: form.optionImages.value.c.file
            ? form.optionImages.value.c.file
            : form.optionImages.value.c.removed
              ? null
              : optionImagePaths.c
                ? questionsStore.getQuestionImageUrl(optionImagePaths.c)
                : null,
          optionDImage: form.optionImages.value.d.file
            ? form.optionImages.value.d.file
            : form.optionImages.value.d.removed
              ? null
              : optionImagePaths.d
                ? questionsStore.getQuestionImageUrl(optionImagePaths.d)
                : null,
        })

        await questionsStore.updateQuestion(questionId, { imageHash: imageHash || null })
      } catch (hashError) {
        console.error('Failed to recompute question image hash:', hashError)
      }
    }

    toast.success(t.value.shared.questionEditDialog.toastUpdated)

    emit('save')
    emit('update:open', false)
  } finally {
    form.isSaving.value = false
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t.shared.questionEditDialog.title }}</DialogTitle>
        <DialogDescription>{{ t.shared.questionEditDialog.description }}</DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="onSubmit">
        <QuestionFormFields :form="form" :option-image-url-getter="form.getOptionImageUrl" />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            :disabled="form.isSaving.value"
            @click="emit('update:open', false)"
          >
            {{ t.shared.questionEditDialog.cancel }}
          </Button>
          <Button type="submit" :disabled="form.isSaving.value">
            <Loader2 v-if="form.isSaving.value" class="mr-2 size-4 animate-spin" />
            {{ t.shared.questionEditDialog.saveChanges }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
