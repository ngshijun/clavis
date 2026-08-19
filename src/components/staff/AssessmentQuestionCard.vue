<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { AssessmentQuestionItem } from '@/stores/assessments'
import {
  buildAdhocPayload,
  parseClozeIndices,
  payloadToDraft,
  type AdhocDraft,
  type AdhocPayload,
  type AdhocQuestionType,
  type AdhocValidationCode,
} from '@/lib/adhocPayload'
import { createBucketImageHelpers, uploadStorageFile } from '@/lib/storage'
import { moveItem, refocusReorderHandle } from '@/lib/reorder'
import {
  Copy,
  GripHorizontal,
  GripVertical,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field'
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

/**
 * One Google-Forms-style question card. Collapsed it is a compact one-line
 * preview; clicking it expands IN PLACE. An expanded ad-hoc card is the full
 * editor (the former AdhocQuestionDialog body): every draft change is built
 * through `buildAdhocPayload` (the single validator) and, when valid, emitted
 * as `payload-change` for the page's background autosave — there is no Save
 * button. Bank-sourced questions expand into a read-only preview (their
 * content lives in the question bank).
 *
 * Images (P10a): a question-level image for every ad-hoc type and per-option
 * images for mcq/mrq, uploaded into `assessment-images` under
 * `{assessmentId}/…` (the bucket RLS requires that first folder segment).
 * Replacing/removing never deletes the old object here — it is reported via
 * `image-orphaned` and deleted by the page once the payload save that drops
 * the reference is confirmed (decision 78), so a failed save can never leave
 * the row pointing at a deleted object.
 */
const props = defineProps<{
  item: AssessmentQuestionItem
  index: number
  expanded: boolean
  /** Edit permission (draft + author). Read-only cards still expand to a preview. */
  editable: boolean
  assessmentId: string
}>()

const emit = defineEmits<{
  /** Request to expand this card (the page collapses the previous one). */
  select: []
  /** A VALID payload built from the current draft — enqueue for autosave. */
  'payload-change': [payload: AdhocPayload]
  'points-change': [points: number]
  /** Keyboard reorder from the grip (decision 77) — same path as a drop. */
  move: [delta: -1 | 1]
  /**
   * A previously-stored image object stopped being referenced by the draft
   * (replace/remove). The page deletes it only AFTER the payload save that
   * drops the reference is confirmed (decision 78).
   */
  'image-orphaned': [path: string]
  duplicate: []
  remove: []
}>()

const t = useT()
const languageStore = useLanguageStore()

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

const { getImageUrl: getAssessmentImageUrl } = createBucketImageHelpers('assessment-images')
const { getImageUrl: getBankImageUrl } = createBucketImageHelpers('question-images')

const isAdhocEditor = computed(
  () => props.expanded && props.editable && props.item.source === 'adhoc',
)
const isReadOnlyPreview = computed(() => props.expanded && !isAdhocEditor.value)

/** Resolve a stored path against the bucket the card's source writes to. */
function imageUrlOf(path: string | null): string {
  if (!path) return ''
  return props.item.source === 'bank' ? getBankImageUrl(path) : getAssessmentImageUrl(path)
}

// ── draft lifecycle ────────────────────────────────────────

const draft = ref<AdhocDraft | null>(null)
/** Ordering rows carry a stable uid so dragging never keys off the index. */
const orderingRows = ref<{ uid: number; text: string }[]>([])
let nextUid = 1
/** True while the draft is being (re)hydrated — no autosave emission. */
let suppressEmit = false

const validationCode = ref<AdhocValidationCode | null>(null)

function orderingRow(text: string): { uid: number; text: string } {
  return { uid: nextUid++, text }
}

watch(
  () => [props.expanded, props.item.id] as const,
  ([expanded, id], previous) => {
    // A reorder replaces the item objects (new array clones) and re-triggers
    // this getter — do not rehydrate unless the card actually changed state,
    // or a half-typed (invalid, unsaved) draft would be discarded.
    if (previous && expanded === previous[0] && id === previous[1]) return
    if (isAdhocEditor.value && props.item.payload) {
      suppressEmit = true
      draft.value = payloadToDraft(props.item.payload)
      orderingRows.value = draft.value.orderingItems.map(orderingRow)
      validationCode.value = null
      void nextTick(() => {
        suppressEmit = false
      })
    } else {
      draft.value = null
      orderingRows.value = []
      validationCode.value = null
    }
  },
  { immediate: true },
)

/** The draft with the ordering rows folded back in (they live outside for drag uids). */
function currentDraft(): AdhocDraft | null {
  if (!draft.value) return null
  return { ...draft.value, orderingItems: orderingRows.value.map((row) => row.text) }
}

// Autosave source: every edit builds the payload through the single
// validator; only VALID payloads are emitted (invalid drafts show the hint
// below and simply stay unsaved until fixed).
watch(
  [draft, orderingRows],
  () => {
    if (suppressEmit) return
    const merged = currentDraft()
    if (!merged) return
    const { payload, error } = buildAdhocPayload(merged)
    if (error || !payload) {
      validationCode.value = error
      return
    }
    validationCode.value = null
    emit('payload-change', payload)
  },
  { deep: true },
)

const type = computed(() => draft.value?.type ?? props.item.type)

/** The `{{n}}` placeholders currently present in the cloze text. */
const clozeIndices = computed(() => parseClozeIndices(draft.value?.clozeText ?? ''))

/** Right-side rows with text — what a prompt can be matched against. */
const matchTargets = computed(() =>
  (draft.value?.matchingRight ?? [])
    .map((text, index) => ({ index, text: text.trim() }))
    .filter((target) => target.text.length > 0),
)

function onTypeChange(value: unknown) {
  if (!draft.value) return
  draft.value.type = value as AdhocQuestionType
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
  if (!draft.value) return
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

function removeOption(index: number) {
  if (!draft.value) return
  const removed = draft.value.options.splice(index, 1)[0]
  // Deleted only after the payload save confirms the reference is gone.
  if (removed?.imagePath) emit('image-orphaned', removed.imagePath)
}

// ── ordering rows: keyboard reorder (decision 77) ──────────
// Same persistence path as a drag: mutating `orderingRows` feeds the draft
// deep-watch, which validates and emits `payload-change` for the autosave.

const orderingAnnouncement = ref('')

function moveOrderingRow(index: number, delta: -1 | 1) {
  const moving = orderingRows.value[index]
  const next = moveItem(orderingRows.value, index, delta)
  if (!next || !moving) return
  orderingRows.value = next
  void refocusReorderHandle(moving.uid)
  orderingAnnouncement.value = t.value.shared.reorder.movedTo(
    index + 1 + delta,
    orderingRows.value.length,
  )
}

// ── matching ───────────────────────────────────────────────

function setMatch(leftIndex: number, value: unknown) {
  const row = draft.value?.matchingLeft[leftIndex]
  if (row) row.rightIndex = value === '' || value === null ? null : Number(value)
}

function removeRightItem(index: number) {
  if (!draft.value) return
  draft.value.matchingRight.splice(index, 1)
  // Re-anchor prompt matches to the shifted indices.
  for (const row of draft.value.matchingLeft) {
    if (row.rightIndex === null) continue
    if (row.rightIndex === index) row.rightIndex = null
    else if (row.rightIndex > index) row.rightIndex -= 1
  }
}

// ── images (P10a) ──────────────────────────────────────────

const questionImageInput = ref<HTMLInputElement | null>(null)
const optionImageInput = ref<HTMLInputElement | null>(null)
const isUploadingQuestionImage = ref(false)
const uploadingOptionIndex = ref<number | null>(null)
let optionImageTarget = 0

/** The floating toolbar's "add image" button targets the active card. */
function openImagePicker() {
  if (isAdhocEditor.value) questionImageInput.value?.click()
}
defineExpose({ openImagePicker })

function pickOptionImage(index: number) {
  optionImageTarget = index
  optionImageInput.value?.click()
}

async function onQuestionImagePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !draft.value) return

  isUploadingQuestionImage.value = true
  try {
    // `folder: assessmentId` produces `{assessment_id}/{uuid}.webp` — the
    // shape the bucket's write RLS requires. The replaced object is only
    // deleted after the payload save confirms (decision 78).
    const { path, error } = await uploadStorageFile('assessment-images', file, {
      folder: props.assessmentId,
    })
    if (error || !path) {
      toast.error(error ?? '')
      return
    }
    const oldPath = draft.value.imagePath
    draft.value.imagePath = path
    if (oldPath) emit('image-orphaned', oldPath)
  } finally {
    isUploadingQuestionImage.value = false
  }
}

