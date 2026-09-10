<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useQuestionsStore, type Question, type UpdateQuestionInput } from '@/stores/questions'
import { useCurriculumStore, type Stage } from '@/stores/curriculum'
import { useAutosave } from '@/composables/useAutosave'
import { generateQuestionTemplate } from '@/lib/excel/questionExcel'
import { removeStorageObjects } from '@/lib/storage'
import { Download, Loader2, Plus, Search, Upload } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import SaveStatusPill from '@/components/shared/SaveStatusPill.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import BankQuestionCard from './BankQuestionCard.vue'
import QuestionBulkUploadDialog from './QuestionBulkUploadDialog.vue'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

/**
 * Question management for ONE stage (decision 42) as a master-detail
 * split: the question rows (with search, add · bulk upload · template) on
 * the left, the selected question's `BankQuestionCard` editor on the right
 * with background autosave. All CRUD and the bulk Excel import stay scoped
 * to the stage the admin drilled into.
 */
const props = defineProps<{
  stage: Stage
}>()

const t = useT()
const questionsStore = useQuestionsStore()
const curriculumStore = useCurriculumStore()

const stageQuestions = ref<Question[]>([])
const isLoading = ref(false)
const search = ref('')

/** One card expanded at a time; 'draft' is the unsaved new-question card. */
const expandedId = ref<string | null>(null)
/** True while the new-question draft card is shown. */
const isAdding = ref(false)
/** Set once the draft card inserts its row (highlighted in the list while the draft stays open). */
const draftCreatedId = ref<string | null>(null)

const showDeleteDialog = ref(false)
const showBulkUploadDialog = ref(false)
const selectedQuestion = ref<Question | null>(null)
const isDeleting = ref(false)

const { status: saveStatus, enqueue } = useAutosave({
  onError: (message) => toast.error(message),
})

async function loadQuestions() {
  isLoading.value = true
  const result = await questionsStore.fetchBankQuestionsByStage(props.stage.id)
  isLoading.value = false

  if (result.error) {
    toast.error(result.error)
    return
  }
  stageQuestions.value = result.questions
  // Keep the curriculum tree's question count in sync with what we just loaded
  const stage = curriculumStore.getStageById(props.stage.id)
  if (stage) {
    stage.questionCount = result.questions.length
  }
}

onMounted(loadQuestions)
watch(
  () => props.stage.id,
  () => {
    search.value = ''
    expandedId.value = null
    isAdding.value = false
    draftCreatedId.value = null
    loadQuestions()
  },
)

const filteredQuestions = computed(() => {
  const query = search.value.trim().toLowerCase()
  return query
    ? stageQuestions.value.filter((q) => q.question.toLowerCase().includes(query))
    : stageQuestions.value
})

/** The persisted question open in the editor pane (the draft is separate). */
const activeQuestion = computed(() =>
  expandedId.value && expandedId.value !== 'draft'
    ? (stageQuestions.value.find((q) => q.id === expandedId.value) ?? null)
    : null,
)

/** The selected row's highlight: the open question, or the draft's inserted row. */
const selectedId = computed(() =>
  expandedId.value === 'draft' ? draftCreatedId.value : expandedId.value,
)

// Closing the draft card (expanding another card, collapsing) finishes the
// add: a created row becomes a regular card, an invalid draft is discarded.
watch(expandedId, (id, previous) => {
  if (previous === 'draft' && id !== 'draft') {
    isAdding.value = false
    draftCreatedId.value = null
  }
})

function startAdd() {
  if (isAdding.value) {
    expandedId.value = 'draft'
    return
  }
  isAdding.value = true
  draftCreatedId.value = null
  expandedId.value = 'draft'
}

/**
 * Apply an autosaved (or rolled-back) input to the local list entry so the
 * collapsed preview always shows the latest content. Tags are applied by id
 * only where names are already known — the next refetch trues them up.
 */
function applyInputToQuestion(question: Question, input: UpdateQuestionInput) {
  if (input.type !== undefined) question.type = input.type
  if (input.question !== undefined) question.question = input.question
  if (input.imagePath !== undefined) question.imagePath = input.imagePath
  if (input.answer !== undefined) question.answer = input.answer
  if (input.options) question.options = input.options.map((option) => ({ ...option }))
  if (input.imageHash !== undefined) question.imageHash = input.imageHash
  if (input.tagIds) {
    question.tags = question.tags.filter((tag) => input.tagIds!.includes(tag.id))
  }
}

