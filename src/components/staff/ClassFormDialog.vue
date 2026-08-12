<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { classFormSchema } from '@/lib/validations'
import { useClassesStore, type ClassListItem } from '@/stores/classes'
import { useManagerTeachersStore } from '@/stores/manager-teachers'
import { useAuthStore } from '@/stores/auth'
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
import { useLanguageStore } from '@/stores/language'

const t = useT()
const languageStore = useLanguageStore()
const authStore = useAuthStore()
const classesStore = useClassesStore()
const teachersStore = useManagerTeachersStore()

const props = defineProps<{
  /** Null → create mode; a class → rename mode. */
  classItem?: ClassListItem | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  saved: []
}>()

const isSaving = ref(false)
const teacherId = ref<string>('')
const teacherMissing = ref(false)

const isRename = computed(() => Boolean(props.classItem))
// A manager creates classes on behalf of a teacher; teachers own their own.
const needsTeacherPick = computed(() => authStore.isManager && !isRename.value)

const { handleSubmit, resetForm, setValues } = useForm({
  validationSchema: classFormSchema,
  initialValues: { name: '' },
})

watch(open, async (isOpen) => {
  if (!isOpen) return

  teacherId.value = ''
  teacherMissing.value = false

  if (props.classItem) {
    setValues({ name: props.classItem.name })
  } else {
    resetForm()
  }

  if (needsTeacherPick.value && teachersStore.teachers.length === 0 && !teachersStore.isLoading) {
    await teachersStore.fetchTeachers()
  }
})

const handleSave = handleSubmit(async (values) => {
  if (needsTeacherPick.value && !teacherId.value) {
    teacherMissing.value = true
    return
  }

  isSaving.value = true
  try {
    if (props.classItem) {
      const { error } = await classesStore.renameClass(props.classItem.id, values.name)
      if (error) {
        toast.error(error)
        return
      }
      toast.success(t.value.staff.classes.toastRenamed)
    } else {
      const { error } = await classesStore.createClass(values.name, teacherId.value || undefined)
      if (error) {
        toast.error(error)
        return
      }
      toast.success(t.value.staff.classes.toastCreated)
    }

    open.value = false
    emit('saved')
  } finally {
    isSaving.value = false
  }
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{
          isRename ? t.staff.classForm.renameTitle : t.staff.classForm.createTitle
        }}</DialogTitle>
        <DialogDescription>{{
          isRename ? t.staff.classForm.renameDesc : t.staff.classForm.createDesc
        }}</DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="handleSave">
        <VeeField v-slot="{ field, errors }" name="name">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="class-name"
              >{{ t.staff.classForm.nameLabel }} <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="class-name"
              :placeholder="t.staff.classForm.namePlaceholder"
              :disabled="isSaving"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <Field v-if="needsTeacherPick" :data-invalid="teacherMissing">
          <FieldLabel
            >{{ t.staff.classForm.teacherLabel }}
            <span class="text-destructive">*</span></FieldLabel
          >
          <Select
            :key="languageStore.language"
            v-model="teacherId"
            :disabled="isSaving"
            @update:model-value="teacherMissing = false"
          >
            <SelectTrigger class="w-full" :class="{ 'border-destructive': teacherMissing }">
              <SelectValue :placeholder="t.staff.classForm.teacherPlaceholder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="teacher in teachersStore.teachers"
                :key="teacher.id"
                :value="teacher.id"
              >
                {{ teacher.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <FieldError :errors="teacherMissing ? [t.staff.classForm.teacherPlaceholder] : []" />
        </Field>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isSaving" @click="open = false">
            {{ t.staff.classForm.cancel }}
          </Button>
          <Button type="submit" :disabled="isSaving">
            <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
            {{ isRename ? t.staff.classForm.save : t.staff.classForm.create }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
