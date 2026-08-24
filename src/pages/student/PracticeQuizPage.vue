<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { usePracticeStore } from '@/stores/practice'
import { useQuestionsStore } from '@/stores/questions'
import { useQuestionShuffle } from '@/composables/useQuestionShuffle'
import { useT } from '@/composables/useT'
import { parseSimpleMarkdown } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import QuestionOptionsList, {
  type DisplayOption,
} from '@/components/session/QuestionOptionsList.vue'
import ShortAnswerInput from '@/components/session/ShortAnswerInput.vue'

const router = useRouter()
const practiceStore = usePracticeStore()
const questionsStore = useQuestionsStore()
const t = useT()
const { basePath } = useActiveClassroom()

const selectedOptionIds = ref<Set<string>>(new Set())
const textAnswer = ref('')
const showExitDialog = ref(false)
const showSubmitDialog = ref(false)
const isSubmitting = ref(false)
const pendingNavigation = ref<string | null>(null)

// Time on the CURRENT question. Banked into the answer whenever the student
// leaves the question, so time follows the paper rather than the answer.
const questionStartTime = ref<number>(Date.now())

function elapsedSeconds(): number {
  return Math.round((Date.now() - questionStartTime.value) / 1000)
}

/**
 * Write whatever is in the inputs back to the attempt. Called on every change
 * and before every navigation, so an answer is never lost by moving away and
 * an emptied input correctly reverts the question to unanswered.
 */
function commitCurrentAnswer(timeSpentSeconds = 0) {
  const question = practiceStore.currentQuestion
  if (!question) return

  if (question.type === 'mcq' || question.type === 'mrq') {
    practiceStore.recordAnswer(Array.from(selectedOptionIds.value), undefined, timeSpentSeconds)
  } else {
    practiceStore.recordAnswer(undefined, textAnswer.value, timeSpentSeconds)
  }
}

/** Load the saved answer into the inputs so revisiting shows what was given. */
function hydrateInputs() {
  const answer = practiceStore.currentAnswer
  selectedOptionIds.value = new Set(
    practiceStore.optionNumbersToIds(answer?.selectedOptions ?? null),
  )
  textAnswer.value = answer?.textAnswer ?? ''
}

// Rehydrate and restart the clock when the question changes
watch(
  () => practiceStore.currentQuestionNumber,
  () => {
    questionStartTime.value = Date.now()
    hydrateInputs()
  },
)

// The attempt lives only in memory (decision 85), so there is nothing to
// resume — arriving without one means going back to the map.
onMounted(() => {
  if (!practiceStore.isAttemptActive) {
    router.replace(`${basePath.value}/practice`)
    return
  }

  questionStartTime.value = Date.now()
  hydrateInputs()
})

const currentQuestion = computed(() => practiceStore.currentQuestion)
const { displayOptions, clearCache: clearShuffleCache } = useQuestionShuffle(currentQuestion)

// Bank option images live in `question-images`; the shared options list takes
// fully-resolved URLs (the assessment runner resolves per the RPC's bucket).
const sessionDisplayOptions = computed<DisplayOption[]>(() =>
  displayOptions.value.map((option) => ({
    id: option.id,
    text: option.text,
    imageUrl: option.imagePath
      ? questionsStore.getThumbnailQuestionImageUrl(option.imagePath)
      : null,
  })),
)

const answeredCount = computed(() => practiceStore.currentAttempt?.answers.length ?? 0)
const progress = computed(() => {
  if (!practiceStore.totalQuestions) return 0
  return (answeredCount.value / practiceStore.totalQuestions) * 100
})

const isFirstQuestion = computed(() => practiceStore.currentQuestionNumber === 1)
const isLastQuestion = computed(
  () => practiceStore.currentQuestionNumber === practiceStore.totalQuestions,
)

// Check if all options are image-only (no text)
const isImageOnlyOptions = computed(() => {
  if (!displayOptions.value.length) return false
  return displayOptions.value.every((opt) => opt.imagePath && !opt.text?.trim())
})

function goPrevious() {
  commitCurrentAnswer(elapsedSeconds())
  practiceStore.previousQuestion()
}

