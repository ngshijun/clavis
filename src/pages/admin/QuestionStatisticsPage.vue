<script setup lang="ts">
import { ref, computed, h, onMounted } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { useQuestionsStore, type QuestionWithStats } from '@/stores/questions'
import { toast } from 'vue-sonner'
import { Search, Clock, ArrowUpDown, RefreshCw } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { QuestionPreviewDialog } from '@/components/admin'
import { useT } from '@/composables/useT'
import { useLanguageStore } from '@/stores/language'

const t = useT()
const languageStore = useLanguageStore()
const questionsStore = useQuestionsStore()

// Fetch statistics on mount
onMounted(async () => {
  await questionsStore.fetchQuestionStatistics()
  if (questionsStore.error) {
    toast.error(questionsStore.error)
  }
})

// Refresh statistics state
const isRefreshing = ref(false)

async function refreshStatistics(): Promise<void> {
  isRefreshing.value = true
  try {
    const { error } = await questionsStore.refreshQuestionStatistics()
    if (error) {
      toast.error(error)
      return
    }
    toast.success(t.value.admin.questionStatistics.toastRefreshed)
  } finally {
    isRefreshing.value = false
  }
}

const ALL_VALUE = '__all__'

const showPreviewDialog = ref(false)
const previewQuestion = ref<QuestionWithStats | null>(null)

// Helper to convert ALL_VALUE to undefined for store calls
const gradeLevelFilter = computed(() =>
  questionsStore.questionStatisticsFilters.gradeLevel === ALL_VALUE
    ? undefined
    : questionsStore.questionStatisticsFilters.gradeLevel,
)
const subjectFilter = computed(() =>
  questionsStore.questionStatisticsFilters.subject === ALL_VALUE
    ? undefined
    : questionsStore.questionStatisticsFilters.subject,
)
const topicFilter = computed(() =>
  questionsStore.questionStatisticsFilters.topic === ALL_VALUE
    ? undefined
    : questionsStore.questionStatisticsFilters.topic,
)
const subTopicFilter = computed(() =>
  questionsStore.questionStatisticsFilters.subTopic === ALL_VALUE
    ? undefined
    : questionsStore.questionStatisticsFilters.subTopic,
)

// Get available filter options
const availableGradeLevels = computed(() => questionsStore.getGradeLevels())
const availableSubjects = computed(() => questionsStore.getSubjects(gradeLevelFilter.value))
const availableTopics = computed(() =>
  questionsStore.getTopics(gradeLevelFilter.value, subjectFilter.value),
)
const availableSubTopics = computed(() =>
  questionsStore.getSubTopics(gradeLevelFilter.value, subjectFilter.value, topicFilter.value),
)

// Filter questions based on dropdown filters and search
const filteredQuestions = computed(() => {
  // First apply dropdown filters
  let filtered = questionsStore.getFilteredQuestionsWithStats(
    gradeLevelFilter.value,
    subjectFilter.value,
    topicFilter.value,
    subTopicFilter.value,
  )

  // Then apply search query
  const searchQuery = questionsStore.questionStatisticsFilters.search
  if (searchQuery) {
    const query = searchQuery.toLowerCase()
    filtered = filtered.filter(
      (q) =>
        q.question.toLowerCase().includes(query) ||
        q.gradeLevelName.toLowerCase().includes(query) ||
        q.subjectName.toLowerCase().includes(query) ||
        q.topicName.toLowerCase().includes(query) ||
        q.subTopicName.toLowerCase().includes(query),
    )
  }

  return filtered
})

// Format time display
function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

// Get color for correctness rate
function getCorrectnessColor(rate: number): string {
  if (rate >= 80) return 'text-green-600 dark:text-green-400'
  if (rate >= 60) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function getProgressColor(rate: number): string {
  if (rate >= 80) return 'bg-green-500'
  if (rate >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

// Column definitions
const columns: ColumnDef<QuestionWithStats>[] = [
  {
    accessorKey: 'question',
    header: () => t.value.admin.questionStatistics.questionCol,
    cell: ({ row }) => {
      const question = row.original.question
      return h(
        'div',
        { class: 'max-w-[10rem] lg:max-w-[30rem] truncate font-medium', title: question },
        question,
      )
    },
  },
  {
    accessorKey: 'type',
    header: () => t.value.admin.questionStatistics.typeCol,
    cell: ({ row }) => {
      const type = row.original.type
      const labels = t.value.admin.questionStatistics
      const config: Record<string, { label: string; color: string; bgColor: string }> = {
        mcq: {
          label: labels.typeMcq,
          color: 'text-blue-700 dark:text-blue-300',
          bgColor: 'bg-blue-100 dark:bg-blue-900/50',
        },
        mrq: {
          label: labels.typeMrq,
          color: 'text-purple-700 dark:text-purple-300',
          bgColor: 'bg-purple-100 dark:bg-purple-900/50',
        },
        short_answer: {
          label: labels.typeShortAnswer,
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
    accessorKey: 'gradeLevelName',
    header: () => t.value.admin.questionStatistics.gradeLevelCol,
  },
  {
    accessorKey: 'subjectName',
    header: () => t.value.admin.questionStatistics.subjectCol,
  },
  {
    accessorKey: 'topicName',
    header: () => t.value.admin.questionStatistics.topicCol,
  },
  {
    accessorKey: 'subTopicName',
    header: () => t.value.admin.questionStatistics.subTopicCol,
  },
  {
    id: 'attempts',
    accessorFn: (row) => row.stats.attempts,
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [
          t.value.admin.questionStatistics.attemptsCol,
          h(ArrowUpDown, { class: 'ml-2 size-4' }),
        ],
      )
    },
    cell: ({ row }) => {
      const attempts = row.original.stats.attempts
      return h('div', { class: 'text-center font-medium' }, attempts.toLocaleString())
    },
  },
  {
    id: 'correctnessRate',
    accessorFn: (row) => row.stats.correctnessRate,
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [
          t.value.admin.questionStatistics.correctnessRateCol,
          h(ArrowUpDown, { class: 'ml-2 size-4' }),
        ],
      )
    },
    cell: ({ row }) => {
      const rate = row.original.stats.correctnessRate
      return h('div', { class: 'flex items-center gap-2' }, [
        h('div', { class: 'w-16 h-2 bg-muted rounded-full overflow-hidden' }, [
          h('div', {
            class: `h-full ${getProgressColor(rate)}`,
            style: { width: `${rate}%` },
          }),
        ]),
        h('span', { class: `text-sm font-medium ${getCorrectnessColor(rate)}` }, `${rate}%`),
      ])
    },
  },
  {
    id: 'averageTime',
    accessorFn: (row) => row.stats.averageTimeSeconds,
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [
          t.value.admin.questionStatistics.avgTimeCol,
          h(ArrowUpDown, { class: 'ml-2 size-4' }),
        ],
      )
    },
    cell: ({ row }) => {
      const seconds = row.original.stats.averageTimeSeconds
      return h('div', { class: 'flex items-center gap-1 text-muted-foreground' }, [
        h(Clock, { class: 'size-3' }),
        h('span', { class: 'text-sm' }, formatTime(seconds)),
      ])
    },
  },
]

