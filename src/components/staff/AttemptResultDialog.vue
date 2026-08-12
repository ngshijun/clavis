<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  useAssessmentsStore,
  type AssessmentAttempt,
  type AssessmentQuestionItem,
  type AttemptResult,
  type AttemptResultQuestion,
} from '@/stores/assessments'
import { Check, Info, Loader2, Minus, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
}>()

const open = defineModel<boolean>('open', { default: false })

const result = ref<AttemptResult | null>(null)
const isLoading = ref(false)

const questionsById = computed(
  () => new Map(props.questions.map((question) => [question.id, question])),
)

watch(open, async (isOpen) => {
  if (!isOpen || !props.attempt) return

  result.value = null
  isLoading.value = true
  const { result: fetched, error } = await assessmentsStore.fetchAttemptResult(props.attempt.id)
  isLoading.value = false

  if (error || !fetched) {
    toast.error(error ?? '')
    open.value = false
    return
  }

  result.value = fetched
})

const isInProgress = computed(() => result.value !== null && result.value.completedAt === null)

function isUnanswered(question: AttemptResultQuestion): boolean {
  return question.answeredAt === null
}

function answerText(question: AttemptResultQuestion): string {
  const source = questionsById.value.get(question.assessmentQuestionId)
  if (question.textAnswer !== null && question.textAnswer !== '') return question.textAnswer
  if (question.selectedOptions && question.selectedOptions.length > 0) {
    return question.selectedOptions
      .map((number) => {
        const option = source?.options.find((candidate) => candidate.number === number)
        return option?.text ? option.text : `#${number}`
      })
      .join(', ')
  }
  return ''
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t.staff.attemptResult.title(attempt?.studentName ?? '') }}</DialogTitle>
        <DialogDescription v-if="result && !isInProgress">
          {{ t.staff.attemptResult.scoreLabel }}:
          {{
            t.staff.results.scoreFmt(
              result.correctCount,
              result.totalQuestions,
              result.scorePercent,
            )
          }}
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

        <ol class="space-y-2">
          <li
            v-for="question in result.questions"
            :key="question.assessmentQuestionId"
            class="flex items-start gap-3 rounded-lg border p-3"
          >
            <span
              class="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              :class="
                isUnanswered(question)
                  ? 'bg-muted text-muted-foreground'
                  : question.isCorrect
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
              "
            >
              {{ question.questionOrder }}
            </span>

            <div class="min-w-0 flex-1">
              <p class="font-medium">
                {{
                  questionsById.get(question.assessmentQuestionId)?.question ||
                  t.staff.attemptResult.questionFallback(question.questionOrder)
                }}
              </p>
              <p v-if="!isUnanswered(question)" class="mt-1 text-sm text-muted-foreground">
                {{ t.staff.attemptResult.studentAnswer }}: {{ answerText(question) }}
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
                v-else-if="question.isCorrect"
                variant="secondary"
                class="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
              >
                <Check class="mr-1 size-3" />
                {{ t.staff.attemptResult.correct }}
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
                {{ t.staff.attemptResult.pointsFmt(question.points) }}
              </span>
            </div>
          </li>
        </ol>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">
          {{ t.staff.attemptResult.close }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
