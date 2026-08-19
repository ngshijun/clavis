<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useQuestionsStore, type Question, type UpdateQuestionInput } from '@/stores/questions'
import { useCurriculumStore } from '@/stores/curriculum'
import { useQuestionForm } from '@/composables/useQuestionForm'
import { computeQuestionImageHash } from '@/lib/imageHash'
import { Loader2, Trash2 } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'vue-sonner'
import QuestionFormFields from './QuestionFormFields.vue'
import { useT } from '@/composables/useT'

/**
 * One Google-Forms-style card for a PRACTICE-BANK question (`questions`
 * table). Collapsed it is a compact one-line preview; clicking it expands IN
 * PLACE into the full editor (the former QuestionAddDialog/QuestionEditDialog
 * body: `QuestionFormFields` + `useQuestionForm` — the single validation
 * source). Every valid state is emitted as `change` for the panel's
 * background autosave — there is no Save button. Invalid drafts show an
 * inline "not saved yet" hint and simply stay unsaved.
 *
 * Images upload the moment they are picked, and the image hash used for
 * duplicate detection is recomputed best-effort after every image change.
 * A replaced/removed object of a persisted question is NOT deleted here: it
 * is reported via `image-orphaned` and deleted by the panel once the update
 * that drops the reference is confirmed (decision 78) — only draft-session
 * objects (no row references them yet) are deleted immediately.
 *
 * A card with `question: null` is a NEW question draft: nothing is persisted
 * until the draft first becomes valid, at which point the row is INSERTED
 * (`created` is emitted) and further edits continue as autosaved updates —
 * abandoned invalid drafts are simply discarded, so no placeholder rows ever
 * leak into student practice.
 */
const props = defineProps<{
  /** `null` = new-question draft (not yet persisted). */
  question: Question | null
  subTopicId: string
  index: number
  expanded: boolean
}>()

const emit = defineEmits<{
  /** Request to expand this card (the panel collapses the previous one). */
  select: []
  /** A VALID state for a persisted question — enqueue for autosave. */
  change: [id: string, input: UpdateQuestionInput, baseline: UpdateQuestionInput]
  /** The new-question draft became valid and was inserted. */
  created: [id: string]
  /**
   * A stored image object of a PERSISTED question stopped being referenced
   * (replace/remove). The panel deletes it only AFTER the autosaved update
   * that drops the reference is confirmed (decision 78).
   */
  'image-orphaned': [id: string, path: string]
  remove: []
}>()

const t = useT()
const questionsStore = useQuestionsStore()
const curriculumStore = useCurriculumStore()

const form = useQuestionForm()

/** Set once the question exists in the DB (immediately for edit cards). */
const savedId = ref<string | null>(props.question?.id ?? null)
const isCreating = ref(false)
/** Count of in-flight image uploads/deletes — autosave waits for zero. */
const imageBusy = ref(0)
const showNotSaved = ref(false)

/** Latest image hash + whether it should ride along on the next save. */
const imageHash = ref<string | null>(null)
const imageHashDirty = ref(false)

/** Autosave baseline: the last state the server is known to hold. */
let baseline: UpdateQuestionInput | null = null
/** True while the draft is being (re)hydrated — no autosave emission. */
let suppressEmit = true

type OptionId = 'a' | 'b' | 'c' | 'd'
const OPTION_IDS: OptionId[] = ['a', 'b', 'c', 'd']

function inputFromQuestion(question: Question): UpdateQuestionInput {
  const isChoice = question.type === 'mcq' || question.type === 'mrq'
  return {
    type: question.type,
    question: question.question,
    imagePath: question.imagePath,
    answer: question.type === 'short_answer' ? question.answer : null,
    options: isChoice ? question.options.map((option) => ({ ...option })) : undefined,
    tagIds: question.tags.map((tag) => tag.id),
  }
}

// ── draft lifecycle ────────────────────────────────────────

watch(
  () => [props.expanded, props.question?.id] as const,
  ([expanded, id], previous) => {
    // A refetch replaces the question objects — do not rehydrate unless the
    // card actually changed state, or a half-typed draft would be discarded.
    if (previous && expanded === previous[0] && id === previous[1]) return
    if (!expanded) return
    suppressEmit = true
    showNotSaved.value = false
    imageHash.value = null
    imageHashDirty.value = false
    if (props.question) {
      form.initializeEditForm(props.question)
      savedId.value = props.question.id
      baseline = inputFromQuestion(props.question)
    } else if (!savedId.value) {
      form.resetToBlank()
      baseline = null
    }
    void nextTick(() => {
      suppressEmit = false
    })
  },
  { immediate: true },
)

// ── image sync: upload on pick, delete on remove (P10b semantics) ──────────

