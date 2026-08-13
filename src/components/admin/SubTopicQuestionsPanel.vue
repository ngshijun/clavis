<script setup lang="ts">
import { ref, computed, h, watch, onMounted } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { useQuestionsStore, type Question } from '@/stores/questions'
import { useCurriculumStore, type SubTopic } from '@/stores/curriculum'
import { generateQuestionTemplate } from '@/lib/excel/questionExcel'
import {
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import QuestionAddDialog from './QuestionAddDialog.vue'
import QuestionEditDialog from './QuestionEditDialog.vue'
import QuestionPreviewDialog from './QuestionPreviewDialog.vue'
import QuestionBulkUploadDialog from './QuestionBulkUploadDialog.vue'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

/**
 * Question management for ONE sub-topic (decision 42). All CRUD and the bulk
 * Excel import are scoped to the sub-topic the admin drilled into on the
 * curriculum page — there is no global question bank anymore.
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

const showAddDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteDialog = ref(false)
const showPreviewDialog = ref(false)
const showBulkUploadDialog = ref(false)
const selectedQuestion = ref<Question | null>(null)
const editingQuestion = ref<Question | null>(null)
const previewQuestion = ref<Question | null>(null)
const isDeleting = ref(false)

async function loadQuestions() {
  isLoading.value = true
  const result = await questionsStore.fetchQuestionsBySubTopic(props.subTopic.id)
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
    loadQuestions()
  },
)

const filteredQuestions = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return subTopicQuestions.value
  return subTopicQuestions.value.filter((q) => q.question.toLowerCase().includes(query))
})

// Column definitions — no curriculum columns: everything here IS this sub-topic
const columns = computed<ColumnDef<Question>[]>(() => [
  {
    accessorKey: 'question',
    header: t.value.shared.questionBankTable.questionCol,
    cell: ({ row }) => {
      const question = row.original.question
      return h(
        'div',
        { class: 'max-w-[20rem] lg:max-w-[40rem] truncate font-medium', title: question },
        question,
      )
    },
  },
  {
    accessorKey: 'type',
    header: t.value.shared.questionBankTable.typeCol,
    cell: ({ row }) => {
      const type = row.original.type
      const config: Record<string, { label: string; color: string; bgColor: string }> = {
        mcq: {
          label: t.value.shared.questionBankTable.typeMultipleChoice,
          color: 'text-blue-700 dark:text-blue-300',
          bgColor: 'bg-blue-100 dark:bg-blue-900/50',
        },
        mrq: {
          label: t.value.shared.questionBankTable.typeMultipleResponse,
          color: 'text-purple-700 dark:text-purple-300',
          bgColor: 'bg-purple-100 dark:bg-purple-900/50',
        },
        short_answer: {
          label: t.value.shared.questionBankTable.typeShortAnswer,
          color: 'text-green-700 dark:text-green-300',
          bgColor: 'bg-green-100 dark:bg-green-900/50',
        },
      }
      const typeConfig = config[type] ?? config.mcq
      return h(
        Badge,
        { variant: 'secondary', class: `${typeConfig!.bgColor} ${typeConfig!.color}` },
        () => typeConfig!.label,
      )
    },
  },
  {
    id: 'tags',
    header: () => t.value.shared.questionBankTable.tagsCol,
    cell: ({ row }) => {
      const tags = row.original.tags
      if (tags.length === 0) {
        return h('span', { class: 'text-muted-foreground' }, '—')
      }
      return h(
        'div',
        { class: 'flex max-w-[16rem] flex-wrap gap-1' },
        tags.map((tag) => h(Badge, { key: tag.id, variant: 'outline' }, () => tag.name)),
      )
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const question = row.original
      return h(
        DropdownMenu,
        {},
        {
          default: () => [
            h(DropdownMenuTrigger, { asChild: true }, () =>
              h(
                Button,
                {
                  variant: 'ghost',
                  size: 'icon',
                  class: 'size-6',
                  onClick: (event: Event) => event.stopPropagation(),
                },
                () => h(MoreHorizontal, { class: 'size-4' }),
              ),
            ),
            h(DropdownMenuContent, { align: 'end' }, () => [
              h(
                DropdownMenuItem,
                {
                  onClick: (event: Event) => {
                    event.stopPropagation()
                    editingQuestion.value = question
                    showEditDialog.value = true
                  },
                },
                () => [h(Pencil, { class: 'mr-2 size-4' }), t.value.shared.questionBankTable.edit],
              ),
              h(
                DropdownMenuItem,
                {
                  class: 'text-destructive focus:text-destructive',
                  onClick: (event: Event) => {
                    event.stopPropagation()
                    selectedQuestion.value = question
                    showDeleteDialog.value = true
                  },
                },
                () => [
                  h(Trash2, { class: 'mr-2 size-4' }),
                  t.value.shared.questionBankTable.delete,
                ],
              ),
            ]),
          ],
        },
      )
    },
  },
])

function handleRowClick(question: Question) {
  previewQuestion.value = question
  showPreviewDialog.value = true
}

async function handleDelete() {
  if (!selectedQuestion.value) return

  isDeleting.value = true
  try {
    const result = await questionsStore.deleteQuestion(selectedQuestion.value.id)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(t.value.admin.subTopicQuestions.toastQuestionDeleted)
    showDeleteDialog.value = false
    selectedQuestion.value = null
    await loadQuestions()
  } finally {
    isDeleting.value = false
  }
}

async function handleSaved() {
  showAddDialog.value = false
  showEditDialog.value = false
  editingQuestion.value = null
  await loadQuestions()
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
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-sm font-semibold">{{ t.admin.subTopicQuestions.title }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ t.admin.subTopicQuestions.subtitle(subTopic.name) }}
        </p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" :disabled="isLoading" @click="downloadTemplate">
          <Download class="mr-2 size-4" />
          {{ t.admin.subTopicQuestions.templateBtn }}
        </Button>
        <Button variant="outline" :disabled="isLoading" @click="showBulkUploadDialog = true">
          <Upload class="mr-2 size-4" />
          {{ t.admin.subTopicQuestions.bulkUploadBtn }}
        </Button>
        <Button :disabled="isLoading" @click="showAddDialog = true">
          <Plus class="mr-2 size-4" />
          {{ t.admin.subTopicQuestions.addQuestionBtn }}
        </Button>
      </div>
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
      v-else-if="subTopicQuestions.length === 0"
      class="rounded-lg border border-dashed p-12 text-center"
    >
      <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <Plus class="size-6 text-muted-foreground" />
      </div>
      <h3 class="mt-4 text-lg font-medium">{{ t.admin.subTopicQuestions.noQuestions }}</h3>
      <p class="mt-2 text-sm text-muted-foreground">
        {{ t.admin.subTopicQuestions.noQuestionsDesc(subTopic.name) }}
      </p>
      <Button class="mt-4" @click="showAddDialog = true">
        <Plus class="mr-2 size-4" />
        {{ t.admin.subTopicQuestions.addQuestionBtn }}
      </Button>
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

      <!-- Data Table -->
      <DataTable :columns="columns" :data="filteredQuestions" :on-row-click="handleRowClick" />
    </template>

    <!-- Add Question Dialog (scoped to this sub-topic) -->
    <QuestionAddDialog
      v-model:open="showAddDialog"
      :sub-topic-id="subTopic.id"
      @save="handleSaved"
    />

    <!-- Edit Question Dialog -->
    <QuestionEditDialog
      v-model:open="showEditDialog"
      :question="editingQuestion"
      @save="handleSaved"
    />

    <!-- Question Preview Dialog -->
    <QuestionPreviewDialog v-model:open="showPreviewDialog" :question="previewQuestion" />

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
