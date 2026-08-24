<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { useRoute, useRouter } from 'vue-router'
import { usePracticeStore } from '@/stores/practice'
import {
  usePracticeHistoryStore,
  type PracticeSessionReview,
  type PracticeReviewQuestion,
} from '@/stores/practice-history'
import { useStudentSubTopicStatsStore } from '@/stores/student-sub-topic-stats'
import { useT } from '@/composables/useT'
import { parseSimpleMarkdown } from '@/lib/utils'
import { formatDateTime } from '@/lib/date'
import { starsForScore } from '@/lib/learningMap'
import ReviewQuestionCard, {
  type ReviewCardQuestion,
} from '@/components/session/ReviewQuestionCard.vue'
import SessionSummaryCards from '@/components/session/SessionSummaryCards.vue'
import StarRating from '@/components/student/StarRating.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Loader2, BotMessageSquare, RefreshCw, AlertCircle } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const practiceStore = usePracticeStore()
const historyStore = usePracticeHistoryStore()
const statsStore = useStudentSubTopicStatsStore()
const t = useT()
const { basePath } = useActiveClassroom()

const sessionId = computed(() => route.params.sessionId as string)
const review = ref<PracticeSessionReview | null>(null)
const isLoading = ref(true)
const notCompleted = ref(false)

const aiSummaryStatus = ref<'idle' | 'loading' | 'success' | 'failed'>('idle')
const isCurrentSession = ref(false)

// Stars for this session's score (decision 19: derived, never stored).
// get_session_result rounds the same way the DB stats upsert does, so these
// stars match what the map will show once the refetched stats arrive.
const sessionStars = computed(() => (review.value ? starsForScore(review.value.scorePercent) : 0))

// Best-so-far for this sub-topic, from the stats refetched after completion
const bestStats = computed(() =>
  review.value ? statsStore.getStats(review.value.subTopicId) : null,
)
const bestStars = computed(() =>
  bestStats.value ? starsForScore(bestStats.value.bestScorePercent) : 0,
)

/** Adapt a review question to the shared deferred-feedback review card. */
function toCardQuestion(question: PracticeReviewQuestion): ReviewCardQuestion {
  return {
    type: question.type,
    question: question.question,
    imagePath: question.imagePath,
    options: question.options,
    selectedOptions: question.selectedOptions,
    textAnswer: question.textAnswer,
    answered: question.answered,
    isCorrect: question.isCorrect,
    isDeleted: question.isDeleted,
    wrongOptionTips: question.wrongOptionTips,
  }
}

onMounted(async () => {
  const result = await historyStore.getSessionReview(sessionId.value)

  if (result.review) {
    review.value = result.review

    isCurrentSession.value = practiceStore.currentSession?.id === result.review.sessionId

    // Refetch map stats so best-so-far includes this completion (non-blocking;
    // the stars card fills in reactively when the fetch lands)
    void statsStore.fetchStats()

    if (result.review.aiSummary) {
      aiSummaryStatus.value = 'success'
    } else if (isCurrentSession.value) {
      generateAiSummary()
    }
  } else if (result.notCompleted) {
    // Results are deferred to completion (decision 40)
    notCompleted.value = true
  } else {
    router.replace(`${basePath.value}/statistics`)
  }
  isLoading.value = false
})

function goBack() {
  router.back()
}

function goToHistory() {
  router.push(`${basePath.value}/statistics`)
}

async function generateAiSummary() {
  if (!review.value || aiSummaryStatus.value === 'loading') return

  aiSummaryStatus.value = 'loading'
  const { summary, error } = await practiceStore.generateSessionSummary(review.value.sessionId)

  if (error || !summary) {
    aiSummaryStatus.value = 'failed'
    return
  }

  review.value.aiSummary = summary
  aiSummaryStatus.value = 'success'
}
</script>

