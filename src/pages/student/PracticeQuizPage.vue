<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { usePracticeStore } from '@/stores/practice'
import { useQuestionsStore } from '@/stores/questions'
import { useQuestionShuffle } from '@/composables/useQuestionShuffle'
import { useT } from '@/composables/useT'
import { parseSimpleMarkdown } from '@/lib/utils'
import { ChevronRight, Flag } from 'lucide-vue-next'
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
import QuestionFeedbackDialog from '@/components/practice/QuestionFeedbackDialog.vue'
import QuestionOptionsList from '@/components/session/QuestionOptionsList.vue'
import ShortAnswerInput from '@/components/session/ShortAnswerInput.vue'

const router = useRouter()
const route = useRoute()
const practiceStore = usePracticeStore()
const questionsStore = useQuestionsStore()
const t = useT()

const selectedOptionIds = ref<Set<string>>(new Set())
const textAnswer = ref('')
const showExitDialog = ref(false)
const showFeedbackDialog = ref(false)
const isResuming = ref(false)
const isSubmitting = ref(false)
const isFinishing = ref(false)
const pendingNavigation = ref<string | null>(null)

// Time tracking for current question
const questionStartTime = ref<number>(Date.now())

/**
 * Hydrate the local inputs from the saved answer so navigating back shows the
 * student's own selection (deferred feedback — never correctness, decision 40).
 */
function hydrateInputs() {
  const answer = practiceStore.currentAnswer
  selectedOptionIds.value = new Set(
    practiceStore.optionNumbersToIds(answer?.selectedOptions ?? null),
  )
  textAnswer.value = answer?.textAnswer ?? ''
}

// Reset timer + rehydrate inputs when the question (or session) changes
watch(
  () => [practiceStore.currentSession?.id, practiceStore.currentQuestionNumber],
  () => {
    questionStartTime.value = Date.now()
    hydrateInputs()
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
        toast.error(t.value.student.practiceQuiz.toastResumeError)
        router.replace('/student/practice')
        return
      }
    }
  } else if (!practiceStore.isSessionActive) {
    // No session ID and no active session - replace so back button doesn't loop
    router.replace('/student/practice')
  }

  // Initialize question start time and input state
  questionStartTime.value = Date.now()
  hydrateInputs()
})

const currentQuestion = computed(() => practiceStore.currentQuestion)
const { displayOptions, clearCache: clearShuffleCache } = useQuestionShuffle(currentQuestion)
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

// Answered questions for the navigation grid (no correctness — decision 40)
const answeredQuestionIds = computed(() => {
  const ids = new Set<string>()
  for (const answer of practiceStore.currentSession?.answers ?? []) {
    if (answer.questionId) ids.add(answer.questionId)
  }
  return ids
})

// Check if all options are image-only (no text)
const isImageOnlyOptions = computed(() => {
  if (!displayOptions.value.length) return false
  return displayOptions.value.every((opt) => opt.imagePath && !opt.text?.trim())
})

async function submitAnswer() {
  if (!currentQuestion.value || isAnswered.value) return
  // In-flight guard: prevents a second insert (e.g. double-tap on a different
  // MCQ option) firing before isAnswered flips, which would violate the
  // UNIQUE(session_id, question_id) constraint on practice_answers.
  if (isSubmitting.value) return

  // Calculate time spent on this question in seconds
  const timeSpentSeconds = Math.round((Date.now() - questionStartTime.value) / 1000)

  isSubmitting.value = true
  try {
    if (currentQuestion.value.type === 'mcq' || currentQuestion.value.type === 'mrq') {
      if (selectedOptionIds.value.size === 0) return
      const { error } = await practiceStore.submitAnswer(
        Array.from(selectedOptionIds.value),
        undefined,
        timeSpentSeconds,
      )
      if (error) {
        toast.error(error)
      }
    } else {
      if (!textAnswer.value.trim()) return
      await practiceStore.submitAnswer(undefined, textAnswer.value.trim(), timeSpentSeconds)
    }
  } finally {
    isSubmitting.value = false
  }
}

async function nextQuestion() {
  // Input state is rehydrated by the question-change watcher
  await practiceStore.nextQuestion()
}

