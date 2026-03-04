<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useQuestionsStore, type Question } from '@/stores/questions'
import { useCurriculumStore } from '@/stores/curriculum'
import { Plus, Upload, Loader2, Download, FileDown } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  QuestionAddDialog,
  QuestionEditDialog,
  QuestionPreviewDialog,
  QuestionBulkUploadDialog,
  QuestionBankTable,
} from '@/components/admin'
import { toast } from 'vue-sonner'
import { generateQuestionTemplate, exportQuestionsToExcel } from '@/lib/excel/questionExcel'

const questionsStore = useQuestionsStore()
const curriculumStore = useCurriculumStore()

const showAddDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteDialog = ref(false)
const showPreviewDialog = ref(false)
const showBulkUploadDialog = ref(false)
const showExportDialog = ref(false)
const selectedQuestion = ref<Question | null>(null)
const editingQuestion = ref<Question | null>(null)
const previewQuestion = ref<Question | null>(null)
const isDeleting = ref(false)
const isExporting = ref(false)

// Fetch first page of questions on mount (server-side pagination)
onMounted(async () => {
  await questionsStore.fetchQuestionBankPage()
})

const totalFilteredCount = computed(() => questionsStore.serverTotalCount)

function openAddDialog() {
  selectedQuestion.value = null
  showAddDialog.value = true
}

function handleEdit(question: Question) {
  editingQuestion.value = question
  showEditDialog.value = true
}

function handleDeleteRequest(question: Question) {
  selectedQuestion.value = question
  showDeleteDialog.value = true
}

function handlePreview(question: Question) {
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
    toast.success('Question deleted successfully')
    showDeleteDialog.value = false
    selectedQuestion.value = null
  } finally {
    isDeleting.value = false
  }
}

async function handleSave() {
  showAddDialog.value = false
  selectedQuestion.value = null
}

async function handleEditSave() {
  showEditDialog.value = false
  editingQuestion.value = null
}

async function handleBulkUploadComplete() {
  await questionsStore.fetchQuestionBankPage()
  toast.success('Questions uploaded successfully')
}

async function downloadTemplate() {
  try {
    if (curriculumStore.gradeLevels.length === 0) {
      await curriculumStore.fetchCurriculum()
    }
    await generateQuestionTemplate(curriculumStore.gradeLevels)
    toast.info('Template downloaded')
  } catch (error) {
    console.error('Error downloading template:', error)
    toast.error('Failed to download template')
  }
}

// Get export summary for confirmation dialog
const exportSummary = computed(() => {
  const ALL_VALUE = '__all__'
  const filters: string[] = []
  const f = questionsStore.questionBankFilters
  if (f.gradeLevel !== ALL_VALUE) filters.push(`Grade: ${f.gradeLevel}`)
  if (f.subject !== ALL_VALUE) filters.push(`Subject: ${f.subject}`)
  if (f.topic !== ALL_VALUE) filters.push(`Topic: ${f.topic}`)
  if (f.subTopic !== ALL_VALUE) filters.push(`Sub-Topic: ${f.subTopic}`)
  if (f.search) filters.push(`Search: "${f.search}"`)
  return {
    filters: filters.length > 0 ? filters : ['All questions (no filters applied)'],
    count: totalFilteredCount.value,
    isFiltered: filters.length > 0,
  }
})

function openExportDialog() {
  if (totalFilteredCount.value === 0) {
    toast.warning('No questions to export')
    return
  }
  showExportDialog.value = true
}

