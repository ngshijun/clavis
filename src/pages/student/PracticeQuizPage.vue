<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { usePracticeStore } from '@/stores/practice'
import { useQuestionsStore } from '@/stores/questions'
import { useQuestionShuffle } from '@/composables/useQuestionShuffle'
import { ChevronLeft, ChevronRight, Flag } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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
import QuestionFeedbackDialog from '@/components/practice/QuestionFeedbackDialog.vue'
import QuestionOptionsList from '@/components/session/QuestionOptionsList.vue'
import ShortAnswerInput from '@/components/session/ShortAnswerInput.vue'

const router = useRouter()
const route = useRoute()
const practiceStore = usePracticeStore()
const questionsStore = useQuestionsStore()

const selectedOptionIds = ref<Set<string>>(new Set())
const textAnswer = ref('')
const showExitDialog = ref(false)
const showFeedbackDialog = ref(false)
const isResuming = ref(false)
const pendingNavigation = ref<string | null>(null)

// Time tracking for current question
const questionStartTime = ref<number>(Date.now())

// Reset timer when question changes (track by question index)
watch(
  () => practiceStore.currentQuestionNumber,
  () => {
    questionStartTime.value = Date.now()
  },
)

// Resume session from query param or redirect if no active session
onMounted(async () => {
  const sessionId = route.query.sessionId as string | undefined

  // If there's a sessionId in the URL, check if we need to resume it
  if (sessionId) {
    // Resume if no active session OR if the URL sessionId differs from current session
    const needsResume =
      !practiceStore.isSessionActive || practiceStore.currentSession?.id !== sessionId

    if (needsResume) {
      isResuming.value = true
      // Clear shuffled options from previous session
      clearShuffleCache()
      const result = await practiceStore.resumeSession(sessionId)
      isResuming.value = false

      if (result.error || !result.session) {
        // Failed to resume - replace so back button doesn't loop to this dead URL
        toast.error('Failed to resume session')
        router.replace('/student/practice')
        return
      }
    }
  } else if (!practiceStore.isSessionActive) {
    // No session ID and no active session - replace so back button doesn't loop
    router.replace('/student/practice')
  }

  // Initialize question start time
  questionStartTime.value = Date.now()
})

const currentQuestion = computed(() => practiceStore.currentQuestion)
const { displayOptions, clearCache: clearShuffleCache } = useQuestionShuffle(currentQuestion)
const currentAnswer = computed(() => practiceStore.currentAnswer)
const isAnswered = computed(() => practiceStore.isCurrentQuestionAnswered)
const progress = computed(() => {
  if (!practiceStore.totalQuestions) return 0
  return (practiceStore.currentQuestionNumber / practiceStore.totalQuestions) * 100
})

const isLastQuestion = computed(() => {
  return practiceStore.currentQuestionNumber === practiceStore.totalQuestions
})

const allQuestionsAnswered = computed(() => {
  return practiceStore.currentSession?.answers.length === practiceStore.totalQuestions
})

// O(1) lookup Map for answers by question ID (avoids repeated .find() calls in template)
const answerByQuestionId = computed(() => {
  const map = new Map<string, { isCorrect: boolean }>()
  for (const answer of practiceStore.currentSession?.answers ?? []) {
    if (answer.questionId) {
      map.set(answer.questionId, { isCorrect: answer.isCorrect })
    }
  }
  return map
})

// Get correct answer for display
const correctAnswer = computed(() => {
  if (!currentQuestion.value) return ''
  if (currentQuestion.value.type === 'mcq') {
    const correct = currentQuestion.value.options.find((o) => o.isCorrect)
    return correct?.text ?? ''
  }
  if (currentQuestion.value.type === 'mrq') {
    const correctOptions = currentQuestion.value.options.filter((o) => o.isCorrect)
    return correctOptions.map((o) => o.text).join(', ')
  }
  return currentQuestion.value.answer ?? ''
})

// Get the selected option ids from the current answer (convert from numbers to letters)
const answeredOptionIds = computed(() => {
  if (!currentAnswer.value?.selectedOptions) return []
  return practiceStore.optionNumbersToIds(currentAnswer.value.selectedOptions)
})

