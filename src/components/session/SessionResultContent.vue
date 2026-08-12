<script setup lang="ts">
import type { SessionQuestion } from './SessionQuestionCard.vue'
import type { SessionAnswer } from '@/lib/sessionResult'
import { formatDateTime } from '@/lib/date'
import { useQuestionsStore } from '@/stores/questions'
import SessionSummaryCards from './SessionSummaryCards.vue'
import SessionQuestionCard from './SessionQuestionCard.vue'
import { Separator } from '@/components/ui/separator'
import { useT } from '@/composables/useT'

const t = useT()

const questionsStore = useQuestionsStore()

defineProps<{
  summary: {
    score: number
    correctAnswers: number
    incorrectAnswers: number
    durationSeconds: number
  }
  completedAt: string | null
  questions: SessionQuestion[]
  answers: SessionAnswer[]
}>()

function getAnswerByIndex(answers: SessionAnswer[], index: number): SessionAnswer | undefined {
  return answers[index]
}
</script>

<template>
  <!-- Summary Cards -->
  <SessionSummaryCards
    :score="summary.score"
    :correct-answers="summary.correctAnswers"
    :incorrect-answers="summary.incorrectAnswers"
    :duration-seconds="summary.durationSeconds"
  />

  <div v-if="completedAt" class="mb-4 text-sm text-muted-foreground">
    {{ t.shared.sessionResultContent.completed(formatDateTime(completedAt)) }}
  </div>

  <!-- AI Summary (role-specific) -->
  <slot name="ai-summary" />

  <Separator class="mb-6" />

  <!-- Questions List -->
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">{{ t.shared.sessionResultContent.questionDetails }}</h2>

    <SessionQuestionCard
      v-for="(question, index) in questions"
      :key="question.id"
      :question="question"
      :answer="getAnswerByIndex(answers, index)"
      :index="index"
      :get-image-url="questionsStore.getOptimizedQuestionImageUrl"
      :get-thumbnail-url="questionsStore.getThumbnailQuestionImageUrl"
    />
  </div>
</template>
