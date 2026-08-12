<script setup lang="ts">
import { watch, computed } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { classroomFormSchema } from '@/lib/validations'
import { useClassroomsStore, type ClassroomListItem } from '@/stores/classrooms'
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

const t = useT()
const classroomsStore = useClassroomsStore()
const curriculumStore = useCurriculumStore()

const props = defineProps<{
  /** Null → create mode; a classroom → edit mode. */
  classroom?: ClassroomListItem | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  saved: []
}>()

const isEdit = computed(() => Boolean(props.classroom))

const { handleSubmit, resetForm, setValues, setFieldValue, values, isSubmitting } = useForm({
  validationSchema: classroomFormSchema,
  initialValues: { name: '', gradeLevelId: '', subjectId: '' },
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

  if (props.classroom) {
    setValues({
      name: props.classroom.name,
      gradeLevelId: props.classroom.gradeLevelId,
      subjectId: props.classroom.subjectId,
    })
  } else {
    resetForm()
  }

  if (curriculumStore.gradeLevels.length === 0 && !curriculumStore.isLoading) {
    curriculumStore.fetchCurriculum()
  }
})

const handleSave = handleSubmit(async (formValues) => {
  const input = {
    name: formValues.name,
    gradeLevelId: formValues.gradeLevelId,
    subjectId: formValues.subjectId,
  }

  const { error } = props.classroom
    ? await classroomsStore.updateClassroom(props.classroom.id, input)
    : await classroomsStore.createClassroom(input)

  if (error) {
    toast.error(error)
    return
  }

  toast.success(
    props.classroom
      ? t.value.staff.classroomForm.toastUpdated
      : t.value.staff.classroomForm.toastCreated,
  )
  open.value = false
  emit('saved')
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{
          isEdit ? t.staff.classroomForm.editTitle : t.staff.classroomForm.createTitle
        }}</DialogTitle>
        <DialogDescription>{{
          isEdit ? t.staff.classroomForm.editDesc : t.staff.classroomForm.createDesc
        }}</DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="handleSave">
        <VeeField v-slot="{ value, errors }" name="gradeLevelId">
          <Field :data-invalid="!!errors.length">
            <FieldLabel
              >{{ t.staff.classroomForm.gradeLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Select
              :model-value="value"
              :disabled="isSubmitting || curriculumStore.isLoading"
              @update:model-value="handleGradeChange"
            >
              <SelectTrigger class="w-full" :class="{ 'border-destructive': !!errors.length }">
                <SelectValue :placeholder="t.staff.classroomForm.gradePlaceholder" />
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
              >{{ t.staff.classroomForm.subjectLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Select
              :model-value="value"
              :disabled="isSubmitting || !values.gradeLevelId"
              @update:model-value="handleChange"
            >
              <SelectTrigger class="w-full" :class="{ 'border-destructive': !!errors.length }">
                <SelectValue :placeholder="t.staff.classroomForm.subjectPlaceholder" />
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

        <VeeField v-slot="{ field, errors }" name="name">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="classroom-name"
              >{{ t.staff.classroomForm.nameLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="classroom-name"
              :placeholder="t.staff.classroomForm.namePlaceholder"
              :disabled="isSubmitting"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isSubmitting" @click="open = false">
            {{ t.staff.classroomForm.cancel }}
          </Button>
          <Button type="submit" :disabled="isSubmitting">
            <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
            {{ isEdit ? t.staff.classroomForm.save : t.staff.classroomForm.create }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