<template>
  <div class="p-6">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else-if="review">
      <!-- Header -->
      <div class="mb-6">
        <Button variant="ghost" size="sm" class="mb-4" @click="goBack">
          <ArrowLeft class="mr-2 size-4" />
          {{ t.student.sessionResult.back }}
        </Button>

        <div class="flex flex-wrap items-center justify-between gap-4">
          <p class="text-muted-foreground">
            {{ review.subjectName }} - {{ review.topicName }} | {{ review.gradeLevelName }}
          </p>
        </div>
      </div>

      <!-- Stars earned this session + best-so-far for the sub-topic -->
      <Card
        class="mb-6 border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20"
      >
        <CardContent class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
          <div class="flex items-center gap-3">
            <StarRating :stars="sessionStars" size="md" />
            <div>
              <p class="text-sm font-semibold">
                {{ t.student.sessionResult.starsEarned(sessionStars) }}
              </p>
              <p class="text-xs text-muted-foreground">{{ review.subTopicName }}</p>
            </div>
          </div>
          <div v-if="bestStats" class="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{{ t.student.sessionResult.bestSoFar(bestStats.bestScorePercent) }}</span>
            <StarRating :stars="bestStars" size="sm" :arc="false" />
          </div>
        </CardContent>
      </Card>

      <!-- Summary Cards -->
      <SessionSummaryCards
        :score="review.scorePercent"
        :correct-answers="review.correctCount"
        :incorrect-answers="review.total - review.correctCount"
        :duration-seconds="review.durationSeconds"
      />

      <div class="mb-4 text-sm text-muted-foreground">
        {{ t.shared.sessionResultContent.completed(formatDateTime(review.completedAt)) }}
        · {{ t.student.sessionResult.keyHiddenNote }}
      </div>

      <!-- AI Summary -->
      <Card
        class="mb-6 border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20"
      >
        <CardHeader class="pb-2">
          <CardTitle
            class="flex items-center justify-between text-sm font-medium text-purple-700 dark:text-purple-300"
          >
            <div class="flex items-center gap-2">
              <BotMessageSquare class="size-4" />
              {{ t.student.sessionResult.aiSummaryTitle }}
            </div>
            <Button
              v-if="!review.aiSummary && aiSummaryStatus !== 'loading'"
              variant="outline"
              size="sm"
              class="h-7 text-xs"
              @click="generateAiSummary"
            >
              <RefreshCw class="mr-1 size-3" />
              {{
                aiSummaryStatus === 'failed'
                  ? t.student.sessionResult.aiSummaryRetry
                  : t.student.sessionResult.aiSummaryGenerate
              }}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            v-if="aiSummaryStatus === 'loading'"
            class="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 class="size-4 animate-spin" />
            {{ t.student.sessionResult.aiSummaryGenerating }}
          </div>
          <div
            v-else-if="review.aiSummary"
            class="text-sm leading-relaxed"
            v-html="parseSimpleMarkdown(review.aiSummary)"
          />
          <div
            v-else-if="aiSummaryStatus === 'failed' && isCurrentSession"
            class="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <AlertCircle class="size-4 text-red-500" />
            {{ t.student.sessionResult.aiSummaryFailed }}
          </div>
          <div v-else class="text-sm text-muted-foreground">
            {{ t.student.sessionResult.aiSummaryEmpty }}
          </div>
        </CardContent>
      </Card>

      <Separator class="mb-6" />

      <!-- Per-question breakdown: right/wrong + tips for wrongly-selected
           options; the correct answer is never revealed (decision 39) -->
      <div class="space-y-4">
        <h2 class="text-lg font-semibold">{{ t.shared.sessionResultContent.questionDetails }}</h2>

        <ReviewQuestionCard
          v-for="(question, index) in review.questions"
          :key="question.questionId ?? `deleted-${index}`"
          :question="toCardQuestion(question)"
          :index="index"
        />
      </div>
    </template>

    <!-- Session not finished yet -->
    <div v-else-if="notCompleted" class="py-12 text-center">
      <p class="text-muted-foreground">{{ t.student.sessionResult.resultsAfterCompletion }}</p>
      <Button class="mt-4" @click="goToHistory">{{
        t.student.sessionResult.goToStatistics
      }}</Button>
    </div>

    <!-- Empty State -->
    <div v-else class="py-12 text-center">
      <p class="text-muted-foreground">{{ t.student.sessionResult.sessionNotFound }}</p>
      <Button class="mt-4" @click="goToHistory">{{
        t.student.sessionResult.goToStatistics
      }}</Button>
    </div>
  </div>
</template>
