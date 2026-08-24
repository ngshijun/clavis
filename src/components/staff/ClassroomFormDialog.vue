<script setup lang="ts">
import { watch, computed, ref } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { classroomFormSchema } from '@/lib/validations'
import { useClassroomsStore, type ClassroomListItem } from '@/stores/classrooms'
import { useCurriculumStore } from '@/stores/curriculum'
import { ImagePlus, Loader2, X } from 'lucide-vue-next'
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
import { createBucketImageHelpers, removeStorageObjects, uploadStorageFile } from '@/lib/storage'
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

const { getImageUrl: getClassroomImageUrl } = createBucketImageHelpers('classroom-images')

/**
 * The cover is picked here but uploaded on save: a new classroom has no id
 * yet, and `classroom-images` keys write permission off `{classroom_id}/…`.
 * Holding the File until the row exists keeps one code path for both modes.
 */
const pendingCover = ref<File | null>(null)
const pendingPreview = ref<string | null>(null)
/** The stored path as the form currently intends it — null means "clear it". */
const coverPath = ref<string | null>(null)
const isUploadingCover = ref(false)

const coverPreview = computed(() => {
  if (pendingPreview.value) return pendingPreview.value
  return coverPath.value ? getClassroomImageUrl(coverPath.value) : ''
})

function onCoverPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value)
  pendingCover.value = file
  pendingPreview.value = URL.createObjectURL(file)
}

function clearCover() {
  if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value)
  pendingCover.value = null
  pendingPreview.value = null
  coverPath.value = null
}

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

  if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value)
  pendingCover.value = null
  pendingPreview.value = null

  if (props.classroom) {
    setValues({
      name: props.classroom.name,
      gradeLevelId: props.classroom.gradeLevelId,
      subjectId: props.classroom.subjectId,
    })
    coverPath.value = props.classroom.coverImagePath
  } else {
    resetForm()
    coverPath.value = null
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

  const previousCover = props.classroom?.coverImagePath ?? null

  // Create first (the upload path needs the id), then edit and update rewrite
  // the cover the same way.
  let classroomId = props.classroom?.id ?? null
  if (!classroomId) {
    const created = await classroomsStore.createClassroom(input)
    if (created.error || !created.id) {
      toast.error(created.error ?? '')
      return
    }
    classroomId = created.id
  }

  let nextCover = coverPath.value
  if (pendingCover.value) {
    isUploadingCover.value = true
    const { path, error: uploadError } = await uploadStorageFile(
      'classroom-images',
      pendingCover.value,
      { folder: classroomId },
    )
    isUploadingCover.value = false
    if (uploadError || !path) {
      toast.error(uploadError ?? '')
      return
    }
    nextCover = path
  }

  const { error } = await classroomsStore.updateClassroom(classroomId, {
    ...input,
    coverImagePath: nextCover,
  })

  if (error) {
    toast.error(error)
    return
  }

  // Only after the row no longer references it (decision 78's rule, applied
  // here too) is the replaced object safe to delete.
  if (previousCover && previousCover !== nextCover) {
    void removeStorageObjects('classroom-images', [previousCover])
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

        <!-- Cover: what tells two same-grade, same-subject classes apart on
             the picker cards. Optional — the cards fall back to a tint. -->
        <Field>
          <FieldLabel>{{ t.staff.classroomForm.coverLabel }}</FieldLabel>
          <div v-if="coverPreview" class="relative overflow-hidden rounded-md border bg-muted">
            <img :src="coverPreview" alt="" class="h-28 w-full object-cover" />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              class="absolute right-2 top-2 size-7"
              :aria-label="t.staff.classroomForm.coverRemove"
              @click="clearCover"
            >
              <X class="size-4" />
            </Button>
          </div>
          <label
            v-else
            class="flex h-28 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            <ImagePlus class="size-4" />
            {{ t.staff.classroomForm.coverAdd }}
            <input type="file" accept="image/*" class="hidden" @change="onCoverPicked" />
          </label>
        </Field>

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