async function finishQuiz() {
  // Re-entrancy guard: a second click before the first completion resolves
  // would fire a duplicate complete_practice_session RPC, which raises
  // 'Session already completed' and surfaces as a spurious failure toast.
  if (isFinishing.value) return

  isFinishing.value = true
  try {
    const result = await practiceStore.completeSession()
    if (result.session) {
      clearShuffleCache()
      toast.success(t.value.student.practiceQuiz.toastCompleted)
      router.replace(`/student/session/${result.session.id}`)
    } else if (result.error) {
      toast.error(t.value.student.practiceQuiz.toastCompleteFailed)
    }
  } finally {
    isFinishing.value = false
  }
}

function exitQuiz() {
  practiceStore.endSession()
  // Free shuffled-option cache so it stays bounded to the current session.
  clearShuffleCache()
  // Navigate to pending destination or default to practice page
  const destination = pendingNavigation.value ?? '/student/practice'
  pendingNavigation.value = null
  router.push(destination)
}

async function goToQuestion(index: number) {
  await practiceStore.goToQuestion(index)
}

// Handle option click - single select for MCQ, toggle for MRQ
function handleOptionClick(optionId: string) {
  if (!currentQuestion.value || isAnswered.value) return

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
      <p class="text-muted-foreground">{{ t.student.practiceQuiz.resumingSession }}</p>
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
              {{
                t.student.practiceQuiz.questionOf(
                  practiceStore.currentQuestionNumber,
                  practiceStore.totalQuestions,
                )
              }}
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
                 the student's own selection only, never correctness -->
            <QuestionOptionsList
              v-if="currentQuestion.type === 'mcq' || currentQuestion.type === 'mrq'"
              :options="displayOptions"
              :question-id="currentQuestion.id"
              :question-type="currentQuestion.type"
              :selected-option-ids="selectedOptionIds"
              :is-image-only="isImageOnlyOptions"
              :disabled="isSubmitting || isAnswered"
              @select="handleOptionClick"
            />

            <!-- Short Answer Input — no correctness feedback until completion -->
            <ShortAnswerInput
              v-if="currentQuestion.type === 'short_answer'"
              v-model="textAnswer"
              :disabled="isAnswered"
              @submit="submitAnswer"
            />
          </CardContent>

          <CardFooter class="flex items-center">
            <button
              v-if="isAnswered"
              class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
              @click="showFeedbackDialog = true"
            >
              <Flag class="size-3.5" />
              {{ t.student.practiceQuiz.reportIssue }}
            </button>

            <div class="ml-auto flex gap-2">
              <Button
                v-if="!isAnswered && currentQuestion.type !== 'mcq'"
                :disabled="
                  currentQuestion.type === 'mrq' ? selectedOptionIds.size === 0 : !textAnswer.trim()
                "
                @click="submitAnswer"
              >
                {{ t.student.practiceQuiz.submitAnswer }}
              </Button>

              <template v-if="isAnswered">
                <Button v-if="!isLastQuestion" @click="nextQuestion">
                  {{ t.student.practiceQuiz.next }}
                  <ChevronRight class="ml-2 size-4" />
                </Button>

                <Button
                  v-else-if="allQuestionsAnswered"
                  :disabled="isFinishing"
                  @click="finishQuiz"
                >
                  {{ t.student.practiceQuiz.finishQuiz }}
                </Button>

                <Button v-else @click="nextQuestion">
                  {{ t.student.practiceQuiz.next }}
                  <ChevronRight class="ml-2 size-4" />
                </Button>
              </template>
            </div>
          </CardFooter>
        </Card>

        <!-- Question Navigation: answered = filled, current = primary.
             No correctness colors — feedback is deferred to the results. -->
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          <button
            v-for="(q, index) in practiceStore.currentSession?.questions"
            :key="q.id"
            class="flex size-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors"
            :class="{
              'border-primary bg-primary text-primary-foreground':
                index === practiceStore.currentQuestionNumber - 1,
              'border-primary/50 bg-primary/10':
                index !== practiceStore.currentQuestionNumber - 1 && answeredQuestionIds.has(q.id),
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

    <!-- Question Feedback Dialog -->
    <QuestionFeedbackDialog
      v-if="currentQuestion"
      v-model:open="showFeedbackDialog"
      :question-id="currentQuestion.id"
    />
  </div>
</template>
