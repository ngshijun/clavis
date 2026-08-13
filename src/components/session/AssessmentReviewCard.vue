<script setup lang="ts">
import { computed } from 'vue'
import { useQuestionsStore } from '@/stores/questions'
import { useT } from '@/composables/useT'
import { parseSimpleMarkdown } from '@/lib/utils'
import { clozeSegments } from '@/lib/attemptResponse'
import type { ReviewQuestion } from '@/stores/student-assessments'
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  Lightbulb,
  MessageSquare,
  ListChecks,
} from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/**
 * Post-submission review card for one assessment question — every P9a type.
 * Visibility is whatever `get_attempt_result` decided (P9b):
 * - `gradesHidden` (score withheld): the submission renders neutrally, with
 *   no correctness, points or teacher feedback.
 * - `question.correct` present (answers released): the per-type answer key
 *   renders alongside the student's answer.
 * - `isCorrect === null` with an answer: awaiting the teacher's marking.
 */
const props = defineProps<{
  question: ReviewQuestion
  index: number
  /** Score withheld (decision 70) — hide all grades and feedback. */
  gradesHidden: boolean
}>()

const questionsStore = useQuestionsStore()
const t = useT()

type Status = 'hidden' | 'unanswered' | 'pending' | 'correct' | 'partial' | 'incorrect'

const status = computed<Status>(() => {
  if (props.gradesHidden) return 'hidden'
  if (!props.question.answered) return 'unanswered'
  if (props.question.isCorrect === null) return 'pending'
  if (props.question.isCorrect) return 'correct'
  if (props.question.awardedPoints !== null && props.question.awardedPoints > 0) return 'partial'
  return 'incorrect'
})

const selectedSet = computed(() => new Set(props.question.selectedOptions ?? []))
const correctOptionSet = computed(() => new Set(props.question.correct?.correctOptions ?? []))

const rightTextById = computed(
  () => new Map(props.question.matchingRight.map((item) => [item.id, item.text])),
)
const orderingTextById = computed(
  () => new Map(props.question.orderingItems.map((item) => [item.id, item.text])),
)

/** Student's chosen right id per left id. */
const chosenRightByLeft = computed(
  () =>
    new Map((props.question.response?.pairs ?? []).map((pair) => [pair.left_id, pair.right_id])),
)
/** Correct right id per left id (released only). */
const correctRightByLeft = computed(
  () => new Map((props.question.correct?.pairs ?? []).map((pair) => [pair.left_id, pair.right_id])),
)

/** Student's cloze value per blank index. */
const clozeValueByIndex = computed(
  () => new Map((props.question.response?.blanks ?? []).map((blank) => [blank.index, blank.value])),
)

/** Student's ordering sequence resolved to texts (falls back to served order when unanswered). */
const studentOrder = computed(() => {
  const order = props.question.response?.order
  if (!order || order.length === 0) return null
  return order.map((id) => orderingTextById.value.get(id) ?? id)
})

const correctOrder = computed(() =>
  (props.question.correct?.correctOrder ?? []).map((id) => orderingTextById.value.get(id) ?? id),
)

const trueFalseAnswer = computed(() =>
  typeof props.question.response?.value === 'boolean' ? props.question.response.value : null,
)

function boolLabel(value: boolean): string {
  return value ? t.value.shared.answerBool.trueLabel : t.value.shared.answerBool.falseLabel
}

/** "29 ± 0.5 cm" — the released numeric key. */
const numericCorrectText = computed(() => {
  const correct = props.question.correct
  if (!correct || correct.answerNumber === null) return null
  const tolerance =
    correct.tolerance !== null && correct.tolerance > 0 ? ` ± ${correct.tolerance}` : ''
  const unit = props.question.unit ? ` ${props.question.unit}` : ''
  return `${correct.answerNumber}${tolerance}${unit}`
})

const showAnswerKey = computed(() => props.question.correct !== null)
</script>