// Check if all options are image-only (no text)
const isImageOnlyOptions = computed(() => {
  if (!displayOptions.value.length) return false
  return displayOptions.value.every((opt) => opt.imagePath && !opt.text?.trim())
})

async function submitAnswer() {
  if (!currentQuestion.value) return

  // Calculate time spent on this question in seconds
  const timeSpentSeconds = Math.round((Date.now() - questionStartTime.value) / 1000)

  if (currentQuestion.value.type === 'mcq' || currentQuestion.value.type === 'mrq') {
    if (selectedOptionIds.value.size === 0) return
    await practiceStore.submitAnswer(
      Array.from(selectedOptionIds.value),
      undefined,
      timeSpentSeconds,
    )
  } else {
    if (!textAnswer.value.trim()) return
    await practiceStore.submitAnswer(undefined, textAnswer.value.trim(), timeSpentSeconds)
  }
}

async function nextQuestion() {
  // Reset input state
  selectedOptionIds.value = new Set()
  textAnswer.value = ''
  await practiceStore.nextQuestion()
}

async function previousQuestion() {
  // Reset input state
  selectedOptionIds.value = new Set()
  textAnswer.value = ''
  await practiceStore.previousQuestion()
}

async function finishQuiz() {
  const result = await practiceStore.completeSession()
  if (result.session) {
    toast.success('Quiz completed!')
    router.replace(`/student/session/${result.session.id}`)
  } else if (result.error) {
    toast.error('Failed to complete quiz')
  }
}

function exitQuiz() {
  practiceStore.endSession()
  // Navigate to pending destination or default to practice page
  const destination = pendingNavigation.value ?? '/student/practice'
  pendingNavigation.value = null
  router.push(destination)
}

async function restartQuiz() {
  const session = practiceStore.currentSession
  if (session) {
    practiceStore.endSession()
    await practiceStore.startSession(session.subTopicId)
    selectedOptionIds.value = new Set()
    textAnswer.value = ''
  }
}

function goHome() {
  practiceStore.endSession()
  router.push('/student/practice')
}

async function goToQuestion(index: number) {
  await practiceStore.goToQuestion(index)
  selectedOptionIds.value = new Set()
  textAnswer.value = ''
}

// Handle option click - single select for MCQ, toggle for MRQ
function handleOptionClick(optionId: string) {
  if (!currentQuestion.value) return

  if (currentQuestion.value.type === 'mcq') {
    // MCQ: single selection — submit immediately on click
    selectedOptionIds.value = new Set([optionId])
    submitAnswer()
    return
  } else if (currentQuestion.value.type === 'mrq') {
    // MRQ: toggle selection (checkbox behavior)
    const newSet = new Set(selectedOptionIds.value)
    if (newSet.has(optionId)) {
      newSet.delete(optionId)
    } else {
      newSet.add(optionId)
    }
    selectedOptionIds.value = newSet
  }
}

// Navigation guard - show exit confirmation when navigating away from active quiz
onBeforeRouteLeave((to) => {
  // Allow navigation if no active session or session is completed
  if (!practiceStore.isSessionActive) {
    return true
  }

  // If already confirmed via dialog, allow navigation
  if (pendingNavigation.value) {
    return true
  }

  // Block navigation and show exit dialog
  pendingNavigation.value = to.fullPath
  showExitDialog.value = true
  return false
})
</script>

