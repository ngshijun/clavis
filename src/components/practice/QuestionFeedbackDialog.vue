<script setup lang="ts">
import { ref, computed } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { useFeedbackStore } from '@/stores/feedback'
import { useAuthStore } from '@/stores/auth'
import { questionFeedbackFormSchema, type QuestionFeedbackFormValues } from '@/lib/validations'
import { toast } from 'vue-sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useT } from '@/composables/useT'
import { useLanguageStore } from '@/stores/language'

const t = useT()
const languageStore = useLanguageStore()

// Only the categories the form still offers (decision 45 dropped explanation_error)
type FeedbackCategory = QuestionFeedbackFormValues['category']

const props = defineProps<{
  questionId: string
}>()

const open = defineModel<boolean>('open', { required: true })

const feedbackStore = useFeedbackStore()
const authStore = useAuthStore()

const isSubmitting = ref(false)

const feedbackCategories = computed<{ value: FeedbackCategory; label: string }[]>(() => [
  {
    value: 'question_error',
    label: t.value.shared.questionFeedbackDialog.categories.question_error,
  },
  { value: 'image_error', label: t.value.shared.questionFeedbackDialog.categories.image_error },
  { value: 'option_error', label: t.value.shared.questionFeedbackDialog.categories.option_error },
  { value: 'answer_error', label: t.value.shared.questionFeedbackDialog.categories.answer_error },
  // 'explanation_error' is deliberately NOT offered anymore (decision 45):
  // questions carry per-option tips now. The enum value stays in the DB and is
  // still rendered for legacy feedback rows.
  { value: 'other', label: t.value.shared.questionFeedbackDialog.categories.other },
])

const { handleSubmit, resetForm } = useForm({
  validationSchema: questionFeedbackFormSchema,
  initialValues: {
    category: undefined as FeedbackCategory | undefined,
    details: '',
  },
})

const onSubmit = handleSubmit(async (values) => {
  if (!authStore.user?.id) return

  isSubmitting.value = true

  const result = await feedbackStore.submitFeedback(
    props.questionId,
    values.category,
    values.details || '',
    authStore.user.id,
  )

  isSubmitting.value = false

  if (result.error) {
    toast.error(t.value.shared.questionFeedbackDialog.toastFailed, {
      description: result.error,
    })
    return
  }

  toast.success(t.value.shared.questionFeedbackDialog.toastSuccess, {
    description: t.value.shared.questionFeedbackDialog.toastSuccessDesc,
  })

  resetForm()
  open.value = false
})

function handleOpenChange(value: boolean) {
  if (!value) {
    resetForm()
  }
  open.value = value
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.shared.questionFeedbackDialog.title }}</DialogTitle>
        <DialogDescription>
          {{ t.shared.questionFeedbackDialog.description }}
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="onSubmit">
        <VeeField v-slot="{ handleChange, value, errors }" name="category">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="category"
              >{{ t.shared.questionFeedbackDialog.issueTypeLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Select
              :key="languageStore.language"
              :model-value="value"
              @update:model-value="handleChange"
            >
              <SelectTrigger
                id="category"
                :class="{ 'border-destructive': !!errors.length }"
                :aria-invalid="!!errors.length"
              >
                <SelectValue :placeholder="t.shared.questionFeedbackDialog.issueTypePlaceholder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="category in feedbackCategories"
                  :key="category.value"
                  :value="category.value"
                >
                  {{ category.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <VeeField v-slot="{ field }" name="details">
          <Field>
            <FieldLabel for="comments">{{
              t.shared.questionFeedbackDialog.additionalDetails
            }}</FieldLabel>
            <Textarea
              id="comments"
              v-bind="field"
              :placeholder="t.shared.questionFeedbackDialog.additionalDetailsPlaceholder"
              rows="3"
            />
          </Field>
        </VeeField>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">{{
            t.shared.questionFeedbackDialog.cancel
          }}</Button>
          <Button type="submit" :disabled="isSubmitting">
            {{
              isSubmitting
                ? t.shared.questionFeedbackDialog.submitting
                : t.shared.questionFeedbackDialog.submitFeedback
            }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
