<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  useAssessmentsStore,
  type AdhocPayload,
  type AssessmentQuestionItem,
  type QuestionType,
} from '@/stores/assessments'
import { Loader2, Plus, X } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field'
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
const assessmentsStore = useAssessmentsStore()

const props = defineProps<{
  assessmentId: string
  /** Null → add mode; an ad-hoc item → edit mode. */
  editItem?: AssessmentQuestionItem | null
}>()

const open = defineModel<boolean>('open', { default: false })

interface OptionDraft {
  text: string
  isCorrect: boolean
}

const type = ref<QuestionType>('mcq')
const question = ref('')
const options = ref<OptionDraft[]>([])
const answer = ref('')
const explanation = ref('')
const validationError = ref<string | null>(null)
const isSaving = ref(false)

const isEdit = computed(() => Boolean(props.editItem))
const hasOptions = computed(() => type.value === 'mcq' || type.value === 'mrq')

function emptyOptions(): OptionDraft[] {
  return Array.from({ length: 4 }, () => ({ text: '', isCorrect: false }))
}

watch(open, (isOpen) => {
  if (!isOpen) return

  validationError.value = null

  const payload = props.editItem?.payload
  if (payload) {
    type.value = payload.type
    question.value = payload.question
    options.value =
      payload.options && payload.options.length > 0
        ? payload.options.map((option) => ({
            text: option.text,
            isCorrect: option.is_correct === true,
          }))
        : emptyOptions()
    answer.value = payload.answer ?? ''
    explanation.value = payload.explanation ?? ''
  } else {
    type.value = 'mcq'
    question.value = ''
    options.value = emptyOptions()
    answer.value = ''
    explanation.value = ''
  }
})

function onTypeChange(value: unknown) {
  type.value = value as QuestionType
  validationError.value = null
  if (type.value === 'mcq') {
    // MCQ allows exactly one correct option — keep the first marked one.
    let seen = false
    options.value = options.value.map((option) => {
      const keep = option.isCorrect && !seen
      if (option.isCorrect) seen = true
      return { ...option, isCorrect: keep }
    })
  }
}

function setCorrect(index: number, checked: boolean) {
  if (type.value === 'mcq' && checked) {
    options.value = options.value.map((option, i) => ({ ...option, isCorrect: i === index }))
    return
  }
  const option = options.value[index]
  if (option) option.isCorrect = checked
}

function addOption() {
  options.value.push({ text: '', isCorrect: false })
}

function removeOption(index: number) {
  options.value.splice(index, 1)
}

/**
 * Build the EXACT payload shape the DB grader reads (P3A-HANDOFF §2).
 * `is_correct` is forced to a real boolean — a string "true" grades wrong.
 */
function buildPayload(): { payload: AdhocPayload | null; error: string | null } {
  const text = question.value.trim()
  if (!text) return { payload: null, error: t.value.staff.adhocForm.validationQuestion }

  if (type.value === 'short_answer') {
    const key = answer.value.trim()
    if (!key) return { payload: null, error: t.value.staff.adhocForm.validationAnswer }
    const payload: AdhocPayload = { type: 'short_answer', question: text, answer: key }
    if (explanation.value.trim()) payload.explanation = explanation.value.trim()
    return { payload, error: null }
  }

  const kept = options.value
    .map((option) => ({ text: option.text.trim(), is_correct: option.isCorrect === true }))
    .filter((option) => option.text.length > 0)

  if (kept.length < 2) return { payload: null, error: t.value.staff.adhocForm.validationOptions }

  const correctCount = kept.filter((option) => option.is_correct).length
  if (type.value === 'mcq' && correctCount !== 1) {
    return { payload: null, error: t.value.staff.adhocForm.validationMcqOneCorrect }
  }
  if (type.value === 'mrq' && correctCount === 0) {
    return { payload: null, error: t.value.staff.adhocForm.validationMrqCorrect }
  }

  const payload: AdhocPayload = { type: type.value, question: text, options: kept }
  if (explanation.value.trim()) payload.explanation = explanation.value.trim()
  return { payload, error: null }
}

