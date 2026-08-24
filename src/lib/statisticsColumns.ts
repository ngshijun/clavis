import { h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { formatDuration, formatDateTime } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { ArrowUpDown } from 'lucide-vue-next'
import type { DateRangeFilter } from '@/lib/sessionFilters'
import { useLanguageStore } from '@/stores/language'

export const ALL_VALUE = '__all__'

/** Convert ALL_VALUE sentinel to undefined for store filter calls. */
export function resolveFilterValue(value: string): string | undefined {
  return value === ALL_VALUE ? undefined : value
}

export function getDateRangeOptions(): { value: DateRangeFilter; label: string }[] {
  const store = useLanguageStore()
  const labels = store.t.shared.statsFilterBar.dateRangeOptions
  return [
    { value: 'today', label: labels.today },
    { value: 'last7days', label: labels.last7Days },
    { value: 'last30days', label: labels.last30Days },
    { value: 'alltime', label: labels.allTime },
  ]
}

export interface PracticeSessionRow {
  completedAt: string | null
  gradeLevelName: string
  subjectName: string
  topicName: string
  subTopicName: string
  score: number | null
  totalQuestions: number
  correctAnswers: number
  durationSeconds: number | null
}

export function createPracticeHistoryColumns<T extends PracticeSessionRow>(): ColumnDef<T>[] {
  const store = useLanguageStore()
  const headers = store.t.shared.statsFilterBar.practiceHistoryColumns

  return [
    {
      accessorKey: 'completedAt',
      header: ({ column }) => {
        return h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [headers.completedAt, h(ArrowUpDown, { class: 'ml-2 size-4' })],
        )
      },
      cell: ({ row }) => {
        const completedAt = row.original.completedAt
        if (!completedAt) {
          return h('div', { class: 'text-muted-foreground' }, '-')
        }
        return h('div', { class: 'text-sm' }, formatDateTime(completedAt))
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.completedAt
        const b = rowB.original.completedAt
        if (!a && !b) return 0
        if (!a) return 1
        if (!b) return -1
        return new Date(a).getTime() - new Date(b).getTime()
      },
    },
    // Grade and subject are fixed by the selected classroom (decision 79), so
    // they would repeat identically on every row — the table starts at topic.
    {
      accessorKey: 'topicName',
      header: headers.topic,
      cell: ({ row }) => h('div', {}, row.original.topicName),
    },
    {
      accessorKey: 'subTopicName',
      header: headers.subTopic,
      cell: ({ row }) => h('div', {}, row.original.subTopicName),
    },
    {
      accessorKey: 'score',
      header: ({ column }) => {
        return h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [headers.score, h(ArrowUpDown, { class: 'ml-2 size-4' })],
        )
      },
      cell: ({ row }) => {
        const score = row.original.score
        const correct = row.original.correctAnswers
        const total = row.original.totalQuestions

        if (score === null) {
          return h('div', { class: 'text-muted-foreground' }, '-')
        }

        const colorClass =
          score >= 80 ? 'text-green-600' : score >= 60 ? 'text-yellow-600' : 'text-red-600'

        return h('div', { class: colorClass }, `${score}% (${correct}/${total})`)
      },
    },
    {
      accessorKey: 'durationSeconds',
      header: ({ column }) => {
        return h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [headers.duration, h(ArrowUpDown, { class: 'ml-2 size-4' })],
        )
      },
      cell: ({ row }) => {
        const seconds = row.original.durationSeconds
        if (seconds == null) {
          return h('div', { class: 'text-muted-foreground' }, '-')
        }
        return h('div', {}, formatDuration(seconds))
      },
    },
  ]
}
