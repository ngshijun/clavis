<script setup lang="ts">
import { watch } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { studentAccountFormSchema } from '@/lib/validations'
import { useCreateUser, type CreatedAccount } from '@/composables/useCreateUser'
import { useCurriculumStore } from '@/stores/curriculum'
import { generatePassword } from '@/lib/credentials'
import { Loader2, RefreshCw } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldError, FieldDescription } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
const curriculumStore = useCurriculumStore()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  created: [account: CreatedAccount]
}>()

const { isSubmitting, createUser } = useCreateUser()

const { handleSubmit, resetForm, setFieldValue } = useForm({
  validationSchema: studentAccountFormSchema,
  initialValues: { name: '', username: '', password: '', gradeLevelId: '' },
})

watch(open, (isOpen) => {
  if (!isOpen) return
  resetForm()
  if (curriculumStore.gradeLevels.length === 0 && !curriculumStore.isLoading) {
    curriculumStore.fetchCurriculum()
  }
})

function fillGeneratedPassword() {
  setFieldValue('password', generatePassword())
}

const handleCreate = handleSubmit(async (values) => {
  const { account, error } = await createUser({
    role: 'student',
    name: values.name,
    username: values.username,
    password: values.password,
    gradeLevelId: values.gradeLevelId,
  })

  if (error || !account) {
    toast.error(error ?? '')
    return
  }

  open.value = false
  emit('created', account)
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.teacher.studentForm.title }}</DialogTitle>
        <DialogDescription>{{ t.teacher.studentForm.description }}</DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="handleCreate">
        <VeeField v-slot="{ field, errors }" name="name">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="student-name"
              >{{ t.teacher.studentForm.nameLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="student-name"
              :placeholder="t.teacher.studentForm.namePlaceholder"
              :disabled="isSubmitting"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <VeeField v-slot="{ field, errors }" name="username">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="student-username"
              >{{ t.teacher.studentForm.usernameLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="student-username"
              autocomplete="off"
              :placeholder="t.teacher.studentForm.usernamePlaceholder"
              :disabled="isSubmitting"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldDescription>{{ t.teacher.studentForm.usernameHint }}</FieldDescription>
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <VeeField v-slot="{ field, errors }" name="password">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="student-password"
              >{{ t.teacher.studentForm.passwordLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <div class="flex items-center gap-2">
              <Input
                id="student-password"
                autocomplete="off"
                class="flex-1"
                :placeholder="t.teacher.studentForm.passwordPlaceholder"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                v-bind="field"
              />
              <Button
                type="button"
                variant="outline"
                class="shrink-0"
                :disabled="isSubmitting"
                @click="fillGeneratedPassword"
              >
                <RefreshCw class="mr-2 size-4" />
                {{ t.teacher.studentForm.generate }}
              </Button>
            </div>
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <VeeField v-slot="{ handleChange, value, errors }" name="gradeLevelId">
          <Field :data-invalid="!!errors.length">
            <FieldLabel
              >{{ t.teacher.studentForm.gradeLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Select
              :model-value="value"
              :disabled="isSubmitting || curriculumStore.isLoading"
              @update:model-value="handleChange"
            >
              <SelectTrigger class="w-full" :class="{ 'border-destructive': !!errors.length }">
                <SelectValue :placeholder="t.teacher.studentForm.gradePlaceholder" />
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

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isSubmitting" @click="open = false">
            {{ t.teacher.studentForm.cancel }}
          </Button>
          <Button type="submit" :disabled="isSubmitting">
            <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
            {{ t.teacher.studentForm.create }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
