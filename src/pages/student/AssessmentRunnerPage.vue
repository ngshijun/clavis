<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { useStudentAssessmentsStore } from '@/stores/student-assessments'
import { getStorageImageUrl } from '@/lib/storage'
import { useT } from '@/composables/useT'
import { parseSimpleMarkdown } from '@/lib/utils'
import { shuffle } from '@/lib/practiceHelpers'
import {
  buildTrueFalseResponse,
  buildClozeResponse,
  buildMatchingResponse,
  buildOrderingResponse,
  trueFalseFromResponse,
  clozeValuesFromResponse,
  matchingSelectionFromResponse,
  orderingIdsFromResponse,
  type AttemptAnswerResponse,
} from '@/lib/attemptResponse'
import type { RunnerOption } from '@/stores/student-assessments'
import { AlarmClock, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import TrueFalseAnswerInput from '@/components/session/TrueFalseAnswerInput.vue'
import NumericAnswerInput from '@/components/session/NumericAnswerInput.vue'
import ClozeAnswerInput from '@/components/session/ClozeAnswerInput.vue'
import MatchingAnswerInput from '@/components/session/MatchingAnswerInput.vue'
import OrderingAnswerInput from '@/components/session/OrderingAnswerInput.vue'

const router = useRouter()
const route = useRoute()
const store = useStudentAssessmentsStore()
const t = useT()
const { basePath } = useActiveClassroom()

// Per-question input state, hydrated from the saved answer on navigation.
const selectedNumbers = ref<Set<number>>(new Set())
const textAnswer = ref('')
const trueFalseValue = ref<boolean | null>(null)
const clozeValues = ref<Record<number, string>>({})
const matchingSelection = ref<Record<string, string | null>>({})
const orderingIds = ref<string[]>([])

const isSaving = ref(false)
const isCompleting = ref(false)
const showSubmitDialog = ref(false)
const showLeaveDialog = ref(false)
const pendingNavigation = ref<string | null>(null)

// Countdown (UX only — the server enforces the write cutoff + 30s grace)
const remainingSeconds = ref<number | null>(null)
let timerHandle: ReturnType<typeof setInterval> | null = null

// Time tracking for the current question
const questionStartTime = ref<number>(Date.now())

// Client-side option shuffle (decision 31), cached per question so navigating
// back shows the same order. Question order itself is the frozen snapshot.
// The new types need no client shuffle: matching `right` and ordering `items`
// arrive pre-scrambled per attempt from the server (do NOT re-shuffle).
const shuffledOptionsCache = new Map<string, RunnerOption[]>()

const currentQuestion = computed(() => store.currentQuestion)
const totalQuestions = computed(() => store.runnerQuestions.length)
const progress = computed(() =>
  totalQuestions.value === 0 ? 0 : ((store.currentQuestionIndex + 1) / totalQuestions.value) * 100,
)
const unansweredCount = computed(() => totalQuestions.value - store.answeredCount)

/** True for the types whose answer is flushed on navigation/submit (text-like inputs). */
const FLUSHED_TYPES = new Set(['short_answer', 'numeric', 'long_answer', 'cloze'])

/**
 * Options adapted for the shared QuestionOptionsList. The option id carries the
 * grader's 1-based option number (as a string) so the selection round-trips
 * without a letter mapping; the rendered letter badge is display-index based.
 * The component is content-only — the runner never knows correctness.
 */
const displayOptions = computed<DisplayOption[]>(() => {
  const question = currentQuestion.value
  if (!question || (question.type !== 'mcq' && question.type !== 'mrq')) return []

  let options = shuffledOptionsCache.get(question.assessmentQuestionId)
  if (!options) {
    options = shuffle(question.options)
    shuffledOptionsCache.set(question.assessmentQuestionId, options)
  }

  return options.map((option) => ({
    id: String(option.number),
    text: option.text || null,
    // Resolve against the RPC-provided bucket (P10a): bank images live in
    // `question-images`, ad-hoc images in `assessment-images`.
    imageUrl:
      option.imagePath && option.imageBucket
        ? getStorageImageUrl(option.imageBucket, option.imagePath)
        : null,
  }))
})

/** Question-level image resolved against the RPC-provided bucket (P10a). */
const questionImageUrl = computed(() => {
  const question = currentQuestion.value
  return question?.imagePath && question.imageBucket
    ? getStorageImageUrl(question.imageBucket, question.imagePath)
    : null
})

const selectedOptionIds = computed(() => new Set([...selectedNumbers.value].map(String)))

const isImageOnlyOptions = computed(() => {
  const question = currentQuestion.value
  if (!question || question.options.length === 0) return false
  return question.options.every((option) => option.imagePath && !option.text.trim())
})

function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, seconds)
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const secs = clamped % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