function handleRowClick(question: QuestionWithStats) {
  previewQuestion.value = question
  showPreviewDialog.value = true
}
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">{{ t.admin.questionStatistics.title }}</h1>
        <p class="text-muted-foreground">{{ t.admin.questionStatistics.subtitle }}</p>
      </div>
      <Button variant="outline" :disabled="isRefreshing" @click="refreshStatistics">
        <RefreshCw :class="['size-4 mr-2', { 'animate-spin': isRefreshing }]" />
        {{
          isRefreshing
            ? t.admin.questionStatistics.refreshingBtn
            : t.admin.questionStatistics.refreshBtn
        }}
      </Button>
    </div>

    <!-- Filters Row -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <!-- Search Bar -->
      <div class="relative w-[250px]">
        <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          :model-value="questionsStore.questionStatisticsFilters.search"
          :placeholder="t.admin.questionStatistics.searchPlaceholder"
          class="pl-9"
          @update:model-value="questionsStore.setQuestionStatisticsSearch(String($event))"
        />
      </div>

      <!-- Grade Level Selector -->
      <Select
        :key="languageStore.language"
        :model-value="questionsStore.questionStatisticsFilters.gradeLevel"
        @update:model-value="questionsStore.setQuestionStatisticsGradeLevel(String($event))"
      >
        <SelectTrigger class="w-[130px]">
          <SelectValue :placeholder="t.admin.questionStatistics.allGrades" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_VALUE">{{ t.admin.questionStatistics.allGrades }}</SelectItem>
          <SelectItem v-for="grade in availableGradeLevels" :key="grade" :value="grade">
            {{ grade }}
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- Subject Selector -->
      <Select
        :key="languageStore.language"
        :model-value="questionsStore.questionStatisticsFilters.subject"
        :disabled="questionsStore.questionStatisticsFilters.gradeLevel === ALL_VALUE"
        @update:model-value="questionsStore.setQuestionStatisticsSubject(String($event))"
      >
        <SelectTrigger class="w-[140px]">
          <SelectValue :placeholder="t.admin.questionStatistics.allSubjects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_VALUE">{{ t.admin.questionStatistics.allSubjects }}</SelectItem>
          <SelectItem v-for="subject in availableSubjects" :key="subject" :value="subject">
            {{ subject }}
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- Topic Selector -->
      <Select
        :key="languageStore.language"
        :model-value="questionsStore.questionStatisticsFilters.topic"
        :disabled="questionsStore.questionStatisticsFilters.subject === ALL_VALUE"
        @update:model-value="questionsStore.setQuestionStatisticsTopic(String($event))"
      >
        <SelectTrigger class="w-[140px]">
          <SelectValue :placeholder="t.admin.questionStatistics.allTopics" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_VALUE">{{ t.admin.questionStatistics.allTopics }}</SelectItem>
          <SelectItem v-for="topic in availableTopics" :key="topic" :value="topic">
            {{ topic }}
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- Sub-Topic Selector -->
      <Select
        :key="languageStore.language"
        :model-value="questionsStore.questionStatisticsFilters.subTopic"
        :disabled="questionsStore.questionStatisticsFilters.topic === ALL_VALUE"
        @update:model-value="questionsStore.setQuestionStatisticsSubTopic(String($event))"
      >
        <SelectTrigger class="w-[140px]">
          <SelectValue :placeholder="t.admin.questionStatistics.allSubTopics" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_VALUE">{{ t.admin.questionStatistics.allSubTopics }}</SelectItem>
          <SelectItem v-for="subTopic in availableSubTopics" :key="subTopic" :value="subTopic">
            {{ subTopic }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Data Table -->
    <DataTable
      :columns="columns"
      :data="filteredQuestions"
      :on-row-click="handleRowClick"
      :page-index="questionsStore.questionStatisticsPagination.pageIndex"
      :page-size="questionsStore.questionStatisticsPagination.pageSize"
      :on-page-index-change="questionsStore.setQuestionStatisticsPageIndex"
      :on-page-size-change="questionsStore.setQuestionStatisticsPageSize"
    />

    <!-- Question Preview Dialog -->
    <QuestionPreviewDialog v-model:open="showPreviewDialog" :question="previewQuestion" />
  </div>
</template>