/**
 * Storage objects a card replaced/removed, per question id (decision 78).
 * Deleted only once an update CONFIRMS the stored row no longer references
 * them — a failed save rolls back to the confirmed input (which still
 * references the old object), so deleting earlier would leave a broken
 * image. Pending paths of a finally-failed save are dropped (the fresh
 * upload becomes the orphan instead).
 */
const pendingImageDeletes = new Map<string, Set<string>>()

function queueImageDelete(id: string, path: string) {
  let pending = pendingImageDeletes.get(id)
  if (!pending) {
    pending = new Set()
    pendingImageDeletes.set(id, pending)
  }
  pending.add(path)
}

/** After a CONFIRMED save: delete every pending object the row no longer references. */
function flushOrphanedImages(id: string, saved: UpdateQuestionInput) {
  const pending = pendingImageDeletes.get(id)
  if (!pending) return
  const referenced = new Set(
    [saved.imagePath, ...(saved.options ?? []).map((option) => option.imagePath)].filter(
      (path): path is string => !!path,
    ),
  )
  const removable = [...pending].filter((path) => !referenced.has(path))
  for (const path of removable) pending.delete(path)
  void removeStorageObjects('question-images', removable)
}

function handleChange(id: string, input: UpdateQuestionInput, baseline: UpdateQuestionInput) {
  const question = stageQuestions.value.find((q) => q.id === id)
  if (question) applyInputToQuestion(question, input)
  enqueue(`question:${id}`, input, {
    previous: baseline,
    save: async (value) => {
      const result = await questionsStore.updateQuestion(id, value)
      if (!result.error) flushOrphanedImages(id, value)
      return result
    },
    rollback: (confirmed) => {
      pendingImageDeletes.delete(id)
      const target = stageQuestions.value.find((q) => q.id === id)
      if (target) applyInputToQuestion(target, confirmed)
    },
  })
}

async function handleDraftCreated(id: string) {
  draftCreatedId.value = id
  await loadQuestions()
}

function handleDraftRemove() {
  if (draftCreatedId.value) {
    const created = stageQuestions.value.find((q) => q.id === draftCreatedId.value)
    if (created) {
      askDelete(created)
      return
    }
  }
  // Nothing persisted — just discard the draft card.
  expandedId.value = null
  isAdding.value = false
  draftCreatedId.value = null
}

function askDelete(question: Question) {
  selectedQuestion.value = question
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!selectedQuestion.value) return

  isDeleting.value = true
  try {
    const result = await questionsStore.deleteQuestion(selectedQuestion.value)
    if (result.error) {
      toast.error(result.error)
      return
    }
    // The store deleted the row's objects; drop anything still pending.
    pendingImageDeletes.delete(selectedQuestion.value.id)
    toast.success(t.value.admin.stageQuestions.toastQuestionDeleted)
    if (
      expandedId.value === selectedQuestion.value.id ||
      selectedQuestion.value.id === draftCreatedId.value
    ) {
      expandedId.value = null
      isAdding.value = false
      draftCreatedId.value = null
    }
    showDeleteDialog.value = false
    selectedQuestion.value = null
    await loadQuestions()
  } finally {
    isDeleting.value = false
  }
}

async function handleBulkUploadComplete() {
  await loadQuestions()
  toast.success(t.value.admin.stageQuestions.toastBulkUploaded)
}

async function downloadTemplate() {
  try {
    if (curriculumStore.gradeLevels.length === 0) {
      await curriculumStore.fetchCurriculum()
    }
    await generateQuestionTemplate(curriculumStore.gradeLevels)
    toast.info(t.value.admin.stageQuestions.toastTemplateDownloaded)
  } catch (error) {
    console.error('Error downloading template:', error)
    toast.error(t.value.admin.stageQuestions.toastTemplateFailed)
  }
}
</script>

