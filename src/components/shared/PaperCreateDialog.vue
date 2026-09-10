<script setup lang="ts">
import { ref, watch } from 'vue'
import { usePapersStore } from '@/stores/papers'
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

/**
 * A paper is born with nothing but a title. It has no stored grade or subject
 * — those follow from the items it ends up holding (decision 91) — so there is
 * nothing else to decide here.
 */
const t = useT()
const papersStore = usePapersStore()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  created: [id: string]
}>()

const title = ref('')
const error = ref<string | null>(null)
const isSaving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  title.value = ''
  error.value = null
})

async function handleCreate() {
  const trimmed = title.value.trim()
  if (!trimmed) {
    error.value = t.value.staff.builder.validationTitle
    return
  }
  error.value = null
  isSaving.value = true
  try {
    const { id, error: createError } = await papersStore.createPaper(trimmed)
    if (createError || !id) {
      toast.error(createError ?? '')
      return
    }
    open.value = false
    emit('created', id)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.staff.papers.createTitle }}</DialogTitle>
        <DialogDescription>{{ t.staff.papers.createDesc }}</DialogDescription>
      </DialogHeader>

      <Field>
        <FieldLabel for="paper-create-title"
          >{{ t.staff.assessmentCreate.titleLabel }}
          <span class="text-destructive">*</span></FieldLabel
        >
        <Input
          id="paper-create-title"
          v-model="title"
          :placeholder="t.staff.assessmentCreate.titlePlaceholder"
          :disabled="isSaving"
          @keyup.enter="handleCreate"
        />
        <FieldError :errors="error ? [error] : []" />
      </Field>

      <DialogFooter>
        <Button variant="outline" :disabled="isSaving" @click="open = false">
          {{ t.staff.assessmentCreate.cancel }}
        </Button>
        <Button :disabled="isSaving" @click="handleCreate">
          <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
          {{ t.staff.papers.createConfirm }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
