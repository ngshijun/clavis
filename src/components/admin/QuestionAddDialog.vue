<script setup lang="ts">
import { watch } from 'vue'
import { useCurriculumStore } from '@/stores/curriculum'
import { useQuestionsStore } from '@/stores/questions'
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
  /** The sub-topic the new question is created in (the one in view). */
  subTopicId: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: []
}>()

const t = useT()

const curriculumStore = useCurriculumStore()
const questionsStore = useQuestionsStore()

const form = useQuestionForm()

// Reset form when dialog opens
watch(
  () => props.open,
  (open) => {
    if (open) {
      form.resetToBlank()
    }
  },
)

const onSubmit = form.handleSubmit(async (formValues) => {
  form.isSaving.value = true

  try {
    // Denormalized grade_level_id / subject_id come from the contextual sub-topic
    const hierarchy = curriculumStore.getSubTopicWithHierarchy(props.subTopicId)

    // Upload images BEFORE creating the question so image paths are included
    // in the initial INSERT (required by DB constraints like mcq_has_two_options)
    let questionImagePath: string | null = null
    const optionImagePaths: Record<string, string | null> = { a: null, b: null, c: null, d: null }

    if (form.questionImage.value.file) {
      const uploadResult = await questionsStore.uploadQuestionImage(form.questionImage.value.file)
      if (uploadResult.path) {
        questionImagePath = uploadResult.path
      } else {
        console.error('Failed to upload question image:', uploadResult.error)
      }
    }

    if (formValues.type === 'mcq' || formValues.type === 'mrq') {
      for (const optionId of ['a', 'b', 'c', 'd'] as const) {
        const file = form.optionImages.value[optionId].file
        if (file) {
          const uploadResult = await questionsStore.uploadQuestionImage(file, optionId)
          if (uploadResult.path) {
            optionImagePaths[optionId] = uploadResult.path
          } else {
            console.error(`Failed to upload option ${optionId} image:`, uploadResult.error)
          }
        }
      }
    }

    // Compute image hash from File objects (no network fetch needed)
    const hasImages =
      questionImagePath || Object.values(optionImagePaths).some((path) => path !== null)
    let imageHash: string | null = null
    if (hasImages) {
      imageHash =
        (await computeQuestionImageHash({
          questionImage: form.questionImage.value.file,
          optionAImage: form.optionImages.value.a.file,
          optionBImage: form.optionImages.value.b.file,
          optionCImage: form.optionImages.value.c.file,
          optionDImage: form.optionImages.value.d.file,
        })) || null
    }

    // Create the question with image paths included
    const result = await questionsStore.addQuestion({
      type: formValues.type,
      question: formValues.question,
      imagePath: questionImagePath,
      subTopicId: props.subTopicId,
      gradeLevelId: hierarchy?.gradeLevel.id ?? null,
      subjectId: hierarchy?.subject.id ?? null,
      answer: formValues.type === 'short_answer' ? formValues.answer || null : null,
      imageHash,
      tagIds: form.selectedTagIds.value,
      options:
        formValues.type === 'mcq' || formValues.type === 'mrq'
          ? (formValues.options || []).map((opt) => ({
              ...opt,
              imagePath: optionImagePaths[opt.id] ?? null,
            }))
          : undefined,
    })

    if (result.error || !result.id) {
      toast.error(t.value.shared.questionAddDialog.toastFailed(result.error ?? ''))
      return
    }

    toast.success(t.value.shared.questionAddDialog.toastAdded)

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
        <DialogTitle>{{ t.shared.questionAddDialog.title }}</DialogTitle>
        <DialogDescription>{{ t.shared.questionAddDialog.description }}</DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="onSubmit">
        <QuestionFormFields :form="form" />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            :disabled="form.isSaving.value"
            @click="emit('update:open', false)"
          >
            {{ t.shared.questionAddDialog.cancel }}
          </Button>
          <Button type="submit" :disabled="form.isSaving.value">
            <Loader2 v-if="form.isSaving.value" class="mr-2 size-4 animate-spin" />
            {{ t.shared.questionAddDialog.addQuestion }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