function removeQuestionImage() {
  if (!draft.value?.imagePath) return
  const oldPath = draft.value.imagePath
  draft.value.imagePath = null
  emit('image-orphaned', oldPath)
}

async function onOptionImagePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const option = draft.value?.options[optionImageTarget]
  if (!file || !option) return

  uploadingOptionIndex.value = optionImageTarget
  try {
    const { path, error } = await uploadStorageFile('assessment-images', file, {
      folder: props.assessmentId,
    })
    if (error || !path) {
      toast.error(error ?? '')
      return
    }
    const oldPath = option.imagePath ?? null
    option.imagePath = path
    if (oldPath) emit('image-orphaned', oldPath)
  } finally {
    uploadingOptionIndex.value = null
  }
}

function removeOptionImage(index: number) {
  const option = draft.value?.options[index]
  if (!option?.imagePath) return
  const oldPath = option.imagePath
  option.imagePath = null
  emit('image-orphaned', oldPath)
}

// ── footer ─────────────────────────────────────────────────

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

const validationMessage = computed(() =>
  validationCode.value ? VALIDATION_MESSAGES[validationCode.value]() : null,
)

function onPointsChange(event: Event) {
  const input = event.target as HTMLInputElement
  const points = Number.parseInt(input.value, 10)
  if (!Number.isInteger(points) || points < 1) {
    input.value = String(props.item.points)
    return
  }
  if (points !== props.item.points) emit('points-change', points)
}
</script>

