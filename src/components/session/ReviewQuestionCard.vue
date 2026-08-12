<script setup lang="ts">
import { computed } from 'vue'
import { useQuestionsStore } from '@/stores/questions'
import { useT } from '@/composables/useT'
import { parseSimpleMarkdown } from '@/lib/utils'
import { CheckCircle2, XCircle, MinusCircle, Lightbulb } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export interface ReviewCardOption {
  /** 1-based option number as stored in *_answers.selected_options. */
  number: number
  text: string | null
  imagePath: string | null
}

/**
 * Deferred-feedback review question (practice decision 39 / assessment
 * decision 30): per-question correctness with the student's own answer marked
 * neutrally. The shape deliberately has no notion of which option is correct —
 * the answer key is never revealed. Wrong-option tips (practice only) attach a
 * hint to options the student selected and got wrong.
 */
export interface ReviewCardQuestion {
  type: 'mcq' | 'mrq' | 'short_answer'
  question: string
  imagePath: string | null
  options: ReviewCardOption[]
  selectedOptions: number[] | null
  textAnswer: string | null
  answered: boolean
  isCorrect: boolean
  /** Assessment only: per-question points. */
  points?: number
  /** Practice only: the bank question has been deleted. */
  isDeleted?: boolean
  /** Practice only: tips for wrongly-selected options (tip may be null). */
  wrongOptionTips?: { number: number; tip: string | null }[]
}

const props = defineProps<{
  question: ReviewCardQuestion
  index: number
}>()

const questionsStore = useQuestionsStore()
const t = useT()

const selectedSet = computed(() => new Set(props.question.selectedOptions ?? []))

/** Non-blank tip text per wrongly-selected option number. */
const tipByNumber = computed(() => {
  const map = new Map<number, string>()
  for (const entry of props.question.wrongOptionTips ?? []) {
    if (entry.tip && entry.tip.trim()) map.set(entry.number, entry.tip)
  }
  return map
})

const typeLabel = computed(() => {
  if (props.question.type === 'mcq') return t.value.shared.reviewQuestionCard.multipleChoice
  if (props.question.type === 'mrq') return t.value.shared.reviewQuestionCard.multipleResponse
  return t.value.shared.reviewQuestionCard.shortAnswer
})
</script>

<template>
  <Card
    :class="{
      'border-gray-300 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/20': question.isDeleted,
      'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20':
        !question.isDeleted && question.answered && question.isCorrect,
      'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20':
        !question.isDeleted && question.answered && !question.isCorrect,
    }"
  >
    <CardHeader class="pb-2">
      <div class="flex items-start justify-between gap-2">
        <CardTitle class="text-sm font-medium">
          {{ t.shared.reviewQuestionCard.questionLabel(index + 1) }}
        </CardTitle>
        <div class="flex items-center gap-2">
          <span v-if="question.points !== undefined" class="text-xs text-muted-foreground">
            {{ t.shared.reviewQuestionCard.points(question.points) }}
          </span>
          <Badge v-if="question.isDeleted" variant="secondary" class="shrink-0">
            {{ t.shared.reviewQuestionCard.deleted }}
          </Badge>
          <Badge v-else variant="secondary" class="shrink-0">{{ typeLabel }}</Badge>
          <Badge v-if="!question.answered" variant="outline" class="shrink-0 text-muted-foreground">
            <MinusCircle class="mr-1 size-3" />
            {{ t.shared.reviewQuestionCard.unanswered }}
          </Badge>
          <Badge
            v-else-if="question.isCorrect"
            variant="outline"
            class="shrink-0 border-green-500 text-green-600 dark:border-green-600 dark:text-green-400"
          >
            <CheckCircle2 class="mr-1 size-3" />
            {{ t.shared.reviewQuestionCard.correct }}
          </Badge>
          <Badge
            v-else
            variant="outline"
            class="shrink-0 border-red-500 text-red-600 dark:border-red-600 dark:text-red-400"
          >
            <XCircle class="mr-1 size-3" />
            {{ t.shared.reviewQuestionCard.incorrect }}
          </Badge>
        </div>
      </div>
    </CardHeader>

    <CardContent class="space-y-3">
      <!-- Deleted question: correctness badge above still applies -->
      <div v-if="question.isDeleted" class="text-sm italic text-muted-foreground">
        {{ t.shared.reviewQuestionCard.deletedNotice }}
      </div>

      <template v-else>
        <!-- Question text -->
        <div class="text-sm leading-relaxed" v-html="parseSimpleMarkdown(question.question)" />

        <!-- Question image -->
        <img
          v-if="question.imagePath"
          :src="questionsStore.getOptimizedQuestionImageUrl(question.imagePath)"
          :alt="t.shared.questionPreviewDialog.questionImageAlt"
          class="max-h-40 rounded-md object-contain"
          loading="lazy"
        />

        <!-- MCQ/MRQ options: neutral rendering, own selection marked only.
             A tip renders under a wrongly-selected option; nothing ever marks
             the correct option. -->
        <div v-if="question.type !== 'short_answer'" class="space-y-2">
          <div v-for="option in question.options" :key="option.number" class="space-y-1">
            <div
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
              <Badge
                v-if="selectedSet.has(option.number)"
                variant="outline"
                class="ml-auto shrink-0"
              >
                {{ t.shared.reviewQuestionCard.yourAnswer }}
              </Badge>
            </div>
            <div
              v-if="tipByNumber.has(option.number)"
              class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <Lightbulb class="mt-0.5 size-4 shrink-0" />
              <p>
                <span class="font-medium">{{ t.shared.reviewQuestionCard.tipLabel }}:</span>
                {{ tipByNumber.get(option.number) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Short answer: the student's own answer only (no key, no tip) -->
        <div v-else class="flex gap-2 text-sm">
          <span class="font-medium">{{ t.shared.reviewQuestionCard.yourAnswer }}:</span>
          <span :class="question.answered ? '' : 'italic text-muted-foreground'">
            {{ question.textAnswer || t.shared.reviewQuestionCard.noAnswer }}
          </span>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