function goNext() {
  commitCurrentAnswer(elapsedSeconds())
  practiceStore.nextQuestion()
}

function goToQuestion(index: number) {
  if (index === practiceStore.currentQuestionNumber - 1) return
  commitCurrentAnswer(elapsedSeconds())
  practiceStore.goToQuestion(index)
}

function openSubmitDialog() {
  commitCurrentAnswer(elapsedSeconds())
  questionStartTime.value = Date.now()
  showSubmitDialog.value = true
}

async function submitQuiz() {
  // Re-entrancy guard: a second click would fire a duplicate RPC and store the
  // attempt twice.
  if (isSubmitting.value) return

  isSubmitting.value = true
  try {
    const result = await practiceStore.submitAttempt()
    if (result.sessionId) {
      clearShuffleCache()
      toast.success(t.value.student.practiceQuiz.toastCompleted)
      router.replace(`${basePath.value}/session/${result.sessionId}`)
    } else {
      toast.error(result.error ?? t.value.student.practiceQuiz.toastCompleteFailed)
    }
  } finally {
    isSubmitting.value = false
  }
}

function exitQuiz() {
  practiceStore.endAttempt()
  // Free shuffled-option cache so it stays bounded to the current attempt.
  clearShuffleCache()
  const destination = pendingNavigation.value ?? `${basePath.value}/practice`
  pendingNavigation.value = null
  router.push(destination)
}

// Answering is local now, so every input change just updates the draft. MCQ
// replaces the selection, MRQ toggles it.
function handleOptionClick(optionId: string) {
  if (!currentQuestion.value) return

  if (currentQuestion.value.type === 'mcq') {
    selectedOptionIds.value = new Set([optionId])
  } else if (currentQuestion.value.type === 'mrq') {
    const newSet = new Set(selectedOptionIds.value)
    if (newSet.has(optionId)) {
      newSet.delete(optionId)
    } else {
      newSet.add(optionId)
    }
    selectedOptionIds.value = newSet
  }
  commitCurrentAnswer()
}

// Typing in the short-answer box updates the draft as it goes
watch(textAnswer, () => {
  if (currentQuestion.value?.type === 'short_answer') commitCurrentAnswer()
})

// Leaving mid-attempt discards it, so confirm first
onBeforeRouteLeave((to) => {
  if (!practiceStore.isAttemptActive) {
    return true
  }

  if (pendingNavigation.value) {
    return true
  }

  pendingNavigation.value = to.fullPath
  showExitDialog.value = true
  return false
})
</script>

