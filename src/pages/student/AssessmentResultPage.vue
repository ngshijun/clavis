<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useStudentAssessmentsStore, type ReviewQuestion } from '@/stores/student-assessments'
import { useT } from '@/composables/useT'
import { formatDateTime } from '@/lib/date'
import { ArrowLeft, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import ReviewQuestionCard, {
  type ReviewCardQuestion,
} from '@/components/session/ReviewQuestionCard.vue'

const router = useRouter()
const route = useRoute()
const store = useStudentAssessmentsStore()
const t = useT()

/** Adapt a store ReviewQuestion to the shared deferred-feedback review card. */
function toCardQuestion(question: ReviewQuestion): ReviewCardQuestion {
  return {
    type: question.type,
    question: question.question,
    imagePath: question.imagePath,
    options: question.options.map((option) => ({
      number: option.number,
      text: option.text || null,
      imagePath: option.imagePath,
    })),
    selectedOptions: question.selectedOptions,
    textAnswer: question.textAnswer,
    answered: question.answered,
    isCorrect: question.isCorrect,
    points: question.points,
  }
}

onMounted(async () => {
  const attemptId = route.params.attemptId as string
  const { error } = await store.loadReview(attemptId)

  if (error) {
    // Owner access requires a completed attempt; anything else routes back.
    toast.error(error)
    router.replace('/student/assessments')
  }
})
</script>

<template>
  <div class="p-6">
    <!-- Loading -->
    <div v-if="store.isLoadingReview" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else-if="store.review">
      <!-- Header -->
      <div class="mb-6 flex items-center gap-3">
        <Button variant="outline" size="icon" @click="router.push('/student/assessments')">
          <ArrowLeft class="size-4" />
          <span class="sr-only">{{ t.student.assessmentResult.back }}</span>
        </Button>
        <div>
          <h1 class="text-2xl font-bold">
            {{ store.review.title || t.student.assessmentResult.title }}
          </h1>
          <p v-if="store.review.completedAt" class="text-sm text-muted-foreground">
            {{ t.student.assessmentResult.completedLabel }}:
            {{ formatDateTime(store.review.completedAt) }}
          </p>
        </div>
      </div>

      <!-- Score summary -->
      <Card class="mb-6">
        <CardContent class="flex flex-wrap items-center gap-x-10 gap-y-3 p-6">
          <div>
            <p class="text-sm text-muted-foreground">{{ t.student.assessmentResult.scoreLabel }}</p>
            <p class="text-3xl font-bold">{{ store.review.scorePercent }}%</p>
          </div>
          <div>
            <p class="text-sm text-muted-foreground">
              {{ t.student.assessmentResult.correctLabel }}
            </p>
            <p class="text-3xl font-bold">
              {{ store.review.correctCount
              }}<span class="text-lg font-medium text-muted-foreground"
                >/{{ store.review.totalQuestions }}</span
              >
            </p>
          </div>
          <p class="basis-full text-sm text-muted-foreground">
            {{ t.student.assessmentResult.keyHiddenNote }}
          </p>
        </CardContent>
      </Card>

      <!-- Per-question breakdown (correctness only — no answer key) -->
      <div class="space-y-4">
        <ReviewQuestionCard
          v-for="(question, index) in store.review.questions"
          :key="question.assessmentQuestionId"
          :question="toCardQuestion(question)"
          :index="index"
        />
      </div>
    </template>
  </div>
</template>
