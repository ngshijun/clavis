<script setup lang="ts">
import { watch } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import type { Organization } from '@/stores/admin-organizations'
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

const props = defineProps<{
  organization: Organization | null
}>()

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
  if (!props.organization) return

  const { account, error } = await createUser({
    role: 'manager',
    name: values.name,
    email: values.email,
    password: values.password,
    organizationId: props.organization.id,
  })

  if (error || !account) {
    toast.error(error ?? '')
    return
  }

  toast.success(t.value.admin.managerForm.toastCreated(account.name))
  open.value = false
  emit('created')
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.admin.managerForm.title }}</DialogTitle>
        <DialogDescription>
          {{ t.admin.managerForm.description(organization?.name ?? '') }}
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="handleCreate">
        <VeeField v-slot="{ field, errors }" name="name">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="manager-name"
              >{{ t.admin.managerForm.nameLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="manager-name"
              :placeholder="t.admin.managerForm.namePlaceholder"
              :disabled="isSubmitting"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <VeeField v-slot="{ field, errors }" name="email">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="manager-email"
              >{{ t.admin.managerForm.emailLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="manager-email"
              type="email"
              autocomplete="off"
              :placeholder="t.admin.managerForm.emailPlaceholder"
              :disabled="isSubmitting"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <VeeField v-slot="{ field, errors }" name="password">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="manager-password"
              >{{ t.admin.managerForm.passwordLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="manager-password"
              autocomplete="off"
              :placeholder="t.admin.managerForm.passwordPlaceholder"
              :disabled="isSubmitting"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldDescription>{{ t.admin.managerForm.passwordHint }}</FieldDescription>
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isSubmitting" @click="open = false">
            {{ t.admin.managerForm.cancel }}
          </Button>
          <Button type="submit" :disabled="isSubmitting || !organization">
            <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
            {{ t.admin.managerForm.create }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