<template>
  <Card
    :class="{
      'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20':
        status === 'correct',
      'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20': status === 'incorrect',
      'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20':
        status === 'partial' || status === 'pending',
    }"
  >
    <CardHeader class="pb-2">
      <div class="flex items-start justify-between gap-2">
        <CardTitle class="text-sm font-medium">
          {{ t.shared.assessmentReviewCard.questionLabel(index + 1) }}
        </CardTitle>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <span class="text-xs text-muted-foreground">
            {{
              !gradesHidden && question.awardedPoints !== null
                ? t.shared.assessmentReviewCard.pointsAwarded(
                    String(question.awardedPoints),
                    question.points,
                  )
                : t.shared.assessmentReviewCard.points(question.points)
            }}
          </span>
          <Badge variant="secondary" class="shrink-0">
            {{ t.shared.questionTypes[question.type] }}
          </Badge>
          <Badge
            v-if="status === 'unanswered'"
            variant="outline"
            class="shrink-0 text-muted-foreground"
          >
            <MinusCircle class="mr-1 size-3" />
            {{ t.shared.assessmentReviewCard.unanswered }}
          </Badge>
          <Badge
            v-else-if="status === 'pending'"
            variant="outline"
            class="shrink-0 border-amber-500 text-amber-600 dark:border-amber-600 dark:text-amber-400"
          >
            <Clock class="mr-1 size-3" />
            {{ t.shared.assessmentReviewCard.awaitingMarking }}
          </Badge>
          <Badge
            v-else-if="status === 'correct'"
            variant="outline"
            class="shrink-0 border-green-500 text-green-600 dark:border-green-600 dark:text-green-400"
          >
            <CheckCircle2 class="mr-1 size-3" />
            {{ t.shared.assessmentReviewCard.correct }}
          </Badge>
          <Badge
            v-else-if="status === 'partial'"
            variant="outline"
            class="shrink-0 border-amber-500 text-amber-600 dark:border-amber-600 dark:text-amber-400"
          >
            {{ t.shared.assessmentReviewCard.partial }}
          </Badge>
          <Badge
            v-else-if="status === 'incorrect'"
            variant="outline"
            class="shrink-0 border-red-500 text-red-600 dark:border-red-600 dark:text-red-400"
          >
            <XCircle class="mr-1 size-3" />
            {{ t.shared.assessmentReviewCard.incorrect }}
          </Badge>
        </div>
      </div>
    </CardHeader>

    <CardContent class="space-y-3">
      <!-- Question text (a promptless cloze prompts via its text below) -->
      <div
        v-if="question.question"
        class="text-sm leading-relaxed"
        v-html="parseSimpleMarkdown(question.question)"
      />

      <!-- Question image -->
      <img
        v-if="question.imagePath"
        :src="questionsStore.getOptimizedQuestionImageUrl(question.imagePath)"
        :alt="t.shared.questionPreviewDialog.questionImageAlt"
        class="max-h-40 rounded-md object-contain"
        loading="lazy"
      />

      <!-- mcq / mrq: own selection marked; correct options marked only when released -->
      <div v-if="question.type === 'mcq' || question.type === 'mrq'" class="space-y-2">
        <div
          v-for="option in question.options"
          :key="option.number"
          class="flex items-center gap-2 rounded-md border p-2 text-sm"
          :class="{
            'border-primary bg-primary/5':
              selectedSet.has(option.number) && !correctOptionSet.has(option.number),
            'border-green-500 bg-green-50 dark:border-green-600 dark:bg-green-950/30':
              correctOptionSet.has(option.number),
          }"
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
            v-if="correctOptionSet.has(option.number)"
            variant="outline"
            class="ml-auto shrink-0 border-green-500 text-green-600 dark:border-green-600 dark:text-green-400"
          >
            {{ t.shared.assessmentReviewCard.correctAnswer }}
          </Badge>
          <Badge v-if="selectedSet.has(option.number)" variant="outline" class="shrink-0">
            {{ t.shared.assessmentReviewCard.yourAnswer }}
          </Badge>
        </div>
      </div>

      <!-- true / false -->
      <div v-else-if="question.type === 'true_false'" class="space-y-2 text-sm">
        <div class="flex gap-2">
          <span class="font-medium">{{ t.shared.assessmentReviewCard.yourAnswer }}:</span>
          <span :class="trueFalseAnswer === null ? 'italic text-muted-foreground' : ''">
            {{
              trueFalseAnswer === null
                ? t.shared.assessmentReviewCard.noAnswer
                : boolLabel(trueFalseAnswer)
            }}
          </span>
        </div>
        <div
          v-if="showAnswerKey && question.correct?.answerBoolean !== null"
          class="flex gap-2 text-green-700 dark:text-green-400"
        >
          <span class="font-medium">{{ t.shared.assessmentReviewCard.correctAnswer }}:</span>
          <span>{{ boolLabel(question.correct!.answerBoolean!) }}</span>
        </div>
      </div>

      <!-- numeric / short answer -->
      <div
        v-else-if="question.type === 'numeric' || question.type === 'short_answer'"
        class="space-y-2 text-sm"
      >
        <div class="flex gap-2">
          <span class="font-medium">{{ t.shared.assessmentReviewCard.yourAnswer }}:</span>
          <span :class="question.textAnswer ? '' : 'italic text-muted-foreground'">
            {{ question.textAnswer || t.shared.assessmentReviewCard.noAnswer
            }}<template v-if="question.textAnswer && question.unit"> {{ question.unit }}</template>
          </span>
        </div>
        <div
          v-if="question.type === 'numeric' && numericCorrectText"
          class="flex gap-2 text-green-700 dark:text-green-400"
        >
          <span class="font-medium">{{ t.shared.assessmentReviewCard.correctAnswer }}:</span>
          <span>{{ numericCorrectText }}</span>
        </div>
        <div
          v-if="question.type === 'short_answer' && question.correct?.acceptedAnswers?.length"
          class="flex gap-2 text-green-700 dark:text-green-400"
        >
          <span class="font-medium">{{ t.shared.assessmentReviewCard.acceptedAnswers }}:</span>
          <span>{{ question.correct!.acceptedAnswers!.join(' · ') }}</span>
        </div>
      </div>

      <!-- cloze: the text with the student's values inline -->
      <div v-else-if="question.type === 'cloze'" class="space-y-2 text-sm">
        <p v-if="question.clozeText" class="leading-loose">
          <template v-for="(segment, i) in clozeSegments(question.clozeText)" :key="i">
            <span v-if="segment.kind === 'text'" class="whitespace-pre-wrap">{{
              segment.text
            }}</span>
            <span
              v-else
              class="mx-1 inline-block rounded border px-2"
              :class="
                clozeValueByIndex.has(segment.index)
                  ? 'border-primary/50 bg-primary/5'
                  : 'italic text-muted-foreground'
              "
            >
              {{ clozeValueByIndex.get(segment.index) ?? '—' }}
            </span>
          </template>
        </p>
        <div v-if="showAnswerKey && question.correct?.blanks?.length" class="space-y-1">
          <p class="font-medium text-green-700 dark:text-green-400">
            {{ t.shared.assessmentReviewCard.acceptedAnswers }}:
          </p>
          <p
            v-for="blank in question.correct!.blanks!"
            :key="blank.index"
            class="text-green-700 dark:text-green-400"
          >
            {{ t.shared.assessmentReviewCard.blankLabel(blank.index) }}:
            {{ blank.accepted.join(' · ') }}
          </p>
        </div>
      </div>

      <!-- matching: one row per left item -->
      <div v-else-if="question.type === 'matching'" class="space-y-2 text-sm">
        <div v-for="item in question.matchingLeft" :key="item.id" class="rounded-md border p-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ item.text }}</span>
            <span class="text-muted-foreground">→</span>
            <span :class="chosenRightByLeft.has(item.id) ? '' : 'italic text-muted-foreground'">
              {{
                chosenRightByLeft.has(item.id)
                  ? (rightTextById.get(chosenRightByLeft.get(item.id)!) ??
                    chosenRightByLeft.get(item.id))
                  : t.shared.assessmentReviewCard.notMatched
              }}
            </span>
          </div>
          <p
            v-if="showAnswerKey && correctRightByLeft.has(item.id)"
            class="mt-1 text-green-700 dark:text-green-400"
          >
            {{ t.shared.assessmentReviewCard.correctMatch }}:
            {{
              rightTextById.get(correctRightByLeft.get(item.id)!) ?? correctRightByLeft.get(item.id)
            }}
          </p>
        </div>
      </div>

      <!-- ordering: the student's sequence, and the correct one when released -->
      <div v-else-if="question.type === 'ordering'" class="space-y-3 text-sm">
        <div>
          <p class="mb-1 font-medium">{{ t.shared.assessmentReviewCard.yourOrder }}:</p>
          <ol v-if="studentOrder" class="list-inside list-decimal space-y-0.5">
            <li v-for="(text, i) in studentOrder" :key="i">{{ text }}</li>
          </ol>
          <p v-else class="italic text-muted-foreground">
            {{ t.shared.assessmentReviewCard.noAnswer }}
          </p>
        </div>
        <div v-if="showAnswerKey && correctOrder.length > 0">
          <p class="mb-1 font-medium text-green-700 dark:text-green-400">
            {{ t.shared.assessmentReviewCard.correctOrder }}:
          </p>
          <ol class="list-inside list-decimal space-y-0.5 text-green-700 dark:text-green-400">
            <li v-for="(text, i) in correctOrder" :key="i">{{ text }}</li>
          </ol>
        </div>
      </div>

      <!-- long answer: the submitted text; rubric only once released -->
      <div v-else-if="question.type === 'long_answer'" class="space-y-2 text-sm">
        <p class="font-medium">{{ t.shared.assessmentReviewCard.yourAnswer }}:</p>
        <p v-if="question.textAnswer" class="whitespace-pre-wrap rounded-md border bg-muted/40 p-3">
          {{ question.textAnswer }}
        </p>
        <p v-else class="italic text-muted-foreground">
          {{ t.shared.assessmentReviewCard.noAnswer }}
        </p>
        <div
          v-if="showAnswerKey && question.correct?.rubric"
          class="flex items-start gap-2 rounded-md border p-2 text-muted-foreground"
        >
          <ListChecks class="mt-0.5 size-4 shrink-0" />
          <p class="whitespace-pre-wrap">
            <span class="font-medium">{{ t.shared.assessmentReviewCard.rubric }}:</span>
            {{ question.correct!.rubric }}
          </p>
        </div>
      </div>

      <!-- Teacher's comment on a marked answer (never present while withheld) -->
      <div
        v-if="!gradesHidden && question.markerComment"
        class="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 p-2 text-sm text-blue-800 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-200"
      >
        <MessageSquare class="mt-0.5 size-4 shrink-0" />
        <p>
          <span class="font-medium">{{ t.shared.assessmentReviewCard.teacherComment }}:</span>
          {{ question.markerComment }}
        </p>
      </div>

      <!-- Authored explanation (released only) -->
      <div
        v-if="showAnswerKey && question.correct?.explanation"
        class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
      >
        <Lightbulb class="mt-0.5 size-4 shrink-0" />
        <p>
          <span class="font-medium">{{ t.shared.assessmentReviewCard.explanation }}:</span>
          {{ question.correct!.explanation }}
        </p>
      </div>
    </CardContent>
  </Card>
</template>