// Hydrate the local inputs from the saved answer whenever the question changes.
watch(
  currentQuestion,
  (question) => {
    questionStartTime.value = Date.now()
    if (!question) {
      selectedNumbers.value = new Set()
      textAnswer.value = ''
      trueFalseValue.value = null
      clozeValues.value = {}
      matchingSelection.value = {}
      orderingIds.value = []
      return
    }
    const saved = store.getAnswer(question.assessmentQuestionId)
    selectedNumbers.value = new Set(saved?.selectedOptions ?? [])
    textAnswer.value = saved?.textAnswer ?? ''
    trueFalseValue.value = trueFalseFromResponse(saved?.response ?? null)
    clozeValues.value = clozeValuesFromResponse(saved?.response ?? null)
    matchingSelection.value = matchingSelectionFromResponse(
      question.matchingLeft.map((item) => item.id),
      saved?.response ?? null,
    )
    orderingIds.value = orderingIdsFromResponse(
      question.orderingItems.map((item) => item.id),
      saved?.response ?? null,
    )
  },
  { immediate: true },
)

onMounted(async () => {
  const assessmentId = route.params.assessmentId as string
  const { error } = await store.startAttempt(assessmentId)

  if (error) {
    toast.error(error)
    router.replace(`${basePath.value}/assessments`)
    return
  }

  if (store.activeAttempt?.expiresAt) {
    updateRemaining()
    timerHandle = setInterval(updateRemaining, 1000)
  }
})

onUnmounted(() => {
  if (timerHandle) clearInterval(timerHandle)
})

function updateRemaining() {
  const expiresAt = store.activeAttempt?.expiresAt
  if (!expiresAt) return

  const remaining = Math.round((Date.parse(expiresAt) - Date.now()) / 1000)
  remainingSeconds.value = Math.max(0, remaining)

  if (remaining <= 0 && !isCompleting.value) {
    // Stop the tick before submitting so a failed completion cannot retrigger
    // an auto-submit (and its toast) every second.
    if (timerHandle) {
      clearInterval(timerHandle)
      timerHandle = null
    }
    toast.info(t.value.student.assessmentRunner.timeUp)
    submitAttempt()
  }
}

/** Persist the current input for one question (server grades it). */
async function persistAnswer(payload: {
  selectedOptions?: number[] | null
  textAnswer?: string | null
  response?: AttemptAnswerResponse | null
}): Promise<void> {
  const question = currentQuestion.value
  if (!question) return

  const timeSpentSeconds = Math.round((Date.now() - questionStartTime.value) / 1000)

  isSaving.value = true
  try {
    const outcome = await store.saveAnswer(question.assessmentQuestionId, payload, timeSpentSeconds)

    if (outcome.timeLimitExceeded) {
      // Server rejected a late write (past limit + grace): force-submit.
      // During an in-flight submission the rejection is simply dropped —
      // the server scores whatever was saved in time.
      if (!isCompleting.value) {
        toast.info(t.value.student.assessmentRunner.timeUp)
        await submitAttempt()
      }
      return
    }
    if (outcome.attemptCompleted) {
      // Attempt was completed elsewhere (e.g. another tab) — go to the result.
      if (!isCompleting.value) goToResult()
      return
    }
    if (outcome.error) {
      toast.error(outcome.error)
    }
  } finally {
    isSaving.value = false
  }
}

