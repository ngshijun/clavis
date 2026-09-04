<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAssessmentTemplatesStore } from '@/stores/assessment-templates'
import type { GenerationLine } from '@/stores/assessments'
import { useCurriculumStore } from '@/stores/curriculum'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import GenerationSpecEditor from '@/components/staff/GenerationSpecEditor.vue'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

/** The admin's generator: the same spec, written as references into a new draft template. */
const t = useT()
const templatesStore = useAssessmentTemplatesStore()
const curriculumStore = useCurriculumStore()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  generated: [id: string]
}>()

const title = ref('')
const gradeLevelId = ref('')
const subjectId = ref('')
const lines = ref<GenerationLine[]>([])
const error = ref<string | null>(null)
const isGenerating = ref(false)

const subjects = computed(
  () =>
    curriculumStore.gradeLevels.find((grade) => grade.id === gradeLevelId.value)?.subjects ?? [],
)
const topics = computed(
  () => subjects.value.find((subject) => subject.id === subjectId.value)?.topics ?? [],
)

watch(open, (isOpen) => {
  if (!isOpen) return
  title.value = ''
  gradeLevelId.value = ''
  subjectId.value = ''
  lines.value = [{ subTopicId: '', tagIds: [], difficulty: null, count: 5 }]
  error.value = null
  if (curriculumStore.gradeLevels.length === 0 && !curriculumStore.isLoading) {
    curriculumStore.fetchCurriculum()
  }
})

// Changing the pairing invalidates every line's sub-topic.
watch(gradeLevelId, () => {
  subjectId.value = ''
})
watch(subjectId, () => {
  lines.value = lines.value.map((line) => ({ ...line, subTopicId: '' }))
})

const isValid = computed(
  () =>
    title.value.trim() !== '' &&
    gradeLevelId.value !== '' &&
    subjectId.value !== '' &&
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
  if (!isValid.value) {
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
    } = await templatesStore.generateTemplate({
      title: title.value.trim(),
      gradeLevelId: gradeLevelId.value,
      subjectId: subjectId.value,
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
      toast.success(t.value.staff.generate.toastTemplateGenerated)
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
        <DialogTitle>{{ t.staff.generate.templateTitle }}</DialogTitle>
        <DialogDescription>{{ t.staff.generate.templateDesc }}</DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <Field>
          <FieldLabel for="generate-template-title"
            >{{ t.staff.assessmentCreate.titleLabel }}
            <span class="text-destructive">*</span></FieldLabel
          >
          <Input
            id="generate-template-title"
            v-model="title"
            :placeholder="t.staff.assessmentCreate.titlePlaceholder"
            :disabled="isGenerating"
          />
        </Field>

        <div class="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel
              >{{ t.staff.assessmentCreate.gradeLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Select v-model="gradeLevelId" :disabled="isGenerating || curriculumStore.isLoading">
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t.staff.assessmentCreate.gradePlaceholder" />
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
          </Field>

          <Field>
            <FieldLabel
              >{{ t.staff.assessmentCreate.subjectLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Select v-model="subjectId" :disabled="isGenerating || !gradeLevelId">
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t.staff.assessmentCreate.subjectPlaceholder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="subject in subjects" :key="subject.id" :value="subject.id">
                  {{ subject.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <GenerationSpecEditor
          v-model="lines"
          :topics="topics"
          :disabled="isGenerating || !subjectId"
          allow-create-tags
        />

        <p class="text-sm text-muted-foreground">{{ t.staff.templates.scopeHint }}</p>

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
