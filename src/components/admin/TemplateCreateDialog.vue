<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { assessmentTemplateCreateFormSchema } from '@/lib/validations'
import { useAssessmentTemplatesStore } from '@/stores/assessment-templates'
import { useCurriculumStore } from '@/stores/curriculum'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

/**
 * A template is born with its grade+subject pairing and keeps it for life:
 * the pairing decides which centers can see it AND which bank questions it
 * may hold, so it cannot change once questions reference it.
 */
const t = useT()
const templatesStore = useAssessmentTemplatesStore()
const curriculumStore = useCurriculumStore()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  created: [id: string]
}>()

const isSaving = ref(false)

const { handleSubmit, resetForm, setFieldValue, values } = useForm({
  validationSchema: assessmentTemplateCreateFormSchema,
  initialValues: { title: '', gradeLevelId: '', subjectId: '' },
})

// Cascading selectors: subjects belong to the selected grade level.
const subjects = computed(
  () =>
    curriculumStore.gradeLevels.find((grade) => grade.id === values.gradeLevelId)?.subjects ?? [],
)

function handleGradeChange(gradeLevelId: unknown) {
  setFieldValue('gradeLevelId', String(gradeLevelId ?? ''))
  setFieldValue('subjectId', '')
}

watch(open, (isOpen) => {
  if (!isOpen) return
  resetForm()
  if (curriculumStore.gradeLevels.length === 0 && !curriculumStore.isLoading) {
    curriculumStore.fetchCurriculum()
  }
})

const handleCreate = handleSubmit(async (formValues) => {
  isSaving.value = true
  try {
    const { id, error } = await templatesStore.createTemplate({
      title: formValues.title,
      gradeLevelId: formValues.gradeLevelId,
      subjectId: formValues.subjectId,
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
        <DialogTitle>{{ t.staff.templates.createTitle }}</DialogTitle>
        <DialogDescription>{{ t.staff.templates.createDesc }}</DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="handleCreate">
        <VeeField v-slot="{ field, errors }" name="title">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="template-title"
              >{{ t.staff.assessmentCreate.titleLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="template-title"
              :placeholder="t.staff.assessmentCreate.titlePlaceholder"
              :disabled="isSaving"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <VeeField v-slot="{ value, errors }" name="gradeLevelId">
          <Field :data-invalid="!!errors.length">
            <FieldLabel
              >{{ t.staff.assessmentCreate.gradeLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Select
              :model-value="value"
              :disabled="isSaving || curriculumStore.isLoading"
              @update:model-value="handleGradeChange"
            >
              <SelectTrigger class="w-full" :class="{ 'border-destructive': !!errors.length }">
                <SelectValue :placeholder="t.staff.assessmentCreate.gradePlaceholder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="gradeLevel in curriculumStore.gradeLevels"
                  :key="gradeLevel.id"
                  :value="gradeLevel.id"
                >
                  {{ gradeLevel.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <VeeField v-slot="{ value, handleChange, errors }" name="subjectId">
          <Field :data-invalid="!!errors.length">
            <FieldLabel
              >{{ t.staff.assessmentCreate.subjectLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Select
              :model-value="value"
              :disabled="isSaving || !values.gradeLevelId"
              @update:model-value="handleChange"
            >
              <SelectTrigger class="w-full" :class="{ 'border-destructive': !!errors.length }">
                <SelectValue :placeholder="t.staff.assessmentCreate.subjectPlaceholder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="subject in subjects" :key="subject.id" :value="subject.id">
                  {{ subject.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <p class="text-sm text-muted-foreground">{{ t.staff.templates.scopeHint }}</p>

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
