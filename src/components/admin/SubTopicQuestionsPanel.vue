<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useQuestionsStore, type Question, type UpdateQuestionInput } from '@/stores/questions'
import { useCurriculumStore, type SubTopic } from '@/stores/curriculum'
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
 * Question management for ONE sub-topic (decision 42), in the Google-Forms
 * card style (P10c): a stack of `BankQuestionCard`s that expand in place for
 * editing with background autosave, plus a floating action toolbar (add ·
 * bulk upload · template). All CRUD and the bulk Excel import stay scoped to
 * the sub-topic the admin drilled into.
 */
const props = defineProps<{
  subTopic: SubTopic
}>()

const t = useT()
const questionsStore = useQuestionsStore()
const curriculumStore = useCurriculumStore()

const subTopicQuestions = ref<Question[]>([])
const isLoading = ref(false)
const search = ref('')

/** One card expanded at a time; 'draft' is the unsaved new-question card. */
const expandedId = ref<string | null>(null)
/** True while the new-question draft card is shown. */
const isAdding = ref(false)
/** Set once the draft card inserts its row (hidden from the list until the draft closes). */
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
  const result = await questionsStore.fetchBankQuestionsBySubTopic(props.subTopic.id)
  isLoading.value = false

  if (result.error) {
    toast.error(result.error)
    return
  }
  subTopicQuestions.value = result.questions
  // Keep the curriculum tree's question count in sync with what we just loaded
  const subTopic = curriculumStore.getSubTopicById(props.subTopic.id)
  if (subTopic) {
    subTopic.questionCount = result.questions.length
  }
}

onMounted(loadQuestions)
watch(
  () => props.subTopic.id,
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
  const base = query
    ? subTopicQuestions.value.filter((q) => q.question.toLowerCase().includes(query))
    : subTopicQuestions.value
  // While the draft card is open its freshly-inserted row is rendered BY the
  // draft card — hide the duplicate until the draft closes.
  if (isAdding.value && draftCreatedId.value) {
    return base.filter((q) => q.id !== draftCreatedId.value)
  }
  return base
})

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
  const question = subTopicQuestions.value.find((q) => q.id === id)
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
      const target = subTopicQuestions.value.find((q) => q.id === id)
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
    const created = subTopicQuestions.value.find((q) => q.id === draftCreatedId.value)
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
    toast.success(t.value.admin.subTopicQuestions.toastQuestionDeleted)
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
  toast.success(t.value.admin.subTopicQuestions.toastBulkUploaded)
}

async function downloadTemplate() {
  try {
    if (curriculumStore.gradeLevels.length === 0) {
      await curriculumStore.fetchCurriculum()
    }
    await generateQuestionTemplate(curriculumStore.gradeLevels)
    toast.info(t.value.admin.subTopicQuestions.toastTemplateDownloaded)
  } catch (error) {
    console.error('Error downloading template:', error)
    toast.error(t.value.admin.subTopicQuestions.toastTemplateFailed)
  }
}

// ── floating toolbar anchoring (P10b pattern) ──────────────────────────────

const containerEl = ref<HTMLElement | null>(null)
type CardInstance = InstanceType<typeof BankQuestionCard>
const cardRefs = new Map<string, CardInstance>()

function setCardRef(id: string, instance: unknown) {
  if (instance) cardRefs.set(id, instance as CardInstance)
  else cardRefs.delete(id)
}

const toolbarTop = ref(0)