<template>
  <div>
    <div class="mb-4">
      <div class="flex items-center gap-3">
        <h2 class="text-sm font-semibold">{{ t.admin.stageQuestions.title }}</h2>
        <SaveStatusPill :status="saveStatus" />
      </div>
      <p class="text-sm text-muted-foreground">
        {{ t.admin.stageQuestions.subtitle(stage.name) }}
      </p>
    </div>

    <!-- Loading State (initial load only) -->
    <div
      v-if="isLoading && stageQuestions.length === 0"
      class="flex items-center justify-center py-12"
    >
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="stageQuestions.length === 0 && !isAdding"
      class="rounded-lg border border-dashed p-12 text-center"
    >
      <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <Plus class="size-6 text-muted-foreground" />
      </div>
      <h3 class="mt-4 text-lg font-medium">{{ t.admin.stageQuestions.noQuestions }}</h3>
      <p class="mt-2 text-sm text-muted-foreground">
        {{ t.admin.stageQuestions.noQuestionsDesc(stage.name) }}
      </p>
      <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Button @click="startAdd">
          <Plus class="mr-2 size-4" />
          {{ t.admin.stageQuestions.addQuestionBtn }}
        </Button>
        <Button variant="outline" @click="showBulkUploadDialog = true">
          <Upload class="mr-2 size-4" />
          {{ t.admin.stageQuestions.bulkUploadBtn }}
        </Button>
        <Button variant="outline" @click="downloadTemplate">
          <Download class="mr-2 size-4" />
          {{ t.admin.stageQuestions.templateBtn }}
        </Button>
      </div>
    </div>

    <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <!-- Left: search, actions, rows. Sticky on wide screens and scrolls on
           its own, so the editor can grow past the viewport while the list stays put. -->
      <div class="space-y-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" @click="startAdd">
            <Plus class="mr-2 size-4" />
            {{ t.admin.stageQuestions.addQuestionBtn }}
          </Button>
          <Button variant="outline" size="sm" @click="showBulkUploadDialog = true">
            <Upload class="mr-2 size-4" />
            {{ t.admin.stageQuestions.bulkUploadBtn }}
          </Button>
          <Button variant="outline" size="sm" @click="downloadTemplate">
            <Download class="mr-2 size-4" />
            {{ t.admin.stageQuestions.templateBtn }}
          </Button>
        </div>

        <div class="relative">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="search"
            :placeholder="t.shared.questionBankTable.searchPlaceholder"
            class="pl-9"
          />
        </div>

        <div class="space-y-2">
          <BankQuestionCard
            v-for="(question, index) in filteredQuestions"
            :key="question.id"
            :question="question"
            :stage-id="stage.id"
            :index="index"
            :expanded="false"
            :selected="selectedId === question.id"
            @select="expandedId = question.id"
          />
        </div>
      </div>

      <!-- Right: the editor — the new-question draft, or the selected question -->
      <div class="min-w-0">
        <BankQuestionCard
          v-if="isAdding && expandedId === 'draft'"
          key="draft"
          :question="null"
          :stage-id="stage.id"
          :index="0"
          expanded
          @created="handleDraftCreated"
          @change="handleChange"
          @image-orphaned="queueImageDelete"
          @remove="handleDraftRemove"
        />
        <BankQuestionCard
          v-else-if="activeQuestion"
          :key="activeQuestion.id"
          :question="activeQuestion"
          :stage-id="stage.id"
          :index="0"
          expanded
          @change="handleChange"
          @image-orphaned="queueImageDelete"
          @remove="askDelete(activeQuestion)"
        />
        <div
          v-else
          class="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground"
        >
          {{ t.staff.builder.selectQuestionHint }}
        </div>
      </div>
    </div>

    <!-- Bulk Upload Dialog (scoped to this stage) -->
    <QuestionBulkUploadDialog
      v-model:open="showBulkUploadDialog"
      :stage-id="stage.id"
      :stage-name="stage.name"
      @uploaded="handleBulkUploadComplete"
    />

    <!-- Delete Confirmation Dialog -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t.admin.stageQuestions.deleteQuestionTitle }}</DialogTitle>
          <DialogDescription>
            {{ t.admin.stageQuestions.deleteQuestionDesc }}
          </DialogDescription>
        </DialogHeader>

        <div v-if="selectedQuestion" class="py-4">
          <p class="text-sm text-muted-foreground">"{{ selectedQuestion.question }}"</p>
        </div>

        <DialogFooter>
          <Button variant="outline" :disabled="isDeleting" @click="showDeleteDialog = false">{{
            t.admin.stageQuestions.cancel
          }}</Button>
          <Button variant="destructive" :disabled="isDeleting" @click="handleDelete">
            <Loader2 v-if="isDeleting" class="mr-2 size-4 animate-spin" />
            {{ t.admin.stageQuestions.delete }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