<template>
  <div class="p-6">
    <!-- Session Info & Progress -->
    <div class="mb-6">
      <div class="mb-2 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold">
            {{ practiceStore.currentAttempt?.subjectName }} -
            {{ practiceStore.currentAttempt?.topicName }}
          </h1>
          <p class="text-sm text-muted-foreground">
            {{
              t.student.practiceQuiz.questionOf(
                practiceStore.currentQuestionNumber,
                practiceStore.totalQuestions,
              )
            }}
            &middot;
            {{ t.student.practiceQuiz.answeredOf(answeredCount, practiceStore.totalQuestions) }}
          </p>
        </div>
        <Button variant="outline" size="sm" @click="showExitDialog = true">
          {{ t.student.practiceQuiz.exitQuiz }}
        </Button>
      </div>
      <Progress :model-value="progress" class="h-2" />
    </div>

    <!-- Question Card -->
    <div v-if="currentQuestion">
      <Card>
        <CardHeader>
          <div class="flex items-start justify-between gap-4">
            <div
              class="text-lg font-semibold leading-relaxed"
              v-html="parseSimpleMarkdown(currentQuestion.question)"
            />
            <Badge variant="secondary" class="shrink-0">
              {{
                currentQuestion.type === 'mcq'
                  ? t.student.practiceQuiz.multipleChoice
                  : currentQuestion.type === 'mrq'
                    ? t.student.practiceQuiz.multipleResponse
                    : t.student.practiceQuiz.shortAnswer
              }}
            </Badge>
          </div>
        </CardHeader>

        <CardContent class="space-y-4">
          <!-- Question Image (using optimized URL for faster loading) -->
          <!-- Key forces re-render on question change to prevent showing previous image -->
          <div v-if="currentQuestion.imagePath" class="flex justify-center">
            <img
              :key="currentQuestion.id"
              :src="questionsStore.getOptimizedQuestionImageUrl(currentQuestion.imagePath)"
              alt="Question image"
              class="max-h-64 rounded-lg border object-contain"
              loading="eager"
            />
          </div>

          <!-- MCQ/MRQ Options (shuffled and filtered) — deferred feedback:
               the student's own selection only, never correctness. Answers
               stay editable right up to submit. -->
          <QuestionOptionsList
            v-if="currentQuestion.type === 'mcq' || currentQuestion.type === 'mrq'"
            :options="sessionDisplayOptions"
            :question-id="currentQuestion.id"
            :question-type="currentQuestion.type"
            :selected-option-ids="selectedOptionIds"
            :is-image-only="isImageOnlyOptions"
            :disabled="isSubmitting"
            @select="handleOptionClick"
          />

          <!-- Short Answer Input — no correctness feedback until submission.
               Enter advances rather than submitting the quiz; the draft is
               already saved on every keystroke. -->
          <ShortAnswerInput
            v-if="currentQuestion.type === 'short_answer'"
            v-model="textAnswer"
            :disabled="isSubmitting"
            @submit="goNext"
          />
        </CardContent>

        <CardFooter class="flex items-center gap-2">
          <Button variant="outline" :disabled="isFirstQuestion" @click="goPrevious">
            <ChevronLeft class="mr-2 size-4" />
            {{ t.student.practiceQuiz.previous }}
          </Button>

          <p
            v-if="!practiceStore.allQuestionsAnswered"
            class="hidden text-sm text-muted-foreground sm:block"
          >
            {{ t.student.practiceQuiz.unansweredHint(practiceStore.unansweredCount) }}
          </p>

          <div class="ml-auto flex gap-2">
            <Button v-if="!isLastQuestion" @click="goNext">
              {{ t.student.practiceQuiz.next }}
              <ChevronRight class="ml-2 size-4" />
            </Button>

            <Button
              v-else
              :disabled="!practiceStore.allQuestionsAnswered || isSubmitting"
              @click="openSubmitDialog"
            >
              {{
                isSubmitting ? t.student.practiceQuiz.submitting : t.student.practiceQuiz.submitQuiz
              }}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <!-- Question Navigation: answered = filled, current = primary.
           No correctness colors — feedback is deferred to the results. -->
      <div class="mt-4 flex flex-wrap justify-center gap-2">
        <button
          v-for="(q, index) in practiceStore.currentAttempt?.questions"
          :key="q.id"
          class="flex size-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors"
          :class="{
            'border-primary bg-primary text-primary-foreground':
              index === practiceStore.currentQuestionNumber - 1,
            'border-primary/50 bg-primary/10':
              index !== practiceStore.currentQuestionNumber - 1 &&
              practiceStore.answeredQuestionIds.has(q.id),
            'hover:border-primary/50': index !== practiceStore.currentQuestionNumber - 1,
          }"
          @click="goToQuestion(index)"
        >
          {{ index + 1 }}
        </button>
      </div>
    </div>

    <!-- Exit Confirmation Dialog -->
    <AlertDialog v-model:open="showExitDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t.student.practiceQuiz.exitDialog.title }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t.student.practiceQuiz.exitDialog.description }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="pendingNavigation = null">{{
            t.student.practiceQuiz.exitDialog.continueQuiz
          }}</AlertDialogCancel>
          <AlertDialogAction @click="exitQuiz">{{
            t.student.practiceQuiz.exitDialog.exit
          }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Submit Confirmation Dialog -->
    <AlertDialog v-model:open="showSubmitDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t.student.practiceQuiz.submitDialog.title }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t.student.practiceQuiz.submitDialog.description }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t.student.practiceQuiz.submitDialog.cancel }}</AlertDialogCancel>
          <AlertDialogAction :disabled="isSubmitting" @click="submitQuiz">{{
            t.student.practiceQuiz.submitDialog.confirm
          }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