<template>
  <div class="p-6">
    <!-- Loading state while resuming session -->
    <div v-if="isResuming" class="flex flex-col items-center justify-center py-20">
      <div
        class="mb-4 size-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
      ></div>
      <p class="text-muted-foreground">Resuming your session...</p>
    </div>

    <template v-else>
      <!-- Session Info & Progress -->
      <div class="mb-6">
        <div class="mb-2 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-bold">
              {{ practiceStore.currentSession?.subjectName }} -
              {{ practiceStore.currentSession?.topicName }}
            </h1>
            <p class="text-sm text-muted-foreground">
              Question {{ practiceStore.currentQuestionNumber }} of
              {{ practiceStore.totalQuestions }}
            </p>
          </div>
          <Button variant="outline" size="sm" @click="showExitDialog = true"> Exit Quiz </Button>
        </div>
        <Progress :model-value="progress" class="h-2" />
      </div>

      <!-- Question Card -->
      <div v-if="currentQuestion">
        <Card>
          <CardHeader>
            <div class="flex items-start justify-between gap-4">
              <CardTitle class="text-lg whitespace-pre-line">{{
                currentQuestion.question
              }}</CardTitle>
              <Badge variant="secondary" class="shrink-0">
                {{
                  currentQuestion.type === 'mcq'
                    ? 'Multiple Choice'
                    : currentQuestion.type === 'mrq'
                      ? 'Multiple Response'
                      : 'Short Answer'
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

            <!-- MCQ/MRQ Options (shuffled and filtered) -->
            <QuestionOptionsList
              v-if="currentQuestion.type === 'mcq' || currentQuestion.type === 'mrq'"
              :options="displayOptions"
              :question-id="currentQuestion.id"
              :question-type="currentQuestion.type"
              :selected-option-ids="selectedOptionIds"
              :is-answered="isAnswered"
              :answered-option-ids="answeredOptionIds"
              :is-image-only="isImageOnlyOptions"
              @select="handleOptionClick"
            />

            <!-- Short Answer Input -->
            <ShortAnswerInput
              v-if="currentQuestion.type === 'short_answer'"
              v-model="textAnswer"
              :is-answered="isAnswered"
              :is-correct="currentAnswer?.isCorrect ?? null"
              :correct-answer="correctAnswer"
              @submit="submitAnswer"
            />

            <!-- Explanation (shown after answering, if wrong) -->
            <div
              v-if="isAnswered"
              class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20"
            >
              <p class="text-sm font-medium text-amber-800 dark:text-amber-200">Explanation</p>
              <p class="mt-1 text-sm text-amber-700 dark:text-amber-300">
                {{ currentQuestion.explanation || 'No explanation available for this question.' }}
              </p>
            </div>
          </CardContent>

          <CardFooter class="flex justify-between">
            <Button
              variant="outline"
              :disabled="practiceStore.currentQuestionNumber === 1"
              @click="previousQuestion"
            >
              <ChevronLeft class="mr-2 size-4" />
              Previous
            </Button>

            <button
              v-if="isAnswered"
              class="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
              @click="showFeedbackDialog = true"
            >
              <Flag class="size-3" />
              Report an issue
            </button>

            <div class="flex gap-2">
              <Button
                v-if="!isAnswered"
                :disabled="
                  currentQuestion.type === 'mcq' || currentQuestion.type === 'mrq'
                    ? selectedOptionIds.size === 0
                    : !textAnswer.trim()
                "
                @click="submitAnswer"
              >
                Submit Answer
              </Button>

              <Button v-else-if="!isLastQuestion" @click="nextQuestion">
                Next
                <ChevronRight class="ml-2 size-4" />
              </Button>

              <Button v-else-if="allQuestionsAnswered" @click="finishQuiz"> Finish Quiz </Button>

              <Button v-else @click="nextQuestion">
                Next
                <ChevronRight class="ml-2 size-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>

        <!-- Question Navigation -->
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          <button
            v-for="(q, index) in practiceStore.currentSession?.questions"
            :key="q.id"
            class="flex size-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors"
            :class="{
              'border-primary bg-primary text-primary-foreground':
                index === practiceStore.currentQuestionNumber - 1,
              'border-green-500 bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300':
                answerByQuestionId.get(q.id)?.isCorrect,
              'border-red-500 bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300':
                answerByQuestionId.has(q.id) && !answerByQuestionId.get(q.id)?.isCorrect,
              'hover:border-primary/50': index !== practiceStore.currentQuestionNumber - 1,
            }"
            @click="goToQuestion(index)"
          >
            {{ index + 1 }}
          </button>
        </div>
      </div>
    </template>

    <!-- Exit Confirmation Dialog -->
    <AlertDialog v-model:open="showExitDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Exit Quiz?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to exit? Your progress is saved and you can continue later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="pendingNavigation = null">Continue Quiz</AlertDialogCancel>
          <AlertDialogAction @click="exitQuiz">Exit</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Question Feedback Dialog -->
    <QuestionFeedbackDialog
      v-if="currentQuestion"
      v-model:open="showFeedbackDialog"
      :question-id="currentQuestion.id"
    />
  </div>
</template>
