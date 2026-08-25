import { h } from 'vue'
import type { ColumnDef, HeaderContext } from '@tanstack/vue-table'
import type { StudentRollup } from '@/stores/staff-dashboard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowUpDown, TriangleAlert } from 'lucide-vue-next'
import { formatTimeAgo } from '@/lib/date'
import { useLanguageStore } from '@/stores/language'

/** `—` rather than `0%`: no data is not a score of nothing. */
export function formatRollupPercent(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

export function sortableHeader<TData>(label: () => string) {
  return ({ column }: HeaderContext<TData, unknown>) =>
    h(
      Button,
      {
        variant: 'ghost',
        onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
      },
      () => [label(), h(ArrowUpDown, { class: 'ml-2 size-4' })],
    )
}

/**
 * One row per student: mastery, practice reach, assessment completion and the
 * at-risk flag. Shared by the manager's institution-wide roster and by a
 * classroom's own Students page (decision 87), which show the same measures
 * over different populations.
 */
export function createStudentRollupColumns(): ColumnDef<StudentRollup>[] {
  const store = useLanguageStore()
  const labels = () => store.t.staff.dashboard.students

  return [
    {
      accessorKey: 'studentName',
      header: sortableHeader<StudentRollup>(() => labels().nameCol),
      cell: ({ row }) => h('div', { class: 'font-medium' }, row.original.studentName),
    },
    {
      accessorKey: 'username',
      header: () => labels().usernameCol,
      cell: ({ row }) =>
        h('div', { class: 'font-mono text-muted-foreground' }, row.original.username ?? '-'),
    },
    {
      accessorKey: 'mapMastery',
      header: sortableHeader<StudentRollup>(() => labels().masteryCol),
      cell: ({ row }) =>
        h('div', { class: 'tabular-nums' }, formatRollupPercent(row.original.mapMastery)),
    },
    {
      id: 'subTopics',
      header: () => labels().subTopicsCol,
      cell: ({ row }) =>
        h(
          'div',
          { class: 'tabular-nums' },
          `${row.original.subTopicsCompleted}/${row.original.subTopicsAttempted}`,
        ),
    },
    {
      accessorKey: 'lastPracticeAt',
      header: sortableHeader<StudentRollup>(() => labels().lastPracticeCol),
      cell: ({ row }) =>
        row.original.lastPracticeAt
          ? h('div', {}, formatTimeAgo(row.original.lastPracticeAt, store.t.shared.timeAgo))
          : h('div', { class: 'text-muted-foreground' }, labels().never),
    },
    {
      id: 'assessments',
      header: () => labels().assessmentsCol,
      cell: ({ row }) =>
        h(
          'div',
          { class: 'tabular-nums' },
          `${row.original.completedCount}/${row.original.assignedCount}`,
        ),
    },
    {
      accessorKey: 'avgAssessmentScore',
      header: sortableHeader<StudentRollup>(() => labels().avgScoreCol),
      cell: ({ row }) =>
        h('div', { class: 'tabular-nums' }, formatRollupPercent(row.original.avgAssessmentScore)),
    },
    {
      accessorKey: 'atRisk',
      header: sortableHeader<StudentRollup>(() => labels().statusCol),
      cell: ({ row }) =>
        row.original.atRisk
          ? h(
              Badge,
              {
                variant: 'secondary',
                class: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
              },
              () => [h(TriangleAlert, { class: 'mr-1 size-3' }), labels().atRisk],
            )
          : h(Badge, { variant: 'secondary' }, () => labels().onTrack),
    },
  ]
}
