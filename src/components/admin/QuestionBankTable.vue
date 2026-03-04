<script setup lang="ts">
import { computed, h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { useQuestionsStore, type Question } from '@/stores/questions'
import { Search, Trash2, MoreHorizontal, Pencil } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const emit = defineEmits<{
  edit: [question: Question]
  delete: [question: Question]
  preview: [question: Question]
}>()

const questionsStore = useQuestionsStore()

const ALL_VALUE = '__all__'

// Helper to convert ALL_VALUE to undefined for store calls
const gradeLevelFilter = computed(() =>
  questionsStore.questionBankFilters.gradeLevel === ALL_VALUE
    ? undefined
    : questionsStore.questionBankFilters.gradeLevel,
)
const subjectFilter = computed(() =>
  questionsStore.questionBankFilters.subject === ALL_VALUE
    ? undefined
    : questionsStore.questionBankFilters.subject,
)
const topicFilter = computed(() =>
  questionsStore.questionBankFilters.topic === ALL_VALUE
    ? undefined
    : questionsStore.questionBankFilters.topic,
)
const subTopicFilter = computed(() =>
  questionsStore.questionBankFilters.subTopic === ALL_VALUE
    ? undefined
    : questionsStore.questionBankFilters.subTopic,
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

// Server-side data from the store
const serverQuestions = computed(() => questionsStore.serverQuestions)

// Column definitions
const columns: ColumnDef<Question>[] = [
  {
    accessorKey: 'question',
    header: 'Question',
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
    header: 'Type',
    cell: ({ row }) => {
      const type = row.original.type
      const config: Record<string, { label: string; color: string; bgColor: string }> = {
        mcq: {
          label: 'Multiple Choice',
          color: 'text-blue-700 dark:text-blue-300',
          bgColor: 'bg-blue-100 dark:bg-blue-900/50',
        },
        mrq: {
          label: 'Multiple Response',
          color: 'text-purple-700 dark:text-purple-300',
          bgColor: 'bg-purple-100 dark:bg-purple-900/50',
        },
        short_answer: {
          label: 'Short Answer',
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
    header: 'Grade Level',
  },
  {
    accessorKey: 'subjectName',
    header: 'Subject',
  },
  {
    accessorKey: 'topicName',
    header: 'Topic',
  },
  {
    accessorKey: 'subTopicName',
    header: 'Sub-Topic',
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
                    emit('edit', question)
                  },
                },
                () => [h(Pencil, { class: 'mr-2 size-4' }), 'Edit'],
              ),
              h(
                DropdownMenuItem,
                {
                  class: 'text-destructive focus:text-destructive',
                  onClick: (event: Event) => {
                    event.stopPropagation()
                    emit('delete', question)
                  },
                },
                () => [h(Trash2, { class: 'mr-2 size-4' }), 'Delete'],
              ),
            ]),
          ],
        },
      )
    },
  },
]

function handleRowClick(question: Question) {
  emit('preview', question)
}

defineExpose({ filteredQuestions: serverQuestions })
</script>

<template>
  <!-- Filters Row -->
  <div class="mb-4 flex flex-wrap items-center gap-3">
    <!-- Search Bar -->
    <div class="relative w-[250px]">
      <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        :model-value="questionsStore.questionBankFilters.search"
        placeholder="Search questions..."
        class="pl-9"
        @update:model-value="questionsStore.setQuestionBankSearch(String($event))"
      />
    </div>

    <!-- Grade Level Selector -->
    <Select
      :model-value="questionsStore.questionBankFilters.gradeLevel"
      @update:model-value="questionsStore.setQuestionBankGradeLevel(String($event))"
    >
      <SelectTrigger class="w-[130px]">
        <SelectValue placeholder="All Grades" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL_VALUE">All Grades</SelectItem>
        <SelectItem v-for="grade in availableGradeLevels" :key="grade" :value="grade">
          {{ grade }}
        </SelectItem>
      </SelectContent>
    </Select>

    <!-- Subject Selector -->
    <Select
      :model-value="questionsStore.questionBankFilters.subject"
      :disabled="questionsStore.questionBankFilters.gradeLevel === ALL_VALUE"
      @update:model-value="questionsStore.setQuestionBankSubject(String($event))"
    >
      <SelectTrigger class="w-[140px]">
        <SelectValue placeholder="All Subjects" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL_VALUE">All Subjects</SelectItem>
        <SelectItem v-for="subject in availableSubjects" :key="subject" :value="subject">
          {{ subject }}
        </SelectItem>
      </SelectContent>
    </Select>

    <!-- Topic Selector -->
    <Select
      :model-value="questionsStore.questionBankFilters.topic"
      :disabled="questionsStore.questionBankFilters.subject === ALL_VALUE"
      @update:model-value="questionsStore.setQuestionBankTopic(String($event))"
    >
      <SelectTrigger class="w-[140px]">
        <SelectValue placeholder="All Topics" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL_VALUE">All Topics</SelectItem>
        <SelectItem v-for="topic in availableTopics" :key="topic" :value="topic">
          {{ topic }}
        </SelectItem>
      </SelectContent>
    </Select>

    <!-- Sub-Topic Selector -->
    <Select
      :model-value="questionsStore.questionBankFilters.subTopic"
      :disabled="questionsStore.questionBankFilters.topic === ALL_VALUE"
      @update:model-value="questionsStore.setQuestionBankSubTopic(String($event))"
    >
      <SelectTrigger class="w-[140px]">
        <SelectValue placeholder="All Sub-Topics" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL_VALUE">All Sub-Topics</SelectItem>
        <SelectItem v-for="subTopic in availableSubTopics" :key="subTopic" :value="subTopic">
          {{ subTopic }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>

  <!-- Data Table -->
  <DataTable
    :columns="columns"
    :data="serverQuestions"
    :on-row-click="handleRowClick"
    :page-index="questionsStore.questionBankPagination.pageIndex"
    :page-size="questionsStore.questionBankPagination.pageSize"
    :on-page-index-change="questionsStore.setQuestionBankPageIndex"
    :on-page-size-change="questionsStore.setQuestionBankPageSize"
    :manual-pagination="true"
    :row-count="questionsStore.serverTotalCount"
  />
</template>
