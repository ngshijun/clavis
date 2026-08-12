<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { useAdminOrganizationsStore, type Organization } from '@/stores/admin-organizations'
import { organizationFormSchema } from '@/lib/validations'
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

const props = defineProps<{
  organization?: Organization | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  saved: []
}>()

const organizationsStore = useAdminOrganizationsStore()

const { handleSubmit, resetForm, setValues } = useForm({
  validationSchema: organizationFormSchema,
  initialValues: { name: '' },
})

const isSaving = ref(false)

watch(open, async (isOpen) => {
  if (!isOpen) return

  if (props.organization) {
    await nextTick()
    setValues({ name: props.organization.name })
  } else {
    resetForm()
  }
})

const handleSave = handleSubmit(async (values) => {
  isSaving.value = true

  try {
    const { error } = props.organization
      ? await organizationsStore.renameOrganization(props.organization.id, values.name)
      : await organizationsStore.createOrganization(values.name)

    if (error) {
      toast.error(error)
      return
    }

    toast.success(
      props.organization
        ? t.value.admin.organizations.toastRenamed
        : t.value.admin.organizations.toastCreated,
    )
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
          organization ? t.admin.organizationForm.renameTitle : t.admin.organizationForm.createTitle
        }}</DialogTitle>
        <DialogDescription>
          {{
            organization ? t.admin.organizationForm.renameDesc : t.admin.organizationForm.createDesc
          }}
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="handleSave">
        <VeeField v-slot="{ field, errors }" name="name">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="organization-name"
              >{{ t.admin.organizationForm.nameLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="organization-name"
              :placeholder="t.admin.organizationForm.namePlaceholder"
              :disabled="isSaving"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isSaving" @click="open = false">
            {{ t.admin.organizationForm.cancel }}
          </Button>
          <Button type="submit" :disabled="isSaving">
            <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
            {{ organization ? t.admin.organizationForm.save : t.admin.organizationForm.create }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
