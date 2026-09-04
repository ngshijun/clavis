<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAssessmentsStore, type GenerationLine } from '@/stores/assessments'
import { useCurriculumStore } from '@/stores/curriculum'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { Loader2, Sparkles } from 'lucide-vue-next'
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
import GenerationSpecEditor from '@/components/staff/GenerationSpecEditor.vue'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

/**
 * A teacher describes what they want; the system draws it from the admin
 * bank at random into a draft in the classroom (decision 90). The bank is
 * never shown — only the picks come back.
 */
const t = useT()
const assessmentsStore = useAssessmentsStore()
const curriculumStore = useCurriculumStore()
const { classroomId, classroom } = useActiveClassroom()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  generated: [id: string]
}>()

const title = ref('')
const lines = ref<GenerationLine[]>([])
const error = ref<string | null>(null)
const isGenerating = ref(false)

const topics = computed(() =>
  classroom.value ? (curriculumStore.getSubjectById(classroom.value.subjectId)?.topics ?? []) : [],
)

watch(open, (isOpen) => {
  if (!isOpen) return
  title.value = ''
  lines.value = [{ subTopicId: '', tagIds: [], difficulty: null, count: 5 }]
  error.value = null
  if (curriculumStore.gradeLevels.length === 0 && !curriculumStore.isLoading) {
    curriculumStore.fetchCurriculum()
  }
})

const isValid = computed(
  () =>
    title.value.trim() !== '' &&
    lines.value.length > 0 &&
    lines.value.every(
      (line) =>
        line.subTopicId !== '' &&
        Number.isInteger(line.count) &&
        line.count >= 1 &&
        line.count <= 50,
    ),
)

async function handleGenerate() {
  const targetClassroomId = classroomId.value
  if (!targetClassroomId || !isValid.value) {
    error.value = t.value.shared.errors.generateSpecInvalid
    return
  }
  error.value = null
  isGenerating.value = true
  try {
    const {
      id,
      shortfalls,
      error: rpcError,
    } = await assessmentsStore.generateAssessment({
      classroomId: targetClassroomId,
      title: title.value.trim(),
      lines: lines.value,
    })
    if (rpcError || !id) {
      toast.error(rpcError ?? '')
      return
    }
    if (shortfalls.length > 0) {
      const requested = lines.value.reduce((sum, line) => sum + line.count, 0)
      const missing = shortfalls.reduce((sum, s) => sum + (s.requested - s.picked), 0)
      toast.warning(t.value.staff.generate.toastShortfall(requested - missing, requested))
    } else {
      toast.success(t.value.staff.generate.toastGenerated)
    }
    open.value = false
    emit('generated', id)
  } finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t.staff.generate.title }}</DialogTitle>
        <DialogDescription>{{ t.staff.generate.desc }}</DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <Field>
          <FieldLabel for="generate-title"
            >{{ t.staff.assessmentCreate.titleLabel }}
            <span class="text-destructive">*</span></FieldLabel
          >
          <Input
            id="generate-title"
            v-model="title"
            :placeholder="t.staff.assessmentCreate.titlePlaceholder"
            :disabled="isGenerating"
          />
        </Field>

        <GenerationSpecEditor v-model="lines" :topics="topics" :disabled="isGenerating" />

        <FieldError :errors="error ? [error] : []" />
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="isGenerating" @click="open = false">
          {{ t.staff.assessmentCreate.cancel }}
        </Button>
        <Button :disabled="isGenerating || !isValid" @click="handleGenerate">
          <Loader2 v-if="isGenerating" class="mr-2 size-4 animate-spin" />
          <Sparkles v-else class="mr-2 size-4" />
          {{ t.staff.generate.generate }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