function handleOptionClick(optionId: string) {
  const question = currentQuestion.value
  if (!question || isSaving.value || isCompleting.value) return

  const optionNumber = Number(optionId)
  if (question.type === 'mcq') {
    selectedNumbers.value = new Set([optionNumber])
  } else {
    const next = new Set(selectedNumbers.value)
    if (next.has(optionNumber)) {
      next.delete(optionNumber)
    } else {
      next.add(optionNumber)
    }
    selectedNumbers.value = next
  }

  if (selectedNumbers.value.size === 0) return
  persistAnswer({ selectedOptions: [...selectedNumbers.value].sort((a, b) => a - b) })
}

function handleTrueFalseSelect(value: boolean) {
  if (isSaving.value || isCompleting.value) return
  trueFalseValue.value = value
  persistAnswer({ response: buildTrueFalseResponse(value) })
}

function handleMatchingSelect(leftId: string, rightId: string) {
  const question = currentQuestion.value
  if (!question || isCompleting.value) return

  matchingSelection.value = { ...matchingSelection.value, [leftId]: rightId }
  const response = buildMatchingResponse(
    question.matchingLeft.map((item) => item.id),
    matchingSelection.value,
  )
  if (response) persistAnswer({ response })
}

function handleOrderingChange(ids: string[]) {
  if (isCompleting.value) return
  orderingIds.value = ids
  persistAnswer({ response: buildOrderingResponse(ids) })
}

/**
 * Save a non-empty, changed flushed-type answer (Enter, navigation, submit).
 * short_answer / numeric / long_answer carry `text_answer`; cloze carries a
 * `response` with exactly one entry per filled blank.
 */
async function flushPendingAnswer(): Promise<void> {
  const question = currentQuestion.value
  if (!question || !FLUSHED_TYPES.has(question.type)) return

  const saved = store.getAnswer(question.assessmentQuestionId)

  if (question.type === 'cloze') {
    const response = buildClozeResponse(clozeValues.value)
    if (!response) return
    if (saved?.response && JSON.stringify(saved.response) === JSON.stringify(response)) return
    await persistAnswer({ response })
    return
  }

  const trimmed = textAnswer.value.trim()
  if (!trimmed) return
  if (saved?.textAnswer === trimmed) return

  await persistAnswer({ textAnswer: trimmed })
}

async function goToQuestion(index: number) {
  await flushPendingAnswer()
  await store.goToQuestion(index)
}

async function submitAttempt() {
  // Re-entrancy guard: timer expiry, a rejected late write, and a manual
  // submit can race — complete_assessment_attempt is idempotent server-side,
  // but one navigation is enough.
  if (isCompleting.value) return

  isCompleting.value = true
  try {
    await flushPendingAnswer()

    const { result, error } = await store.completeAttempt()
    if (!result) {
      toast.error(error ?? t.value.student.assessmentRunner.toastSubmitFailed)
      isCompleting.value = false
      return
    }

    if (!result.alreadyCompleted) {
      toast.success(t.value.student.assessmentRunner.toastSubmitted)
    }
    goToResult()
  } catch {
    isCompleting.value = false
  }
}

function goToResult() {
  const attemptId = store.activeAttempt?.attemptId
  store.clearRunner()
  if (timerHandle) clearInterval(timerHandle)
  if (attemptId) {
    router.replace(`${basePath.value}/assessments/attempts/${attemptId}/result`)
  } else {
    router.replace(`${basePath.value}/assessments`)
  }
}

function confirmLeave() {
  store.clearRunner()
  const destination = pendingNavigation.value ?? `${basePath.value}/assessments`
  pendingNavigation.value = null
  router.push(destination)
}

onBeforeRouteLeave((to) => {
  // Answers and cursor are persisted continuously; leaving only abandons the
  // in-memory runner. Confirm because a timed attempt keeps counting down.
  // (confirmLeave clears the runner first, so its navigation passes here.)
  if (!store.activeAttempt || isCompleting.value) return true

  pendingNavigation.value = to.fullPath
  showLeaveDialog.value = true
  return false
})
</script>