async function handleSave() {
  const { payload, error: buildError } = buildPayload()
  if (buildError || !payload) {
    validationError.value = buildError
    return
  }
  validationError.value = null

  isSaving.value = true
  try {
    const { error } = props.editItem
      ? await assessmentsStore.updateAdhocQuestion(props.editItem.id, payload)
      : await assessmentsStore.addAdhocQuestion(props.assessmentId, payload)

    if (error) {
      toast.error(error)
      return
    }

    toast.success(
      isEdit.value
        ? t.value.staff.builder.toastQuestionUpdated
        : t.value.staff.builder.toastQuestionAdded,
    )
    open.value = false
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{
          isEdit ? t.staff.adhocForm.editTitle : t.staff.adhocForm.addTitle
        }}</DialogTitle>
        <DialogDescription>{{ t.staff.adhocForm.description }}</DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-4">
        <!-- Type -->
        <Field>
          <FieldLabel>{{ t.staff.adhocForm.typeLabel }}</FieldLabel>
          <Select
            :key="languageStore.language"
            :model-value="type"
            :disabled="isSaving"
            @update:model-value="onTypeChange"
          >
            <SelectTrigger class="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mcq">{{
                t.shared.questionBankTable.typeMultipleChoice
              }}</SelectItem>
              <SelectItem value="mrq">{{
                t.shared.questionBankTable.typeMultipleResponse
              }}</SelectItem>
              <SelectItem value="short_answer">{{
                t.shared.questionBankTable.typeShortAnswer
              }}</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <!-- Question text -->
        <Field>
          <FieldLabel for="adhoc-question"
            >{{ t.staff.adhocForm.questionLabel }}
            <span class="text-destructive">*</span></FieldLabel
          >
          <Textarea
            id="adhoc-question"
            v-model="question"
            :placeholder="t.staff.adhocForm.questionPlaceholder"
            rows="3"
            :disabled="isSaving"
          />
        </Field>

        <!-- Options (mcq/mrq) -->
        <Field v-if="hasOptions">
          <FieldLabel
            >{{ t.staff.adhocForm.optionsLabel }}
            <span class="text-destructive">*</span></FieldLabel
          >
          <div class="space-y-2">
            <div v-for="(option, index) in options" :key="index" class="flex items-center gap-2">
              <label class="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                <Checkbox
                  :model-value="option.isCorrect"
                  :disabled="isSaving"
                  :aria-label="t.staff.adhocForm.correctLabel"
                  @update:model-value="(checked) => setCorrect(index, checked === true)"
                />
                <span class="sr-only sm:not-sr-only">{{ t.staff.adhocForm.correctLabel }}</span>
              </label>
              <Input
                v-model="option.text"
                :placeholder="t.staff.adhocForm.optionPlaceholder(index + 1)"
                :disabled="isSaving"
              />
              <Button
                variant="ghost"
                size="icon"
                class="size-8 shrink-0"
                :disabled="isSaving || options.length <= 2"
                :aria-label="t.staff.adhocForm.removeOption"
                @click="removeOption(index)"
              >
                <X class="size-4" />
              </Button>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="mt-1 w-fit"
            :disabled="isSaving"
            @click="addOption"
          >
            <Plus class="mr-2 size-4" />
            {{ t.staff.adhocForm.addOption }}
          </Button>
        </Field>

        <!-- Answer (short answer) -->
        <Field v-else>
          <FieldLabel for="adhoc-answer"
            >{{ t.staff.adhocForm.answerLabel }} <span class="text-destructive">*</span></FieldLabel
          >
          <Input
            id="adhoc-answer"
            v-model="answer"
            :placeholder="t.staff.adhocForm.answerPlaceholder"
            :disabled="isSaving"
          />
          <FieldDescription>{{ t.staff.adhocForm.answerHint }}</FieldDescription>
        </Field>

        <!-- Explanation -->
        <Field>
          <FieldLabel for="adhoc-explanation">{{ t.staff.adhocForm.explanationLabel }}</FieldLabel>
          <Textarea
            id="adhoc-explanation"
            v-model="explanation"
            :placeholder="t.staff.adhocForm.explanationPlaceholder"
            rows="2"
            :disabled="isSaving"
          />
        </Field>

        <FieldError :errors="validationError ? [validationError] : []" />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" :disabled="isSaving" @click="open = false">
          {{ t.staff.adhocForm.cancel }}
        </Button>
        <Button :disabled="isSaving" @click="handleSave">
          <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
          {{ isEdit ? t.staff.adhocForm.save : t.staff.adhocForm.add }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