function updateToolbarTop() {
  const activeId = expandedId.value
  const active = activeId ? cardRefs.get(activeId) : undefined
  const el = (active?.$el ?? null) as HTMLElement | null
  if (!el || !containerEl.value) {
    toolbarTop.value = 0
    return
  }
  const max = Math.max(0, containerEl.value.offsetHeight - 40)
  toolbarTop.value = Math.min(el.offsetTop, max)
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  resizeObserver = new ResizeObserver(() => updateToolbarTop())
  if (containerEl.value) resizeObserver.observe(containerEl.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch([expandedId, filteredQuestions], () => void nextTick(updateToolbarTop), {
  deep: false,
  immediate: true,
})
</script>

<template>
  <div>
    <div class="mb-4">
      <div class="flex items-center gap-3">
        <h2 class="text-sm font-semibold">{{ t.admin.subTopicQuestions.title }}</h2>
        <SaveStatusPill :status="saveStatus" />
      </div>
      <p class="text-sm text-muted-foreground">
        {{ t.admin.subTopicQuestions.subtitle(subTopic.name) }}
      </p>
    </div>

    <!-- Loading State (initial load only) -->
    <div
      v-if="isLoading && subTopicQuestions.length === 0"
      class="flex items-center justify-center py-12"
    >
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="subTopicQuestions.length === 0 && !isAdding"
      class="rounded-lg border border-dashed p-12 text-center"
    >
      <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <Plus class="size-6 text-muted-foreground" />
      </div>
      <h3 class="mt-4 text-lg font-medium">{{ t.admin.subTopicQuestions.noQuestions }}</h3>
      <p class="mt-2 text-sm text-muted-foreground">
        {{ t.admin.subTopicQuestions.noQuestionsDesc(subTopic.name) }}
      </p>
      <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Button @click="startAdd">
          <Plus class="mr-2 size-4" />
          {{ t.admin.subTopicQuestions.addQuestionBtn }}
        </Button>
        <Button variant="outline" @click="showBulkUploadDialog = true">
          <Upload class="mr-2 size-4" />
          {{ t.admin.subTopicQuestions.bulkUploadBtn }}
        </Button>
        <Button variant="outline" @click="downloadTemplate">
          <Download class="mr-2 size-4" />
          {{ t.admin.subTopicQuestions.templateBtn }}
        </Button>
      </div>
    </div>

    <template v-else>
      <!-- Search -->
      <div class="relative mb-4 w-[250px]">
        <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          v-model="search"
          :placeholder="t.shared.questionBankTable.searchPlaceholder"
          class="pl-9"
        />
      </div>

      <!-- Card stack + floating toolbar (Forms model) -->
      <div ref="containerEl" class="relative lg:pr-14">
        <div class="space-y-3">
          <BankQuestionCard
            v-if="isAdding"
            key="draft"
            :ref="(instance) => setCardRef('draft', instance)"
            :question="null"
            :sub-topic-id="subTopic.id"
            :index="0"
            :expanded="expandedId === 'draft'"
            @select="expandedId = 'draft'"
            @created="handleDraftCreated"
            @change="handleChange"
            @image-orphaned="queueImageDelete"
            @remove="handleDraftRemove"
          />
          <BankQuestionCard
            v-for="(question, index) in filteredQuestions"
            :key="question.id"
            :ref="(instance) => setCardRef(question.id, instance)"
            :question="question"
            :sub-topic-id="subTopic.id"
            :index="isAdding ? index + 1 : index"
            :expanded="expandedId === question.id"
            @select="expandedId = question.id"
            @change="handleChange"
            @image-orphaned="queueImageDelete"
            @remove="askDelete(question)"
          />
        </div>

        <!-- Floating action toolbar — moves with the active card -->
        <div
          class="absolute right-0 hidden w-11 flex-col items-center gap-1 rounded-lg border bg-card p-1 shadow-sm transition-[top] duration-200 lg:flex"
          :style="{ top: `${toolbarTop}px` }"
        >
          <Button
            variant="ghost"
            size="icon"
            class="size-8"
            :aria-label="t.admin.subTopicQuestions.addQuestionBtn"
            :title="t.admin.subTopicQuestions.addQuestionBtn"
            @click="startAdd"
          >
            <Plus class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-8"
            :aria-label="t.admin.subTopicQuestions.bulkUploadBtn"
            :title="t.admin.subTopicQuestions.bulkUploadBtn"
            @click="showBulkUploadDialog = true"
          >
            <Upload class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-8"
            :aria-label="t.admin.subTopicQuestions.templateBtn"
            :title="t.admin.subTopicQuestions.templateBtn"
            @click="downloadTemplate"
          >
            <Download class="size-4" />
          </Button>
        </div>
      </div>

      <!-- Small screens: the same actions as a static bar under the list -->
      <div class="mt-3 flex flex-wrap items-center gap-2 lg:hidden">
        <Button variant="outline" size="sm" @click="startAdd">
          <Plus class="mr-2 size-4" />
          {{ t.admin.subTopicQuestions.addQuestionBtn }}
        </Button>
        <Button variant="outline" size="sm" @click="showBulkUploadDialog = true">
          <Upload class="mr-2 size-4" />
          {{ t.admin.subTopicQuestions.bulkUploadBtn }}
        </Button>
        <Button variant="outline" size="sm" @click="downloadTemplate">
          <Download class="mr-2 size-4" />
          {{ t.admin.subTopicQuestions.templateBtn }}
        </Button>
      </div>
    </template>

    <!-- Bulk Upload Dialog (scoped to this sub-topic) -->
    <QuestionBulkUploadDialog
      v-model:open="showBulkUploadDialog"
      :sub-topic-id="subTopic.id"
      :sub-topic-name="subTopic.name"
      @uploaded="handleBulkUploadComplete"
    />

    <!-- Delete Confirmation Dialog -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t.admin.subTopicQuestions.deleteQuestionTitle }}</DialogTitle>
          <DialogDescription>
            {{ t.admin.subTopicQuestions.deleteQuestionDesc }}
          </DialogDescription>
        </DialogHeader>

        <div v-if="selectedQuestion" class="py-4">
          <p class="text-sm text-muted-foreground">"{{ selectedQuestion.question }}"</p>
        </div>

        <DialogFooter>
          <Button variant="outline" :disabled="isDeleting" @click="showDeleteDialog = false">{{
            t.admin.subTopicQuestions.cancel
          }}</Button>
          <Button variant="destructive" :disabled="isDeleting" @click="handleDelete">
            <Loader2 v-if="isDeleting" class="mr-2 size-4 animate-spin" />
            {{ t.admin.subTopicQuestions.delete }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
