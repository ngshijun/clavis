<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useAssessmentsStore, type AssessmentQuestionItem } from '@/stores/assessments'
import {
  buildAdhocPayload,
  emptyAdhocDraft,
  parseClozeIndices,
  payloadToDraft,
  type AdhocDraft,
  type AdhocQuestionType,
  type AdhocValidationCode,
} from '@/lib/adhocPayload'
import { GripVertical, Loader2, Plus, X } from 'lucide-vue-next'
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

const QUESTION_TYPES: AdhocQuestionType[] = [
  'mcq',
  'mrq',
  'true_false',
  'numeric',
  'short_answer',
  'cloze',
  'matching',
  'ordering',
  'long_answer',
]

const draft = ref<AdhocDraft>(emptyAdhocDraft())
/** Ordering rows carry a stable uid so dragging never keys off the index. */
const orderingRows = ref<{ uid: number; text: string }[]>([])
let nextUid = 1

const validationError = ref<string | null>(null)
const isSaving = ref(false)

const isEdit = computed(() => Boolean(props.editItem))
const type = computed(() => draft.value.type)

/** The `{{n}}` placeholders currently present in the cloze text. */
const clozeIndices = computed(() => parseClozeIndices(draft.value.clozeText))

/** Right-side rows with text — what a prompt can be matched against. */
const matchTargets = computed(() =>
  draft.value.matchingRight
    .map((text, index) => ({ index, text: text.trim() }))
    .filter((target) => target.text.length > 0),
)

function orderingRow(text: string): { uid: number; text: string } {
  return { uid: nextUid++, text }
}

function resetForm() {
  validationError.value = null
  const payload = props.editItem?.payload
  draft.value = payload ? payloadToDraft(payload) : emptyAdhocDraft()
  orderingRows.value = draft.value.orderingItems.map(orderingRow)
}

watch(open, (isOpen) => {
  if (isOpen) resetForm()
})

function onTypeChange(value: unknown) {
  draft.value.type = value as AdhocQuestionType
  validationError.value = null
  if (draft.value.type === 'mcq') {
    // MCQ allows exactly one correct option — keep the first marked one.
    let seen = false
    draft.value.options = draft.value.options.map((option) => {
      const keep = option.isCorrect && !seen
      if (option.isCorrect) seen = true
      return { ...option, isCorrect: keep }
    })
  }
}

// ── mcq / mrq ──────────────────────────────────────────────

function setCorrect(index: number, checked: boolean) {
  if (draft.value.type === 'mcq' && checked) {
    draft.value.options = draft.value.options.map((option, i) => ({
      ...option,
      isCorrect: i === index,
    }))
    return
  }
  const option = draft.value.options[index]
  if (option) option.isCorrect = checked
}

// ── matching ───────────────────────────────────────────────

function setMatch(leftIndex: number, value: unknown) {
  const row = draft.value.matchingLeft[leftIndex]
  if (row) row.rightIndex = value === '' || value === null ? null : Number(value)
}

function removeRightItem(index: number) {
  draft.value.matchingRight.splice(index, 1)
  // Re-anchor prompt matches to the shifted indices.
  for (const row of draft.value.matchingLeft) {
    if (row.rightIndex === null) continue
    if (row.rightIndex === index) row.rightIndex = null
    else if (row.rightIndex > index) row.rightIndex -= 1
  }
}

// ── save ───────────────────────────────────────────────────

const VALIDATION_MESSAGES: Record<AdhocValidationCode, () => string> = {
  questionRequired: () => t.value.staff.adhocForm.validationQuestion,
  optionsMin: () => t.value.staff.adhocForm.validationOptions,
  mcqOneCorrect: () => t.value.staff.adhocForm.validationMcqOneCorrect,
  mrqCorrect: () => t.value.staff.adhocForm.validationMrqCorrect,
  answersRequired: () => t.value.staff.adhocForm.validationAnswers,
  numericAnswerRequired: () => t.value.staff.adhocForm.validationNumericAnswer,
  toleranceInvalid: () => t.value.staff.adhocForm.validationTolerance,
  clozeTextRequired: () => t.value.staff.adhocForm.validationClozeText,
  clozeNoBlanks: () => t.value.staff.adhocForm.validationClozeNoBlanks,
  clozeBlankAnswersRequired: () => t.value.staff.adhocForm.validationClozeBlankAnswers,
  matchingItemsRequired: () => t.value.staff.adhocForm.validationMatchingItems,
  matchingPairsRequired: () => t.value.staff.adhocForm.validationMatchingPairs,
  orderingItemsRequired: () => t.value.staff.adhocForm.validationOrderingItems,
}

