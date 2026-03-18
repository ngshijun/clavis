<script setup lang="ts">
import { watch } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { editNameFormSchema } from '@/lib/validations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  currentName: string
  isSaving: boolean
}>()

const emit = defineEmits<{
  save: [name: string]
}>()

const open = defineModel<boolean>('open', { required: true })

const { handleSubmit, setValues } = useForm({
  validationSchema: editNameFormSchema,
  initialValues: { name: '' },
})

watch(open, (isOpen) => {
  if (isOpen) {
    setValues({ name: props.currentName })
  }
})

const onSubmit = handleSubmit((values) => {
  emit('save', values.name)
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit Name</DialogTitle>
        <DialogDescription>Enter your new display name.</DialogDescription>
      </DialogHeader>
      <form @submit="onSubmit">
        <VeeField v-slot="{ field, errors }" name="name">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="new-name">Name <span class="text-destructive">*</span></FieldLabel>
            <Input
              id="new-name"
              placeholder="Enter your name"
              :disabled="isSaving"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>
        <DialogFooter class="mt-4">
          <Button type="button" variant="outline" :disabled="isSaving" @click="open = false">
            Cancel
          </Button>
          <Button type="submit" :disabled="isSaving">
            <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
            Save
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