async function confirmExport() {
  showExportDialog.value = false
  isExporting.value = true
  try {
    // Fetch ALL matching questions for export (not just current page)
    const allQuestions = await questionsStore.fetchAllFilteredQuestions()
    await exportQuestionsToExcel(allQuestions, async (imagePath: string) => {
      try {
        const url = questionsStore.getQuestionImageUrl(imagePath)
        if (!url) return null

        const response = await fetch(url)
        if (!response.ok) return null

        const blob = await response.blob()
        return new Promise<string | null>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => {
            const base64 = reader.result as string
            const base64Data = base64.split(',')[1]
            resolve(base64Data || null)
          }
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(blob)
        })
      } catch (err) {
        console.error('Failed to convert image to base64:', err)
        return null
      }
    })
    toast.info(`Exported ${allQuestions.length} questions`)
  } catch (error) {
    console.error('Error exporting questions:', error)
    toast.error('Failed to export questions')
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Question Bank</h1>
        <p class="text-muted-foreground">Manage your question library.</p>
      </div>
      <div class="flex gap-2">
        <Button
          variant="outline"
          :disabled="questionsStore.serverIsLoading"
          @click="downloadTemplate"
        >
          <Download class="mr-2 size-4" />
          Template
        </Button>
        <Button
          variant="outline"
          :disabled="questionsStore.serverIsLoading || isExporting || totalFilteredCount === 0"
          @click="openExportDialog"
        >
          <Loader2 v-if="isExporting" class="mr-2 size-4 animate-spin" />
          <FileDown v-else class="mr-2 size-4" />
          Export
        </Button>
        <Button
          variant="outline"
          :disabled="questionsStore.serverIsLoading"
          @click="showBulkUploadDialog = true"
        >
          <Upload class="mr-2 size-4" />
          Bulk Upload
        </Button>
        <Button :disabled="questionsStore.serverIsLoading" @click="openAddDialog">
          <Plus class="mr-2 size-4" />
          Add Question
        </Button>
      </div>
    </div>

    <!-- Loading State (initial load only) -->
    <div
      v-if="questionsStore.serverIsLoading && questionsStore.serverQuestions.length === 0"
      class="flex items-center justify-center py-12"
    >
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <QuestionBankTable
      v-else
      @edit="handleEdit"
      @delete="handleDeleteRequest"
      @preview="handlePreview"
    />

    <!-- Add Question Dialog -->
    <QuestionAddDialog v-model:open="showAddDialog" @save="handleSave" />

    <!-- Edit Question Dialog -->
    <QuestionEditDialog
      v-model:open="showEditDialog"
      :question="editingQuestion"
      @save="handleEditSave"
    />

    <!-- Question Preview Dialog -->
    <QuestionPreviewDialog v-model:open="showPreviewDialog" :question="previewQuestion" />

    <!-- Bulk Upload Dialog -->
    <QuestionBulkUploadDialog
      v-model:open="showBulkUploadDialog"
      @uploaded="handleBulkUploadComplete"
    />

    <!-- Delete Confirmation Dialog -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Question</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this question? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div v-if="selectedQuestion" class="py-4">
          <p class="text-sm text-muted-foreground">"{{ selectedQuestion.question }}"</p>
        </div>

        <DialogFooter>
          <Button variant="outline" :disabled="isDeleting" @click="showDeleteDialog = false"
            >Cancel</Button
          >
          <Button variant="destructive" :disabled="isDeleting" @click="handleDelete">
            <Loader2 v-if="isDeleting" class="mr-2 size-4 animate-spin" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Export Confirmation Dialog -->
    <Dialog v-model:open="showExportDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Questions</DialogTitle>
          <DialogDescription>
            You are about to export the following questions to an Excel file.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-3 py-4">
          <div class="rounded-lg border bg-muted/50 p-3">
            <p class="text-sm font-medium">Filters Applied:</p>
            <ul class="mt-1 list-inside list-disc text-sm text-muted-foreground">
              <li v-for="filter in exportSummary.filters" :key="filter">{{ filter }}</li>
            </ul>
          </div>
          <p class="text-sm">
            <span class="font-medium">{{ exportSummary.count }}</span> question(s) will be exported.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showExportDialog = false">Cancel</Button>
          <Button @click="confirmExport">
            <FileDown class="mr-2 size-4" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
