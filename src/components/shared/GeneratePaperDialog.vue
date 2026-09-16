<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePapersStore } from '@/stores/papers'
import {
  emptyGenerationLine,
  isGenerationLineValid,
  type GenerationLine,
} from '@/lib/generationSpec'
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

/**
 * The generator (decision 91): a spec in, a draft PAPER out — the platform's
 * for an admin, the caller's center's for a teacher. The grade and subject
 * here only scope the sub-topics on offer; the paper stores the spec, not the
 * pairing, and the RPC rejects a spec that spans two subjects. Inside a
 * classroom the pairing is the classroom's and there is nothing to pick: a
 * paper for any other pairing could not be delivered or listed there.
 */
const t = useT()
const papersStore = usePapersStore()
const curriculumStore = useCurriculumStore()
const { classroom } = useActiveClassroom()

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
  gradeLevelId.value = classroom.value?.gradeLevelId ?? ''
  subjectId.value = classroom.value?.subjectId ?? ''
  lines.value = [emptyGenerationLine()]
  error.value = null
  if (curriculumStore.gradeLevels.length === 0 && !curriculumStore.isLoading) {
    curriculumStore.fetchCurriculum()
  }
})

// Changing the pairing invalidates every line's sub-topic. Handled on the
// user's pick, not a watcher, so seeding both ids on open doesn't clear them.
function clearLineScopes() {
  lines.value = lines.value.map((line) => ({ ...line, subTopicIds: [], tagIds: [] }))
}
function selectGradeLevel(id: string) {
  gradeLevelId.value = id
  subjectId.value = ''
  clearLineScopes()
}
function selectSubject(id: string) {
  subjectId.value = id
  clearLineScopes()
}

const isValid = computed(
  () =>
    title.value.trim() !== '' &&
    gradeLevelId.value !== '' &&
    subjectId.value !== '' &&
    lines.value.length > 0 &&
    lines.value.every(isGenerationLineValid),
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
    } = await papersStore.generatePaper({
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
      toast.success(t.value.staff.generate.toastPaperGenerated)
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
        <DialogTitle>{{ t.staff.generate.paperTitle }}</DialogTitle>
        <DialogDescription>{{ t.staff.generate.paperDesc }}</DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <Field>
          <FieldLabel for="generate-paper-title"
            >{{ t.staff.assessmentCreate.titleLabel }}
            <span class="text-destructive">*</span></FieldLabel
          >
          <Input
            id="generate-paper-title"
            v-model="title"
            :placeholder="t.staff.assessmentCreate.titlePlaceholder"
            :disabled="isGenerating"
          />
        </Field>

        <div v-if="!classroom" class="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel
              >{{ t.staff.assessmentCreate.gradeLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Select
              :model-value="gradeLevelId"
              :disabled="isGenerating || curriculumStore.isLoading"
              @update:model-value="(id) => selectGradeLevel(String(id))"
            >
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
            <Select
              :model-value="subjectId"
              :disabled="isGenerating || !gradeLevelId"
              @update:model-value="(id) => selectSubject(String(id))"
            >
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