<template>
  <div
    class="rounded-lg border bg-card transition-shadow"
    :class="expanded ? 'border-l-4 border-l-primary shadow-md' : 'hover:border-primary/40'"
  >
    <!-- Drag handle strip (Forms-style, centered at the top of the card).
         Also the keyboard-reorder control: arrow keys move the card. -->
    <button
      v-if="editable"
      type="button"
      data-card-drag-handle
      :data-reorder-id="item.id"
      class="flex w-full cursor-grab justify-center rounded pt-1 text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :aria-label="`${t.staff.builder.questionNumber(index + 1)} — ${t.shared.reorder.handleLabel}`"
      @keydown.up.prevent="emit('move', -1)"
      @keydown.down.prevent="emit('move', 1)"
    >
      <GripHorizontal class="size-4" />
    </button>

    <!-- Collapsed: compact one-line preview -->
    <button
      v-if="!expanded"
      type="button"
      class="flex w-full items-center gap-3 p-3 text-left"
      :class="editable ? 'pt-1' : ''"
      @click="emit('select')"
    >
      <span
        class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
      >
        {{ index + 1 }}
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium" :title="item.question">{{ item.question }}</p>
        <div class="mt-1 flex items-center gap-2">
          <Badge variant="secondary">{{ t.shared.questionTypes[item.type] }}</Badge>
          <Badge variant="outline">
            {{ item.source === 'bank' ? t.staff.builder.bankBadge : t.staff.builder.adhocBadge }}
          </Badge>
        </div>
      </div>
      <span class="shrink-0 text-sm text-muted-foreground">
        {{ t.staff.builder.pointsFmt(item.points) }}
      </span>
    </button>

    <!-- Expanded read-only preview (bank questions, or no edit permission) -->
    <div v-else-if="isReadOnlyPreview" class="space-y-3 p-4 pt-2">
      <div class="flex items-start justify-between gap-4">
        <p class="font-medium leading-relaxed">{{ item.question }}</p>
        <Badge variant="secondary" class="shrink-0">{{ t.shared.questionTypes[item.type] }}</Badge>
      </div>
      <img
        v-if="item.imagePath"
        :src="imageUrlOf(item.imagePath)"
        :alt="t.shared.questionPreviewDialog.questionImageAlt"
        class="max-h-48 rounded-md border object-contain"
        loading="lazy"
      />
      <div v-if="item.options.length > 0" class="space-y-1.5">
        <div
          v-for="option in item.options"
          :key="option.number"
          class="flex items-center gap-2 rounded-md border p-2 text-sm"
        >
          <span v-if="option.text">{{ option.text }}</span>
          <img
            v-if="option.imagePath"
            :src="imageUrlOf(option.imagePath)"
            :alt="t.shared.questionPreviewDialog.optionImageAlt"
            class="max-h-12 rounded border object-contain"
            loading="lazy"
          />
        </div>
      </div>

      <template v-if="editable">
        <Separator />
        <div class="flex items-center justify-end gap-1">
          <label class="mr-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{{ t.staff.builder.pointsLabel }}</span>
            <Input
              type="number"
              min="1"
              step="1"
              class="w-16"
              :model-value="item.points"
              @change="onPointsChange"
            />
          </label>
          <Button
            variant="ghost"
            size="icon"
            class="size-8 text-destructive hover:text-destructive"
            :aria-label="t.staff.builder.removeQuestion"
            @click="emit('remove')"
          >
            <Trash2 class="size-4" />
          </Button>
        </div>
      </template>
    </div>

    <!-- Expanded ad-hoc editor -->
    <div v-else-if="draft" class="space-y-4 p-4 pt-2">
      <div class="flex flex-wrap items-start gap-3">
        <!-- Question text (optional instructions for cloze) -->
        <Field class="min-w-0 flex-1 basis-64">
          <FieldLabel :for="`question-${item.id}`">
            {{
              type === 'cloze'
                ? t.staff.adhocForm.clozePromptLabel
                : t.staff.adhocForm.questionLabel
            }}
            <span v-if="type !== 'cloze'" class="text-destructive">*</span>
          </FieldLabel>
          <Textarea
            :id="`question-${item.id}`"
            v-model="draft.question"
            :placeholder="t.staff.adhocForm.questionPlaceholder"
            rows="2"
          />
        </Field>

        <!-- Type dropdown lives inside the card — switching never leaves it -->
        <Field class="w-44 shrink-0">
          <FieldLabel>{{ t.staff.adhocForm.typeLabel }}</FieldLabel>
          <Select
            :key="languageStore.language"
            :model-value="type"
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
      </div>

      <!-- Question image (every type) -->
      <div>
        <input
          ref="questionImageInput"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          class="hidden"
          @change="onQuestionImagePicked"
        />
        <div v-if="draft.imagePath" class="flex items-start gap-2">
          <img
            :src="getAssessmentImageUrl(draft.imagePath)"
            :alt="t.shared.questionPreviewDialog.questionImageAlt"
            class="max-h-40 rounded-md border object-contain"
          />
          <div class="flex flex-col gap-1">
            <Button
              variant="outline"
              size="sm"
              :disabled="isUploadingQuestionImage"
              @click="questionImageInput?.click()"
            >
              <Loader2 v-if="isUploadingQuestionImage" class="mr-2 size-4 animate-spin" />
              <ImagePlus v-else class="mr-2 size-4" />
              {{ t.staff.adhocForm.replaceImage }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="text-destructive hover:text-destructive"
              :disabled="isUploadingQuestionImage"
              @click="removeQuestionImage"
            >
              <X class="mr-2 size-4" />
              {{ t.staff.adhocForm.removeImage }}
            </Button>
          </div>
        </div>
        <Button
          v-else
          variant="outline"
          size="sm"
          :disabled="isUploadingQuestionImage"
          @click="questionImageInput?.click()"
        >
          <Loader2 v-if="isUploadingQuestionImage" class="mr-2 size-4 animate-spin" />
          <ImagePlus v-else class="mr-2 size-4" />
          {{ t.staff.adhocForm.addImage }}
        </Button>
      </div>

      <!-- Options (mcq/mrq) with per-option images -->
      <Field v-if="type === 'mcq' || type === 'mrq'">
        <FieldLabel
          >{{ t.staff.adhocForm.optionsLabel }} <span class="text-destructive">*</span></FieldLabel
        >
        <input
          ref="optionImageInput"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          class="hidden"
          @change="onOptionImagePicked"
        />
        <div class="space-y-2">
          <div v-for="(option, index) in draft.options" :key="index" class="space-y-1">
            <div class="flex items-center gap-2">
              <label class="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                <Checkbox
                  :model-value="option.isCorrect"
                  :aria-label="t.staff.adhocForm.correctLabel"
                  @update:model-value="(checked) => setCorrect(index, checked === true)"
                />
                <span class="sr-only sm:not-sr-only">{{ t.staff.adhocForm.correctLabel }}</span>
              </label>
              <Input
                v-model="option.text"
                :placeholder="t.staff.adhocForm.optionPlaceholder(index + 1)"
              />
              <Button
                variant="ghost"
                size="icon"
                class="size-8 shrink-0"
                :disabled="uploadingOptionIndex !== null"
                :aria-label="t.staff.adhocForm.addOptionImage"
                @click="pickOptionImage(index)"
              >
                <Loader2 v-if="uploadingOptionIndex === index" class="size-4 animate-spin" />
                <ImagePlus v-else class="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="size-8 shrink-0"
                :disabled="draft.options.length <= 2"
                :aria-label="t.staff.adhocForm.removeOption"
                @click="removeOption(index)"
              >
                <X class="size-4" />
              </Button>
            </div>
            <div v-if="option.imagePath" class="ml-8 flex items-center gap-2">
              <img
                :src="getAssessmentImageUrl(option.imagePath)"
                :alt="t.shared.questionPreviewDialog.optionImageAlt"
                class="max-h-16 rounded border object-contain"
              />
              <Button
                variant="ghost"
                size="icon"
                class="size-7 text-destructive hover:text-destructive"
                :aria-label="t.staff.adhocForm.removeOptionImage"
                @click="removeOptionImage(index)"
              >
                <X class="size-4" />
              </Button>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="mt-1 w-fit"
          @click="draft.options.push({ text: '', isCorrect: false, imagePath: null })"
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
            @click="draft.trueFalseAnswer = true"
          >
            {{ t.staff.adhocForm.trueOption }}
          </Button>
          <Button
            type="button"
            :variant="!draft.trueFalseAnswer ? 'default' : 'outline'"
            @click="draft.trueFalseAnswer = false"
          >
            {{ t.staff.adhocForm.falseOption }}
          </Button>
        </div>
      </Field>

      <!-- Numeric -->
      <template v-else-if="type === 'numeric'">
        <Field>
          <FieldLabel :for="`numeric-answer-${item.id}`"
            >{{ t.staff.adhocForm.numericAnswerLabel }}
            <span class="text-destructive">*</span></FieldLabel
          >
          <Input
            :id="`numeric-answer-${item.id}`"
            v-model="draft.numericAnswer"
            inputmode="decimal"
            :placeholder="t.staff.adhocForm.numericAnswerPlaceholder"
          />
        </Field>
        <div class="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel :for="`numeric-tolerance-${item.id}`">{{
              t.staff.adhocForm.numericToleranceLabel
            }}</FieldLabel>
            <Input
              :id="`numeric-tolerance-${item.id}`"
              v-model="draft.numericTolerance"
              inputmode="decimal"
              placeholder="0"
            />
          </Field>
          <Field>
            <FieldLabel :for="`numeric-unit-${item.id}`">{{
              t.staff.adhocForm.numericUnitLabel
            }}</FieldLabel>
            <Input
              :id="`numeric-unit-${item.id}`"
              v-model="draft.numericUnit"
              :placeholder="t.staff.adhocForm.numericUnitPlaceholder"
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
            />
            <Button
              variant="ghost"
              size="icon"
              class="size-8 shrink-0"
              :disabled="draft.acceptedAnswers.length <= 1"
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
          <FieldLabel :for="`cloze-text-${item.id}`"
            >{{ t.staff.adhocForm.clozeTextLabel }}
            <span class="text-destructive">*</span></FieldLabel
          >
          <Textarea
            :id="`cloze-text-${item.id}`"
            v-model="draft.clozeText"
            :placeholder="t.staff.adhocForm.clozeTextPlaceholder"
            rows="3"
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
                @update:model-value="(value) => (draft!.clozeAccepted[index] = String(value))"
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
              />
              <Button
                variant="ghost"
                size="icon"
                class="size-8 shrink-0"
                :disabled="draft.matchingRight.length <= 1"
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
              />
              <Select
                :model-value="row.rightIndex === null ? '' : String(row.rightIndex)"
                :disabled="matchTargets.length === 0"
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
                :disabled="draft.matchingLeft.length <= 1"
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
        <!-- Announces keyboard moves to screen readers -->
        <p class="sr-only" role="status">{{ orderingAnnouncement }}</p>
        <VueDraggable
          v-model="orderingRows"
          handle="[data-item-drag-handle]"
          ghost-class="opacity-50"
          :animation="150"
          class="space-y-2"
        >
          <div v-for="(row, index) in orderingRows" :key="row.uid" class="flex items-center gap-2">
            <button
              type="button"
              data-item-drag-handle
              :data-reorder-id="row.uid"
              class="shrink-0 cursor-grab rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :aria-label="`${row.text || t.staff.adhocForm.orderingItemPlaceholder(index + 1)} — ${t.shared.reorder.handleLabel}`"
              @keydown.up.prevent="moveOrderingRow(index, -1)"
              @keydown.down.prevent="moveOrderingRow(index, 1)"
            >
              <GripVertical class="size-4" />
            </button>
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            >
              {{ index + 1 }}
            </span>
            <Input
              v-model="row.text"
              :placeholder="t.staff.adhocForm.orderingItemPlaceholder(index + 1)"
            />
            <Button
              variant="ghost"
              size="icon"
              class="size-8 shrink-0"
              :disabled="orderingRows.length <= 2"
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
        <FieldLabel :for="`rubric-${item.id}`">{{ t.staff.adhocForm.rubricLabel }}</FieldLabel>
        <Textarea
          :id="`rubric-${item.id}`"
          v-model="draft.rubric"
          :placeholder="t.staff.adhocForm.rubricPlaceholder"
          rows="3"
        />
        <FieldDescription>{{ t.staff.adhocForm.longAnswerHint }}</FieldDescription>
      </Field>

      <!-- Explanation (all auto-graded types; long_answer has the rubric) -->
      <Field v-if="type !== 'long_answer'">
        <FieldLabel :for="`explanation-${item.id}`">{{
          t.staff.adhocForm.explanationLabel
        }}</FieldLabel>
        <Textarea
          :id="`explanation-${item.id}`"
          v-model="draft.explanation"
          :placeholder="t.staff.adhocForm.explanationPlaceholder"
          rows="2"
        />
      </Field>

      <!-- Invalid drafts are simply not saved yet — no blocking dialog -->
      <p v-if="validationMessage" class="text-sm text-destructive" role="alert">
        {{ t.staff.builder.notSavedHint(validationMessage) }}
      </p>

      <Separator />

      <!-- Card footer: points · duplicate · delete -->
      <div class="flex items-center justify-end gap-1">
        <label class="mr-2 flex items-center gap-2 text-sm text-muted-foreground">
          <span>{{ t.staff.builder.pointsLabel }}</span>
          <Input
            type="number"
            min="1"
            step="1"
            class="w-16"
            :model-value="item.points"
            @change="onPointsChange"
          />
        </label>
        <Button
          variant="ghost"
          size="icon"
          class="size-8"
          :aria-label="t.staff.builder.duplicateQuestion"
          @click="emit('duplicate')"
        >
          <Copy class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-8 text-destructive hover:text-destructive"
          :aria-label="t.staff.builder.removeQuestion"
          @click="emit('remove')"
        >
          <Trash2 class="size-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
