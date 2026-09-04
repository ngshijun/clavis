<script setup lang="ts">
import { ref, watch } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { assessmentCreateFormSchema } from '@/lib/validations'
import { useAssessmentsStore } from '@/stores/assessments'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { Loader2 } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

const t = useT()
const assessmentsStore = useAssessmentsStore()
const { classroomId } = useActiveClassroom()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  created: [id: string]
}>()

const isSaving = ref(false)

const { handleSubmit, resetForm } = useForm({
  validationSchema: assessmentCreateFormSchema,
  initialValues: { title: '' },
})

watch(open, (isOpen) => {
  if (isOpen) resetForm()
})

/** An assessment is born into the classroom in the URL (decision 81). */
const handleCreate = handleSubmit(async (formValues) => {
  const targetClassroomId = classroomId.value
  if (!targetClassroomId) return

  isSaving.value = true
  try {
    const { id, error } = await assessmentsStore.createAssessment({
      title: formValues.title,
      classroomId: targetClassroomId,
    })

    if (error || !id) {
      toast.error(error ?? '')
      return
    }

    open.value = false
    emit('created', id)
  } finally {
    isSaving.value = false
  }
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.staff.assessmentCreate.title }}</DialogTitle>
        <DialogDescription>{{ t.staff.assessmentCreate.description }}</DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="handleCreate">
        <VeeField v-slot="{ field, errors }" name="title">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="assessment-title"
              >{{ t.staff.assessmentCreate.titleLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="assessment-title"
              :placeholder="t.staff.assessmentCreate.titlePlaceholder"
              :disabled="isSaving"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isSaving" @click="open = false">
            {{ t.staff.assessmentCreate.cancel }}
          </Button>
          <Button type="submit" :disabled="isSaving">
            <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
            {{ t.staff.assessmentCreate.create }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
