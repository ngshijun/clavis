<script setup lang="ts">
import { watch } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { staffAccountFormSchema } from '@/lib/validations'
import { useCreateUser } from '@/composables/useCreateUser'
import { Loader2 } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldError, FieldDescription } from '@/components/ui/field'
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

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  created: []
}>()

const { isSubmitting, createUser } = useCreateUser()

const { handleSubmit, resetForm } = useForm({
  validationSchema: staffAccountFormSchema,
  initialValues: { name: '', email: '', password: '' },
})

watch(open, (isOpen) => {
  if (isOpen) resetForm()
})

const handleCreate = handleSubmit(async (values) => {
  const { account, error } = await createUser({
    role: 'teacher',
    name: values.name,
    email: values.email,
    password: values.password,
  })

  if (error || !account) {
    toast.error(error ?? '')
    return
  }

  toast.success(t.value.manager.teacherForm.toastCreated(account.name))
  open.value = false
  emit('created')
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.manager.teacherForm.title }}</DialogTitle>
        <DialogDescription>{{ t.manager.teacherForm.description }}</DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="handleCreate">
        <VeeField v-slot="{ field, errors }" name="name">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="teacher-name"
              >{{ t.manager.teacherForm.nameLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="teacher-name"
              :placeholder="t.manager.teacherForm.namePlaceholder"
              :disabled="isSubmitting"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <VeeField v-slot="{ field, errors }" name="email">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="teacher-email"
              >{{ t.manager.teacherForm.emailLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="teacher-email"
              type="email"
              autocomplete="off"
              :placeholder="t.manager.teacherForm.emailPlaceholder"
              :disabled="isSubmitting"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <VeeField v-slot="{ field, errors }" name="password">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="teacher-password"
              >{{ t.manager.teacherForm.passwordLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="teacher-password"
              autocomplete="off"
              :placeholder="t.manager.teacherForm.passwordPlaceholder"
              :disabled="isSubmitting"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldDescription>{{ t.manager.teacherForm.passwordHint }}</FieldDescription>
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isSubmitting" @click="open = false">
            {{ t.manager.teacherForm.cancel }}
          </Button>
          <Button type="submit" :disabled="isSubmitting">
            <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
            {{ t.manager.teacherForm.create }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
