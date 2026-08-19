<script setup lang="ts">
import { computed, h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { usePracticeHistoryStore } from '@/stores/practice-history'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { ArrowUpDown, Play, ListTodo } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { formatDateTime } from '@/lib/date'
import { useT } from '@/composables/useT'

const practiceStore = usePracticeHistoryStore()
const router = useRouter()
const t = useT()

interface InProgressRow {
  id: string
  createdAt: string
  topicName: string
  subTopicName: string
  answeredQuestions: number
  totalQuestions: number
  correctAnswers: number
}

// Filter for in-progress sessions only
const inProgressData = computed<InProgressRow[]>(() => {
  return practiceStore.studentHistory
    .filter((session) => !session.completedAt)
    .map((session) => {
      return {
        id: session.id,
        createdAt: session.createdAt ?? new Date().toISOString(),
        topicName: session.topicName,
        subTopicName: session.subTopicName,
        answeredQuestions: session.answerCount,
        totalQuestions: session.totalQuestions,
        correctAnswers: session.correctAnswers,
      }
    })
})

function handleContinue(sessionId: string) {
  // Navigate to practice quiz page to continue the session
  router.push(`/student/practice/quiz?sessionId=${sessionId}`)
}

const columns = computed<ColumnDef<InProgressRow>[]>(() => [
  {
    accessorKey: 'createdAt',
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [
          t.value.shared.inProgressSessionsCard.startedCol,
          h(ArrowUpDown, { class: 'ml-2 size-4' }),
        ],
      )
    },
    cell: ({ row }) => {
      return h('div', { class: 'text-sm' }, formatDateTime(row.original.createdAt))
    },
  },
  // Subject is fixed by the selected classroom (decision 79) — it would be the
  // same value on every row, so the table starts at topic.
  {
    accessorKey: 'topicName',
    header: t.value.shared.inProgressSessionsCard.topicCol,
    cell: ({ row }) => {
      return h('div', {}, row.original.topicName)
    },
  },
  {
    accessorKey: 'subTopicName',
    header: t.value.shared.inProgressSessionsCard.subTopicCol,
    cell: ({ row }) => {
      return h('div', {}, row.original.subTopicName)
    },
  },
  {
    accessorKey: 'progress',
    header: t.value.shared.inProgressSessionsCard.progressCol,
    cell: ({ row }) => {
      const answered = row.original.answeredQuestions
      const total = row.original.totalQuestions
      const correct = row.original.correctAnswers
      const percentage = total > 0 ? Math.round((answered / total) * 100) : 0

      return h('div', { class: 'flex flex-col gap-1' }, [
        h(
          'div',
          { class: 'text-sm' },
          t.value.shared.inProgressSessionsCard.questionsProgress(answered, total, correct),
        ),
        h('div', { class: 'h-2 w-24 rounded-full bg-muted overflow-hidden' }, [
          h('div', {
            class: 'h-full bg-primary transition-all',
            style: { width: `${percentage}%` },
          }),
        ]),
      ])
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      return h(
        'div',
        { class: 'flex justify-end' },
        h(
          Button,
          {
            size: 'sm',
            onClick: () => handleContinue(row.original.id),
          },
          () => [h(Play, { class: 'mr-1 size-4' }), t.value.shared.inProgressSessionsCard.continue],
        ),
      )
    },
  },
])
</script>

<template>
  <Card>
    <CardHeader class="space-y-0 pb-2">
      <div class="flex flex-row items-center justify-between">
        <CardTitle class="text-sm font-medium">{{
          t.shared.inProgressSessionsCard.title
        }}</CardTitle>
        <div class="flex items-center gap-2">
          <Badge v-if="inProgressData.length > 0" variant="secondary">
            {{ t.shared.inProgressSessionsCard.active(inProgressData.length) }}
          </Badge>
          <ListTodo class="size-4 text-muted-foreground" />
        </div>
      </div>
      <CardDescription>{{ t.shared.inProgressSessionsCard.continueWhere }}</CardDescription>
    </CardHeader>
    <CardContent>
      <template v-if="inProgressData.length > 0">
        <DataTable :columns="columns" :data="inProgressData" />
      </template>
      <template v-else>
        <div class="flex flex-col items-center justify-center py-8 text-center">
          <div class="mb-3 text-4xl">📚</div>
          <p class="text-muted-foreground">{{ t.shared.inProgressSessionsCard.noSessions }}</p>
          <p class="text-sm text-muted-foreground">
            {{ t.shared.inProgressSessionsCard.noSessionsHint }}
          </p>
          <Button class="mt-4" variant="outline" @click="router.push('/student/practice')">
            {{ t.shared.inProgressSessionsCard.startPractice }}
          </Button>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