watch(
  () => form.questionImage.value.file,
  (file) => {
    if (file && props.expanded) void syncQuestionImageUpload()
  },
)

/**
 * A stored object stopped being referenced by the draft. For a persisted
 * question the panel deletes it after the confirmed save (decision 78); a
 * draft-session object (no row references it) is deleted immediately.
 */
function orphanImage(path: string) {
  if (savedId.value) emit('image-orphaned', savedId.value, path)
  else void questionsStore.deleteQuestionImage(path)
}

async function syncQuestionImageUpload() {
  const state = form.questionImage.value
  const file = state.file
  if (!file) return
  imageBusy.value++
  try {
    const oldPath = state.originalPath
    const result = await questionsStore.uploadQuestionImage(file)
    state.file = null
    if (!result.path) {
      toast.error(result.error ?? '')
      // The replace never happened — keep showing the previous image.
      state.displayUrl = oldPath ? questionsStore.getOptimizedQuestionImageUrl(oldPath) : ''
      return
    }
    state.originalPath = result.path
    state.displayUrl = questionsStore.getOptimizedQuestionImageUrl(result.path)
    state.removed = false
    if (oldPath) orphanImage(oldPath)
  } finally {
    imageBusy.value--
  }
  await recomputeImageHash()
}

watch(
  () => form.questionImage.value.removed,
  (removed) => {
    if (removed && props.expanded) void syncQuestionImageRemoval()
  },
)

async function syncQuestionImageRemoval() {
  const state = form.questionImage.value
  if (!state.originalPath) {
    state.removed = false
    return
  }
  const oldPath = state.originalPath
  state.originalPath = null
  state.removed = false
  orphanImage(oldPath)
  await recomputeImageHash()
}

const syncingOptions = new Set<OptionId>()

watch(
  () => form.optionImages.value,
  () => {
    if (!props.expanded) return
    for (const optionId of OPTION_IDS) {
      if (syncingOptions.has(optionId)) continue
      const state = form.optionImages.value[optionId]
      if (state.file) void syncOptionImageUpload(optionId)
      else if (state.removed && state.originalPath) void syncOptionImageRemoval(optionId)
    }
  },
  { deep: true },
)

/** Replace the (data-URL or stale) path stored in the form values. */
function setOptionImagePath(optionId: OptionId, path: string | null) {
  const options = (form.values.options ?? []).map((option) =>
    option.id === optionId ? { ...option, imagePath: path } : option,
  )
  form.setFieldValue('options', options)
}

async function syncOptionImageUpload(optionId: OptionId) {
  syncingOptions.add(optionId)
  imageBusy.value++
  try {
    const state = form.optionImages.value[optionId]
    const file = state.file
    if (!file) return
    const oldPath = state.originalPath
    const result = await questionsStore.uploadQuestionImage(file, optionId)
    state.file = null
    if (!result.path) {
      toast.error(result.error ?? '')
      // The replace never happened — keep the previous stored path.
      setOptionImagePath(optionId, oldPath)
      return
    }
    state.originalPath = result.path
    state.removed = false
    setOptionImagePath(optionId, result.path)
    if (oldPath) orphanImage(oldPath)
  } finally {
    syncingOptions.delete(optionId)
    imageBusy.value--
  }
  await recomputeImageHash()
}

async function syncOptionImageRemoval(optionId: OptionId) {
  syncingOptions.add(optionId)
  try {
    const state = form.optionImages.value[optionId]
    if (state.originalPath) {
      const oldPath = state.originalPath
      state.originalPath = null
      orphanImage(oldPath)
    }
    state.removed = false
  } finally {
    syncingOptions.delete(optionId)
  }
  await recomputeImageHash()
}

/**
 * Best-effort duplicate-detection hash over the CURRENT stored images (all
 * uploads settle before this runs, so hashing works from storage URLs). A
 * failure is swallowed — the content save must never be blocked by it.
 */
async function recomputeImageHash() {
  const urlOf = (path: string | null) => (path ? questionsStore.getQuestionImageUrl(path) : null)
  try {
    const hash = await computeQuestionImageHash({
      questionImage: urlOf(form.questionImage.value.originalPath),
      optionAImage: urlOf(form.optionImages.value.a.originalPath),
      optionBImage: urlOf(form.optionImages.value.b.originalPath),
      optionCImage: urlOf(form.optionImages.value.c.originalPath),
      optionDImage: urlOf(form.optionImages.value.d.originalPath),
    })
    imageHash.value = hash || null
    imageHashDirty.value = true
  } catch (error) {
    console.error('Failed to recompute question image hash:', error)
  }
  maybePersist()
}

// ── autosave source ────────────────────────────────────────