<template>
  <div class="p-6">
    <!-- Loading state while starting/resuming -->
    <div v-if="store.isStarting" class="flex flex-col items-center justify-center py-20">
      <div
        class="mb-4 size-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
      ></div>
      <p class="text-muted-foreground">{{ t.student.assessmentRunner.loading }}</p>
    </div>

    <template v-else-if="store.activeAttempt && currentQuestion">
      <!-- Header: title, progress, timer -->
      <div class="mb-6">
        <div class="mb-2 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <h1 class="truncate text-xl font-bold">{{ store.activeAttempt.title }}</h1>
            <p class="text-sm text-muted-foreground">
              {{
                t.student.assessmentRunner.questionOf(
                  store.currentQuestionIndex + 1,
                  totalQuestions,
                )
              }}
              ·
              {{ t.student.assessmentRunner.answeredCount(store.answeredCount, totalQuestions) }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <div
              v-if="remainingSeconds !== null"
              class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium tabular-nums"
              :class="
                remainingSeconds <= 60
                  ? 'border-destructive text-destructive'
                  : 'text-muted-foreground'
              "
            >
              <AlarmClock class="size-4" />
              {{ formatCountdown(remainingSeconds) }}
            </div>
            <Button
              variant="default"
              size="sm"
              :disabled="isCompleting"
              @click="showSubmitDialog = true"
            >
              {{ t.student.assessmentRunner.submit }}
            </Button>
          </div>
        </div>
        <Progress :model-value="progress" class="h-2" />
      </div>

      <!-- Question card -->
      <Card>
        <CardHeader>
          <div class="flex items-start justify-between gap-4">
            <div
              v-if="currentQuestion.question"
              class="text-lg font-semibold leading-relaxed"
              v-html="parseSimpleMarkdown(currentQuestion.question)"
            />
            <!-- A promptless cloze has no question text — the cloze text below is the prompt. -->
            <div v-else />
            <div class="flex shrink-0 flex-col items-end gap-1">
              <Badge variant="secondary">{{ t.shared.questionTypes[currentQuestion.type] }}</Badge>
              <span class="text-xs text-muted-foreground">
                {{ t.student.assessmentRunner.points(currentQuestion.points) }}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent class="space-y-4">
          <!-- Question image -->
          <div v-if="questionImageUrl" class="flex justify-center">
            <img
              :key="currentQuestion.assessmentQuestionId"
              :src="questionImageUrl"
              :alt="t.shared.questionPreviewDialog.questionImageAlt"
              class="max-h-64 rounded-lg border object-contain"
              loading="eager"
            />
          </div>

          <!-- Inputs per type. Mid-attempt there is NO correctness feedback of
               any kind (deferred-feedback contract) — every input is neutral
               and revisable until submission. -->
          <QuestionOptionsList
            v-if="currentQuestion.type === 'mcq' || currentQuestion.type === 'mrq'"
            :options="displayOptions"
            :question-id="currentQuestion.assessmentQuestionId"
            :question-type="currentQuestion.type"
            :selected-option-ids="selectedOptionIds"
            :is-image-only="isImageOnlyOptions"
            :disabled="isSaving || isCompleting"
            @select="handleOptionClick"
          />

          <ShortAnswerInput
            v-else-if="currentQuestion.type === 'short_answer'"
            v-model="textAnswer"
            :disabled="isCompleting"
            @submit="flushPendingAnswer"
          />

          <TrueFalseAnswerInput
            v-else-if="currentQuestion.type === 'true_false'"
            :model-value="trueFalseValue"
            :disabled="isSaving || isCompleting"
            @select="handleTrueFalseSelect"
          />

          <NumericAnswerInput
            v-else-if="currentQuestion.type === 'numeric'"
            v-model="textAnswer"
            :unit="currentQuestion.unit"
            :disabled="isCompleting"
            @submit="flushPendingAnswer"
          />

          <ClozeAnswerInput
            v-else-if="currentQuestion.type === 'cloze' && currentQuestion.clozeText"
            v-model="clozeValues"
            :text="currentQuestion.clozeText"
            :blank-indices="currentQuestion.clozeBlankIndices"
            :disabled="isCompleting"
          />

          <MatchingAnswerInput
            v-else-if="currentQuestion.type === 'matching'"
            :left="currentQuestion.matchingLeft"
            :right="currentQuestion.matchingRight"
            :model-value="matchingSelection"
            :disabled="isCompleting"
            @select="handleMatchingSelect"
          />

          <OrderingAnswerInput
            v-else-if="currentQuestion.type === 'ordering'"
            :items="currentQuestion.orderingItems"
            :model-value="orderingIds"
            :disabled="isCompleting"
            @change="handleOrderingChange"
          />

          <Textarea
            v-else-if="currentQuestion.type === 'long_answer'"
            v-model="textAnswer"
            :placeholder="t.student.assessmentRunner.longAnswerPlaceholder"
            :disabled="isCompleting"
            rows="6"
            class="text-base"
          />
        </CardContent>

        <CardFooter class="flex items-center justify-between">
          <Button
            variant="outline"
            :disabled="store.currentQuestionIndex === 0 || isCompleting"
            @click="goToQuestion(store.currentQuestionIndex - 1)"
          >
            <ChevronLeft class="mr-2 size-4" />
            {{ t.student.assessmentRunner.previous }}
          </Button>
          <Button
            v-if="store.currentQuestionIndex < totalQuestions - 1"
            :disabled="isCompleting"
            @click="goToQuestion(store.currentQuestionIndex + 1)"
          >
            {{ t.student.assessmentRunner.next }}
            <ChevronRight class="ml-2 size-4" />
          </Button>
          <Button v-else :disabled="isCompleting" @click="showSubmitDialog = true">
            {{ t.student.assessmentRunner.submit }}
          </Button>
        </CardFooter>
      </Card>

      <!-- Question navigation: answered = filled, current = primary.
           No correctness colors — the runner never knows correctness. -->
      <div class="mt-4 flex flex-wrap justify-center gap-2">
        <button
          v-for="(question, index) in store.runnerQuestions"
          :key="question.assessmentQuestionId"
          class="flex size-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors"
          :class="{
            'border-primary bg-primary text-primary-foreground':
              index === store.currentQuestionIndex,
            'border-primary/50 bg-primary/10':
              index !== store.currentQuestionIndex &&
              store.getAnswer(question.assessmentQuestionId) !== null,
            'hover:border-primary/50': index !== store.currentQuestionIndex,
          }"
          @click="goToQuestion(index)"
        >
          {{ index + 1 }}
        </button>
      </div>
    </template>

    <!-- Submit confirmation -->
    <AlertDialog v-model:open="showSubmitDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t.student.assessmentRunner.submitDialog.title }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{
              unansweredCount > 0
                ? t.student.assessmentRunner.submitDialog.descriptionUnanswered(unansweredCount)
                : t.student.assessmentRunner.submitDialog.descriptionAllAnswered
            }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{
            t.student.assessmentRunner.submitDialog.cancel
          }}</AlertDialogCancel>
          <AlertDialogAction :disabled="isCompleting" @click="submitAttempt">
            {{ t.student.assessmentRunner.submitDialog.confirm }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Leave confirmation -->
    <AlertDialog v-model:open="showLeaveDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t.student.assessmentRunner.leaveDialog.title }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{
              store.activeAttempt?.timeLimitSeconds
                ? t.student.assessmentRunner.leaveDialog.descriptionTimed
                : t.student.assessmentRunner.leaveDialog.description
            }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="pendingNavigation = null">
            {{ t.student.assessmentRunner.leaveDialog.stay }}
          </AlertDialogCancel>
          <AlertDialogAction @click="confirmLeave">
            {{ t.student.assessmentRunner.leaveDialog.leave }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