async function handleSave() {
  draft.value.orderingItems = orderingRows.value.map((row) => row.text)
  const { payload, error: buildError } = buildAdhocPayload(draft.value)
  if (buildError || !payload) {
    validationError.value = buildError ? VALIDATION_MESSAGES[buildError]() : null
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
              <SelectItem
                v-for="questionType in QUESTION_TYPES"
                :key="questionType"
                :value="questionType"
              >
                {{ t.shared.questionTypes[questionType] }}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <!-- Question text (optional instructions for cloze) -->
        <Field>
          <FieldLabel for="adhoc-question">
            {{
              type === 'cloze'
                ? t.staff.adhocForm.clozePromptLabel
                : t.staff.adhocForm.questionLabel
            }}
            <span v-if="type !== 'cloze'" class="text-destructive">*</span>
          </FieldLabel>
          <Textarea
            id="adhoc-question"
            v-model="draft.question"
            :placeholder="t.staff.adhocForm.questionPlaceholder"
            rows="3"
            :disabled="isSaving"
          />
        </Field>

        <!-- Options (mcq/mrq) -->
        <Field v-if="type === 'mcq' || type === 'mrq'">
          <FieldLabel
            >{{ t.staff.adhocForm.optionsLabel }}
            <span class="text-destructive">*</span></FieldLabel
          >
          <div class="space-y-2">
            <div
              v-for="(option, index) in draft.options"
              :key="index"
              class="flex items-center gap-2"
            >
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
                :disabled="isSaving || draft.options.length <= 2"
                :aria-label="t.staff.adhocForm.removeOption"
                @click="draft.options.splice(index, 1)"
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
            @click="draft.options.push({ text: '', isCorrect: false })"
          >
            <Plus class="mr-2 size-4" />
            {{ t.staff.adhocForm.addOption }}
          </Button>
          <FieldDescription v-if="type === 'mrq'">{{
            t.staff.adhocForm.mrqPartialHint
          }}</FieldDescription>
        </Field>

        <!-- True / False -->
        <Field v-else-if="type === 'true_false'">
          <FieldLabel>{{ t.staff.adhocForm.trueFalseLabel }}</FieldLabel>
          <div class="flex gap-2">
            <Button
              type="button"
              :variant="draft.trueFalseAnswer ? 'default' : 'outline'"
              :disabled="isSaving"
              @click="draft.trueFalseAnswer = true"
            >
              {{ t.staff.adhocForm.trueOption }}
            </Button>
            <Button
              type="button"
              :variant="!draft.trueFalseAnswer ? 'default' : 'outline'"
              :disabled="isSaving"
              @click="draft.trueFalseAnswer = false"
            >
              {{ t.staff.adhocForm.falseOption }}
            </Button>
          </div>
        </Field>

        <!-- Numeric -->
        <template v-else-if="type === 'numeric'">
          <Field>
            <FieldLabel for="adhoc-numeric-answer"
              >{{ t.staff.adhocForm.numericAnswerLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="adhoc-numeric-answer"
              v-model="draft.numericAnswer"
              inputmode="decimal"
              :placeholder="t.staff.adhocForm.numericAnswerPlaceholder"
              :disabled="isSaving"
            />
          </Field>
          <div class="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel for="adhoc-numeric-tolerance">{{
                t.staff.adhocForm.numericToleranceLabel
              }}</FieldLabel>
              <Input
                id="adhoc-numeric-tolerance"
                v-model="draft.numericTolerance"
                inputmode="decimal"
                placeholder="0"
                :disabled="isSaving"
              />
            </Field>
            <Field>
              <FieldLabel for="adhoc-numeric-unit">{{
                t.staff.adhocForm.numericUnitLabel
              }}</FieldLabel>
              <Input
                id="adhoc-numeric-unit"
                v-model="draft.numericUnit"
                :placeholder="t.staff.adhocForm.numericUnitPlaceholder"
                :disabled="isSaving"
              />
            </Field>
          </div>
          <FieldDescription>{{ t.staff.adhocForm.numericToleranceHint }}</FieldDescription>
        </template>

        <!-- Short answer: several accepted answers -->
        <Field v-else-if="type === 'short_answer'">
          <FieldLabel
            >{{ t.staff.adhocForm.acceptedAnswersLabel }}
            <span class="text-destructive">*</span></FieldLabel
          >
          <div class="space-y-2">
            <div
              v-for="(_, index) in draft.acceptedAnswers"
              :key="index"
              class="flex items-center gap-2"
            >
              <Input
                v-model="draft.acceptedAnswers[index]"
                :placeholder="t.staff.adhocForm.acceptedAnswerPlaceholder(index + 1)"
                :disabled="isSaving"
              />
              <Button
                variant="ghost"
                size="icon"
                class="size-8 shrink-0"
                :disabled="isSaving || draft.acceptedAnswers.length <= 1"
                :aria-label="t.staff.adhocForm.removeAcceptedAnswer"
                @click="draft.acceptedAnswers.splice(index, 1)"
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
            @click="draft.acceptedAnswers.push('')"
          >
            <Plus class="mr-2 size-4" />
            {{ t.staff.adhocForm.addAcceptedAnswer }}
          </Button>
          <FieldDescription>{{ t.staff.adhocForm.acceptedAnswersHint }}</FieldDescription>
        </Field>

        <!-- Cloze -->
        <template v-else-if="type === 'cloze'">
          <Field>
            <FieldLabel for="adhoc-cloze-text"
              >{{ t.staff.adhocForm.clozeTextLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <Textarea
              id="adhoc-cloze-text"
              v-model="draft.clozeText"
              :placeholder="t.staff.adhocForm.clozeTextPlaceholder"
              rows="3"
              :disabled="isSaving"
            />
            <FieldDescription>{{ t.staff.adhocForm.clozeTextHint }}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{{ t.staff.adhocForm.clozeBlanksLabel }}</FieldLabel>
            <p v-if="clozeIndices.length === 0" class="text-sm text-muted-foreground">
              {{ t.staff.adhocForm.clozeNoBlanksYet }}
            </p>
            <div v-else class="space-y-2">
              <div v-for="index in clozeIndices" :key="index" class="flex items-center gap-2">
                <span class="w-20 shrink-0 text-sm text-muted-foreground">
                  {{ t.staff.adhocForm.clozeBlankLabel(index) }}
                </span>
                <Input
                  :model-value="draft.clozeAccepted[index] ?? ''"
                  :placeholder="t.staff.adhocForm.clozeBlankPlaceholder"
                  :disabled="isSaving"
                  @update:model-value="(value) => (draft.clozeAccepted[index] = String(value))"
                />
              </div>
            </div>
            <FieldDescription>{{ t.staff.adhocForm.clozePartialHint }}</FieldDescription>
          </Field>
        </template>

        <!-- Matching -->
        <template v-else-if="type === 'matching'">
          <Field>
            <FieldLabel
              >{{ t.staff.adhocForm.matchingRightLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <div class="space-y-2">
              <div
                v-for="(_, index) in draft.matchingRight"
                :key="index"
                class="flex items-center gap-2"
              >
                <Input
                  v-model="draft.matchingRight[index]"
                  :placeholder="t.staff.adhocForm.matchingItemPlaceholder(index + 1)"
                  :disabled="isSaving"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 shrink-0"
                  :disabled="isSaving || draft.matchingRight.length <= 1"
                  :aria-label="t.staff.adhocForm.removeItem"
                  @click="removeRightItem(index)"
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
              @click="draft.matchingRight.push('')"
            >
              <Plus class="mr-2 size-4" />
              {{ t.staff.adhocForm.matchingAddRight }}
            </Button>
          </Field>
          <Field>
            <FieldLabel
              >{{ t.staff.adhocForm.matchingLeftLabel }}
              <span class="text-destructive">*</span></FieldLabel
            >
            <div class="space-y-2">
              <div
                v-for="(row, index) in draft.matchingLeft"
                :key="index"
                class="flex items-center gap-2"
              >
                <Input
                  v-model="row.text"
                  class="flex-1"
                  :placeholder="t.staff.adhocForm.matchingItemPlaceholder(index + 1)"
                  :disabled="isSaving"
                />
                <Select
                  :model-value="row.rightIndex === null ? '' : String(row.rightIndex)"
                  :disabled="isSaving || matchTargets.length === 0"
                  @update:model-value="(value) => setMatch(index, value)"
                >
                  <SelectTrigger class="w-36 shrink-0">
                    <SelectValue :placeholder="t.staff.adhocForm.matchingMatchPlaceholder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="target in matchTargets"
                      :key="target.index"
                      :value="String(target.index)"
                    >
                      {{ target.text }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 shrink-0"
                  :disabled="isSaving || draft.matchingLeft.length <= 1"
                  :aria-label="t.staff.adhocForm.removeItem"
                  @click="draft.matchingLeft.splice(index, 1)"
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
              @click="draft.matchingLeft.push({ text: '', rightIndex: null })"
            >
              <Plus class="mr-2 size-4" />
              {{ t.staff.adhocForm.matchingAddLeft }}
            </Button>
            <FieldDescription>
              {{ t.staff.adhocForm.matchingHint }} {{ t.staff.adhocForm.matchingPartialHint }}
            </FieldDescription>
          </Field>
        </template>

        <!-- Ordering -->
        <Field v-else-if="type === 'ordering'">
          <FieldLabel
            >{{ t.staff.adhocForm.orderingItemsLabel }}
            <span class="text-destructive">*</span></FieldLabel
          >
          <VueDraggable
            v-model="orderingRows"
            handle="[data-drag-handle]"
            ghost-class="opacity-50"
            :animation="150"
            :disabled="isSaving"
            class="space-y-2"
          >
            <div
              v-for="(row, index) in orderingRows"
              :key="row.uid"
              class="flex items-center gap-2"
            >
              <GripVertical
                data-drag-handle
                class="size-4 shrink-0 cursor-grab text-muted-foreground"
                :aria-label="t.staff.builder.dragToReorder"
              />
              <span
                class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {{ index + 1 }}
              </span>
              <Input
                v-model="row.text"
                :placeholder="t.staff.adhocForm.orderingItemPlaceholder(index + 1)"
                :disabled="isSaving"
              />
              <Button
                variant="ghost"
                size="icon"
                class="size-8 shrink-0"
                :disabled="isSaving || orderingRows.length <= 2"
                :aria-label="t.staff.adhocForm.removeItem"
                @click="orderingRows.splice(index, 1)"
              >
                <X class="size-4" />
              </Button>
            </div>
          </VueDraggable>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="mt-1 w-fit"
            :disabled="isSaving"
            @click="orderingRows.push(orderingRow(''))"
          >
            <Plus class="mr-2 size-4" />
            {{ t.staff.adhocForm.orderingAddItem }}
          </Button>
          <FieldDescription>
            {{ t.staff.adhocForm.orderingHint }} {{ t.staff.adhocForm.orderingPartialHint }}
          </FieldDescription>
        </Field>

        <!-- Long answer -->
        <Field v-else-if="type === 'long_answer'">
          <FieldLabel for="adhoc-rubric">{{ t.staff.adhocForm.rubricLabel }}</FieldLabel>
          <Textarea
            id="adhoc-rubric"
            v-model="draft.rubric"
            :placeholder="t.staff.adhocForm.rubricPlaceholder"
            rows="3"
            :disabled="isSaving"
          />
          <FieldDescription>{{ t.staff.adhocForm.longAnswerHint }}</FieldDescription>
        </Field>

        <!-- Explanation (all auto-graded types; long_answer has the rubric) -->
        <Field v-if="type !== 'long_answer'">
          <FieldLabel for="adhoc-explanation">{{ t.staff.adhocForm.explanationLabel }}</FieldLabel>
          <Textarea
            id="adhoc-explanation"
            v-model="draft.explanation"
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
