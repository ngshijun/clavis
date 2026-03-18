<script setup lang="ts">
import { ref } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { useFeedbackStore } from '@/stores/feedback'
import { useAuthStore } from '@/stores/auth'
import { questionFeedbackFormSchema } from '@/lib/validations'
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
import type { Database } from '@/types/database.types'

type FeedbackCategory = Database['public']['Enums']['feedback_category']

const props = defineProps<{
  questionId: string
}>()

const open = defineModel<boolean>('open', { required: true })

const feedbackStore = useFeedbackStore()
const authStore = useAuthStore()

const isSubmitting = ref(false)

const feedbackCategories: { value: FeedbackCategory; label: string }[] = [
  { value: 'question_error', label: 'Question has an error' },
  { value: 'image_error', label: 'Image is incorrect or missing' },
  { value: 'option_error', label: 'Answer options are wrong' },
  { value: 'answer_error', label: 'Correct answer is wrong' },
  { value: 'explanation_error', label: 'Explanation is incorrect' },
  { value: 'other', label: 'Other' },
]

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
    toast.error('Failed to submit feedback', {
      description: result.error,
    })
    return
  }

  toast.success('Feedback submitted', {
    description: 'Thank you for helping us improve!',
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
        <DialogTitle>Report an Issue</DialogTitle>
        <DialogDescription>
          Let us know if there's something wrong with this question.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="onSubmit">
        <VeeField v-slot="{ handleChange, value, errors }" name="category">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="category"
              >Issue Type <span class="text-destructive">*</span></FieldLabel
            >
            <Select :model-value="value" @update:model-value="handleChange">
              <SelectTrigger
                id="category"
                :class="{ 'border-destructive': !!errors.length }"
                :aria-invalid="!!errors.length"
              >
                <SelectValue placeholder="Select an issue type" />
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
            <FieldLabel for="comments">Additional Details (optional)</FieldLabel>
            <Textarea
              id="comments"
              v-bind="field"
              placeholder="Describe the issue in more detail..."
              rows="3"
            />
          </Field>
        </VeeField>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="isSubmitting">
            {{ isSubmitting ? 'Submitting...' : 'Submit Feedback' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
