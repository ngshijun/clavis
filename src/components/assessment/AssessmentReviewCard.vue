<script setup lang="ts">
import { computed } from 'vue'
import type { ReviewQuestion } from '@/stores/student-assessments'
import { useQuestionsStore } from '@/stores/questions'
import { useT } from '@/composables/useT'
import { parseSimpleMarkdown } from '@/lib/utils'
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  question: ReviewQuestion
  index: number
}>()

const questionsStore = useQuestionsStore()
const t = useT()

/**
 * Decision 30: the student sees per-question correctness only — never the
 * answer key or explanation. Options are rendered neutrally with the
 * student's own selection marked; nothing hints at which option is correct.
 */
const selectedSet = computed(() => new Set(props.question.selectedOptions ?? []))

const typeLabel = computed(() => {
  if (props.question.type === 'mcq') return t.value.student.assessmentResult.multipleChoice
  if (props.question.type === 'mrq') return t.value.student.assessmentResult.multipleResponse
  return t.value.student.assessmentResult.shortAnswer
})
</script>

<template>
  <Card
    :class="{
      'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20':
        question.answered && question.isCorrect,
      'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20':
        question.answered && !question.isCorrect,
    }"
  >
    <CardHeader class="pb-2">
      <div class="flex items-start justify-between gap-2">
        <CardTitle class="text-sm font-medium">
          {{ t.student.assessmentResult.questionLabel(index + 1) }}
        </CardTitle>
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground">
            {{ t.student.assessmentResult.points(question.points) }}
          </span>
          <Badge variant="secondary" class="shrink-0">{{ typeLabel }}</Badge>
          <Badge v-if="!question.answered" variant="outline" class="shrink-0 text-muted-foreground">
            <MinusCircle class="mr-1 size-3" />
            {{ t.student.assessmentResult.unanswered }}
          </Badge>
          <Badge
            v-else-if="question.isCorrect"
            variant="outline"
            class="shrink-0 border-green-500 text-green-600 dark:border-green-600 dark:text-green-400"
          >
            <CheckCircle2 class="mr-1 size-3" />
            {{ t.student.assessmentResult.correct }}
          </Badge>
          <Badge
            v-else
            variant="outline"
            class="shrink-0 border-red-500 text-red-600 dark:border-red-600 dark:text-red-400"
          >
            <XCircle class="mr-1 size-3" />
            {{ t.student.assessmentResult.incorrect }}
          </Badge>
        </div>
      </div>
    </CardHeader>

    <CardContent class="space-y-3">
      <!-- Question text -->
      <div class="text-sm leading-relaxed" v-html="parseSimpleMarkdown(question.question)" />

      <!-- Question image -->
      <img
        v-if="question.imagePath"
        :src="questionsStore.getQuestionImageUrl(question.imagePath)"
        :alt="t.shared.questionPreviewDialog.questionImageAlt"
        class="max-h-40 rounded-md object-contain"
        loading="lazy"
      />

      <!-- MCQ/MRQ options: neutral rendering, own selection marked only -->
      <div v-if="question.type !== 'short_answer'" class="space-y-2">
        <div
          v-for="option in question.options"
          :key="option.number"
          class="flex items-center gap-2 rounded-md border p-2 text-sm"
          :class="{ 'border-primary bg-primary/5': selectedSet.has(option.number) }"
        >
          <div class="flex flex-1 items-center gap-2">
            <span v-if="option.text">{{ option.text }}</span>
            <img
              v-if="option.imagePath"
              :src="questionsStore.getThumbnailQuestionImageUrl(option.imagePath)"
              :alt="t.shared.questionPreviewDialog.optionImageAlt"
              class="max-h-12 rounded border object-contain"
              loading="lazy"
            />
          </div>
          <Badge v-if="selectedSet.has(option.number)" variant="outline" class="ml-auto shrink-0">
            {{ t.student.assessmentResult.yourAnswer }}
          </Badge>
        </div>
      </div>

      <!-- Short answer: the student's own answer only -->
      <div v-else class="flex gap-2 text-sm">
        <span class="font-medium">{{ t.student.assessmentResult.yourAnswer }}:</span>
        <span :class="question.answered ? '' : 'italic text-muted-foreground'">
          {{ question.textAnswer || t.student.assessmentResult.noAnswer }}
        </span>
      </div>
    </CardContent>
  </Card>
</template>