watch(
  [() => form.values, form.selectedTagIds, () => form.questionImage.value],
  () => maybePersist(),
  { deep: true },
)

function hasPendingImages(): boolean {
  if (imageBusy.value > 0) return true
  if (form.questionImage.value.file) return true
  for (const optionId of OPTION_IDS) {
    if (form.optionImages.value[optionId].file) return true
  }
  // A data-URL preview means an upload has not settled yet.
  return (form.values.options ?? []).some((option) => option.imagePath?.startsWith('data:'))
}

function buildInput(): UpdateQuestionInput | null {
  const parsed = form.validateCurrent()
  if (!parsed) return null
  const isChoice = parsed.type === 'mcq' || parsed.type === 'mrq'
  const input: UpdateQuestionInput = {
    type: parsed.type,
    question: parsed.question,
    imagePath: form.questionImage.value.originalPath,
    answer: parsed.type === 'short_answer' ? parsed.answer?.trim() || null : null,
    options: isChoice
      ? (parsed.options ?? []).map((option) => ({
          id: option.id,
          text: option.text,
          imagePath: option.imagePath,
          isCorrect: option.isCorrect,
          tip: option.tip,
        }))
      : undefined,
    tagIds: [...form.selectedTagIds.value],
  }
  if (imageHashDirty.value) input.imageHash = imageHash.value
  return input
}

function maybePersist() {
  if (!props.expanded || suppressEmit) return
  if (hasPendingImages()) return
  const input = buildInput()
  if (!input) {
    showNotSaved.value = true
    return
  }
  showNotSaved.value = false
  if (!savedId.value) {
    if (!isCreating.value) void createQuestion(input)
    return
  }
  emit('change', savedId.value, input, baseline ?? input)
}

async function createQuestion(input: UpdateQuestionInput) {
  isCreating.value = true
  try {
    const hierarchy = curriculumStore.getSubTopicWithHierarchy(props.subTopicId)
    const result = await questionsStore.addQuestion({
      type: input.type!,
      question: input.question!,
      imagePath: input.imagePath ?? null,
      subTopicId: props.subTopicId,
      gradeLevelId: hierarchy?.gradeLevel.id ?? null,
      subjectId: hierarchy?.subject.id ?? null,
      answer: input.answer ?? null,
      options: input.options,
      imageHash: imageHashDirty.value ? imageHash.value : null,
      tagIds: input.tagIds,
    })
    if (result.error || !result.id) {
      toast.error(result.error ?? '')
      return
    }
    savedId.value = result.id
    baseline = input
    emit('created', result.id)
  } finally {
    isCreating.value = false
  }
  // Pick up any edits made while the insert was in flight.
  maybePersist()
}
</script>

<template>
  <div
    class="rounded-lg border bg-card transition-shadow"
    :class="expanded ? 'border-l-4 border-l-primary shadow-md' : 'hover:border-primary/40'"
  >
    <!-- Collapsed: compact one-line preview -->
    <button
      v-if="!expanded"
      type="button"
      class="flex w-full items-center gap-3 p-3 text-left"
      @click="emit('select')"
    >
      <span
        class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
      >
        {{ index + 1 }}
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium" :title="question?.question">{{ question?.question }}</p>
        <div class="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge v-if="question" variant="secondary">
            {{ t.shared.questionTypes[question.type] }}
          </Badge>
          <Badge v-for="tag in question?.tags" :key="tag.id" variant="outline">
            {{ tag.name }}
          </Badge>
        </div>
      </div>
    </button>

    <!-- Expanded: the full editor, autosaved in the background -->
    <div v-else class="space-y-4 p-4">
      <QuestionFormFields :form="form" :option-image-url-getter="form.getOptionImageUrl" />

      <!-- Invalid drafts are simply not saved yet — no blocking dialog -->
      <p v-if="showNotSaved" class="text-sm text-destructive" role="alert">
        {{ t.admin.subTopicQuestions.notSavedHint }}
      </p>

      <Separator />

      <!-- Card footer -->
      <div class="flex items-center justify-end gap-1">
        <Loader2
          v-if="imageBusy > 0 || isCreating"
          class="mr-1 size-4 animate-spin text-muted-foreground"
        />
        <Button
          v-if="savedId"
          variant="ghost"
          size="icon"
          class="size-8 text-destructive hover:text-destructive"
          :aria-label="t.admin.subTopicQuestions.delete"
          @click="emit('remove')"
        >
          <Trash2 class="size-4" />
        </Button>
        <Button v-else variant="ghost" size="sm" @click="emit('remove')">
          {{ t.admin.subTopicQuestions.discardDraft }}
        </Button>
      </div>
    </div>
  </div>
</template>
