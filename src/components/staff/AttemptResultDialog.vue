<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  useAssessmentsStore,
  type AssessmentAttempt,
  type AssessmentQuestionItem,
  type AttemptResult,
  type AttemptResultQuestion,
} from '@/stores/assessments'
import { Check, Clock, Info, Loader2, Minus, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

const t = useT()
const assessmentsStore = useAssessmentsStore()

const props = defineProps<{
  attempt: AssessmentAttempt | null
  /** The assessment's questions, for rendering text and option labels. */
  questions: AssessmentQuestionItem[]
  /** P9b marking authz (client mirror of `app.can_mark_assessment`). */
  canMark: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const result = ref<AttemptResult | null>(null)
const isLoading = ref(false)

interface MarkDraft {
  points: string
  comment: string
  isSaving: boolean
  error: string | null
}

/** Per-answer marking form state, keyed by assessment_question_id. */
const markDrafts = ref<Map<string, MarkDraft>>(new Map())

const questionsById = computed(
  () => new Map(props.questions.map((question) => [question.id, question])),
)

watch(open, async (isOpen) => {
  if (!isOpen || !props.attempt) return

  result.value = null
  markDrafts.value = new Map()
  isLoading.value = true
  const { result: fetched, error } = await assessmentsStore.fetchAttemptResult(props.attempt.id)
  isLoading.value = false

  if (error || !fetched) {
    toast.error(error ?? '')
    open.value = false
    return
  }

  result.value = fetched
  // Prefill a marking form for every markable long answer (re-marking allowed).
  const drafts = new Map<string, MarkDraft>()
  for (const question of fetched.questions) {
    if (!isMarkable(question)) continue
    drafts.set(question.assessmentQuestionId, {
      points: question.awardedPoints === null ? '' : String(question.awardedPoints),
      comment: question.markerComment ?? '',
      isSaving: false,
      error: null,
    })
  }
  markDrafts.value = drafts
})

const isInProgress = computed(() => result.value !== null && result.value.completedAt === null)
const isPending = computed(() => result.value !== null && result.value.pendingCount > 0)

function sourceOf(question: AttemptResultQuestion): AssessmentQuestionItem | undefined {
  return questionsById.value.get(question.assessmentQuestionId)
}

function isUnanswered(question: AttemptResultQuestion): boolean {
  return question.answeredAt === null
}

/** Answered but not yet marked — the P9b pending state. */
function isAwaitingMarking(question: AttemptResultQuestion): boolean {
  return !isUnanswered(question) && question.isCorrect === null
}

function isPartial(question: AttemptResultQuestion): boolean {
  return (
    question.isCorrect === false && question.awardedPoints !== null && question.awardedPoints > 0
  )
}

/** A long answer with a stored response that the caller may mark or re-mark. */
function isMarkable(question: AttemptResultQuestion): boolean {
  return (
    props.canMark &&
    question.answerId !== null &&
    sourceOf(question)?.type === 'long_answer' &&
    result.value?.completedAt !== null
  )
}

/** Render the student's submission for any question type as one line. */
function answerText(question: AttemptResultQuestion): string {
  const source = sourceOf(question)
  if (question.textAnswer !== null && question.textAnswer !== '') return question.textAnswer
  if (question.selectedOptions && question.selectedOptions.length > 0) {
    return question.selectedOptions
      .map((number) => {
        const option = source?.options.find((candidate) => candidate.number === number)
        return option?.text ? option.text : `#${number}`
      })
      .join(', ')
  }

  const response = question.response
  const payload = source?.payload
  if (!response) return ''

  if (typeof response.value === 'boolean') {
    return response.value
      ? t.value.staff.attemptResult.responseTrue
      : t.value.staff.attemptResult.responseFalse
  }
  if (response.blanks) {
    return [...response.blanks]
      .sort((a, b) => a.index - b.index)
      .map((blank) => `${blank.index}: ${blank.value}`)
      .join(' · ')
  }
  if (response.pairs && payload?.type === 'matching') {
    const leftText = new Map(payload.left.map((item) => [item.id, item.text]))
    const rightText = new Map(payload.right.map((item) => [item.id, item.text]))
    return response.pairs
      .map(
        (pair) =>
          `${leftText.get(pair.left_id) ?? pair.left_id} → ${rightText.get(pair.right_id) ?? pair.right_id}`,
      )
      .join('; ')
  }
  if (response.order && payload?.type === 'ordering') {
    const itemText = new Map(payload.items.map((item) => [item.id, item.text]))
    return response.order.map((id) => itemText.get(id) ?? id).join(' → ')
  }
  return ''
}

function formatPoints(points: number): string {
  return String(points)
}

function rubricOf(question: AttemptResultQuestion): string | null {
  const payload = sourceOf(question)?.payload
  return payload?.type === 'long_answer' ? (payload.rubric ?? null) : null
}

async function handleSaveMark(question: AttemptResultQuestion) {
  const draft = markDrafts.value.get(question.assessmentQuestionId)
  const current = result.value
  if (!draft || !current || question.answerId === null) return

  const points = Number(draft.points)
  if (
    draft.points.trim() === '' ||
    !Number.isFinite(points) ||
    points < 0 ||
    points > question.points
  ) {
    draft.error = t.value.staff.attemptResult.validationMarkPoints(question.points)
    return
  }
  draft.error = null

  draft.isSaving = true
  try {
    const comment = draft.comment.trim()
    const { result: marked, error } = await assessmentsStore.markAttemptAnswer(
      question.answerId,
      points,
      comment === '' ? null : comment,
    )
    if (error || !marked) {
      toast.error(error ?? '')
      return
    }

    // Fold the server recompute back into the open result.
    const previousAwarded = question.awardedPoints ?? 0
    question.awardedPoints = marked.awardedPoints
    question.isCorrect = marked.isCorrect
    question.markedAt = marked.markedAt
    question.markerComment = comment === '' ? null : comment
    current.correctCount = marked.correctCount
    current.scorePercent = marked.scorePercent
    current.pendingCount = marked.pendingCount
    if (current.pointsAwarded !== null) {
      current.pointsAwarded =
        Math.round((current.pointsAwarded - previousAwarded + marked.awardedPoints) * 100) / 100
    }
    draft.points = String(marked.awardedPoints)

    toast.success(t.value.staff.attemptResult.toastMarkSaved)
  } finally {
    draft.isSaving = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t.staff.attemptResult.title(attempt?.studentName ?? '') }}</DialogTitle>
        <!-- A pending attempt's score is a floor, never presented as final. -->
        <DialogDescription v-if="result && !isInProgress">
          {{ t.staff.attemptResult.scoreLabel }}:
          <template
            v-if="isPending && result.pointsAwarded !== null && result.pointsTotal !== null"
          >
            {{
              t.staff.attemptResult.pointsSummary(
                formatPoints(result.pointsAwarded),
                result.pointsTotal,
              )
            }}
            · {{ t.staff.results.provisionalScore }}
          </template>
          <template v-else>
            {{
              t.staff.results.scoreFmt(
                result.correctCount,
                result.totalQuestions,
                result.scorePercent,
              )
            }}
          </template>
        </DialogDescription>
      </DialogHeader>

      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <Loader2 class="size-6 animate-spin text-muted-foreground" />
      </div>

      <div v-else-if="result" class="space-y-3 py-2">
        <!-- Open attempt: never show the stored zeros as a final score -->
        <div
          v-if="isInProgress"
          class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
        >
          <Info class="mt-0.5 size-4 shrink-0" />
          {{ t.staff.attemptResult.inProgressBanner }}
        </div>

        <!-- Marking outstanding: the score above is provisional -->
        <div
          v-else-if="isPending"
          class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
        >
          <Clock class="mt-0.5 size-4 shrink-0" />
          {{ t.staff.attemptResult.pendingSummary(result.pendingCount) }}
        </div>

        <ol class="space-y-2">
          <li
            v-for="question in result.questions"
            :key="question.assessmentQuestionId"
            class="rounded-lg border p-3"
          >
            <div class="flex items-start gap-3">
              <span
                class="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                :class="
                  isUnanswered(question)
                    ? 'bg-muted text-muted-foreground'
                    : isAwaitingMarking(question)
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                      : question.isCorrect
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                        : isPartial(question)
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                "
              >
                {{ question.questionOrder }}
              </span>

              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{
                    sourceOf(question)?.question ||
                    t.staff.attemptResult.questionFallback(question.questionOrder)
                  }}
                </p>
                <p
                  v-if="!isUnanswered(question)"
                  class="mt-1 whitespace-pre-wrap text-sm text-muted-foreground"
                >
                  {{ t.staff.attemptResult.studentAnswer }}: {{ answerText(question) }}
                </p>
                <p v-if="question.markerComment" class="mt-1 text-sm text-muted-foreground">
                  {{ t.staff.attemptResult.markerCommentLabel }}: {{ question.markerComment }}
                </p>
              </div>

              <div class="flex shrink-0 flex-col items-end gap-1">
                <Badge
                  v-if="isUnanswered(question)"
                  variant="secondary"
                  class="text-muted-foreground"
                >
                  <Minus class="mr-1 size-3" />
                  {{ t.staff.attemptResult.unanswered }}
                </Badge>
                <Badge
                  v-else-if="isAwaitingMarking(question)"
                  variant="secondary"
                  class="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                >
                  <Clock class="mr-1 size-3" />
                  {{ t.staff.attemptResult.pendingBadge }}
                </Badge>
                <Badge
                  v-else-if="question.isCorrect"
                  variant="secondary"
                  class="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                >
                  <Check class="mr-1 size-3" />
                  {{ t.staff.attemptResult.correct }}
                </Badge>
                <Badge
                  v-else-if="isPartial(question)"
                  variant="secondary"
                  class="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                >
                  {{ t.staff.attemptResult.partialBadge }}
                </Badge>
                <Badge
                  v-else
                  variant="secondary"
                  class="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                >
                  <X class="mr-1 size-3" />
                  {{ t.staff.attemptResult.incorrect }}
                </Badge>
                <span class="text-xs text-muted-foreground">
                  {{
                    question.awardedPoints !== null
                      ? t.staff.attemptResult.awardedFmt(
                          formatPoints(question.awardedPoints),
                          question.points,
                        )
                      : t.staff.attemptResult.pointsFmt(question.points)
                  }}
                </span>
              </div>
            </div>

            <!-- Manual marking (long answers, staff with marking authz) -->
            <div
              v-if="isMarkable(question) && markDrafts.get(question.assessmentQuestionId)"
              class="mt-3 space-y-2 rounded-md border bg-muted/40 p-3"
            >
              <p class="text-sm font-medium">{{ t.staff.attemptResult.markingTitle }}</p>
              <p
                v-if="rubricOf(question)"
                class="whitespace-pre-wrap text-sm text-muted-foreground"
              >
                {{ t.staff.attemptResult.rubricLabel }}: {{ rubricOf(question) }}
              </p>
              <div class="flex flex-wrap items-start gap-3">
                <label class="flex items-center gap-2 text-sm text-muted-foreground">
                  {{ t.staff.attemptResult.markPointsLabel(question.points) }}
                  <Input
                    v-model="markDrafts.get(question.assessmentQuestionId)!.points"
                    type="number"
                    min="0"
                    :max="question.points"
                    step="0.5"
                    class="w-20"
                    :disabled="markDrafts.get(question.assessmentQuestionId)!.isSaving"
                  />
                </label>
              </div>
              <Textarea
                v-model="markDrafts.get(question.assessmentQuestionId)!.comment"
                :placeholder="t.staff.attemptResult.markCommentPlaceholder"
                rows="2"
                :disabled="markDrafts.get(question.assessmentQuestionId)!.isSaving"
                :aria-label="t.staff.attemptResult.markCommentLabel"
              />
              <p
                v-if="markDrafts.get(question.assessmentQuestionId)!.error"
                class="text-sm text-destructive"
              >
                {{ markDrafts.get(question.assessmentQuestionId)!.error }}
              </p>
              <Button
                size="sm"
                :disabled="markDrafts.get(question.assessmentQuestionId)!.isSaving"
                @click="handleSaveMark(question)"
              >
                <Loader2
                  v-if="markDrafts.get(question.assessmentQuestionId)!.isSaving"
                  class="mr-2 size-4 animate-spin"
                />
                {{ t.staff.attemptResult.saveMark }}
              </Button>
            </div>
          </li>
        </ol>

        <!-- Remaining-pending summary under the marking work -->
        <p v-if="canMark && !isInProgress" class="text-sm text-muted-foreground">
          {{
            result.pendingCount === 0
              ? t.staff.attemptResult.allMarked
              : t.staff.attemptResult.stillPending(result.pendingCount)
          }}
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">
          {{ t.staff.attemptResult.close }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
